const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

// Load Canonical Chess.com ECO Opening Database (53,970 positions with ECO code, name, and URL slug)
const ecoMapPath = path.join(__dirname, 'eco_map_compact.json');
const ecoMap = fs.existsSync(ecoMapPath) ? JSON.parse(fs.readFileSync(ecoMapPath, 'utf8')) : {};
const ecoBookPath = path.join(__dirname, 'eco_book_set.json');
const ecoBook = Object.keys(ecoMap).length > 0
    ? new Set(Object.keys(ecoMap))
    : (fs.existsSync(ecoBookPath) ? new Set(JSON.parse(fs.readFileSync(ecoBookPath, 'utf8'))) : new Set());

// Load Authoritative 2026 Chess.com Move Classification Tree
const {
    classifyMove,
    winExpectancy,
    calculateDeltaE,
    caps2MoveAccuracy
} = require('./src/engine/classificationTree.ts');



const UCI_TOKENS = {
    depth: 1, seldepth: 1, time: 1, nodes: 1, multipv: 1, cp: 1, mate: 1,
    currmovenumber: 1, hashfull: 1, nps: 1, tbhits: 1, sbhits: 1, cpuload: 1,
    score: 2, lowerbound: 2, upperbound: 2,
    bestmove: 3, ponder: 3,
    pv: 4, pvSan: 4, string: 4, refutation: 4, currline: 4
};

function parseUciLine(line) {
    const tokens = line.trim().split(/\s+/);
    if (!tokens.length) return null;
    const mtype = tokens[0];
    const res = { mtype };
    let i = mtype === 'info' ? 1 : 0;
    while (i < tokens.length) {
        const tok = tokens[i];
        const type = UCI_TOKENS[tok];
        if (type === 1) {
            i++;
            if (i < tokens.length) res[tok] = Number(tokens[i]);
        } else if (type === 2) {
            res[tok] = true;
        } else if (type === 3) {
            i++;
            if (i < tokens.length) res[tok] = tokens[i];
        } else if (type === 4) {
            res[tok] = [];
            i++;
            while (i < tokens.length && !UCI_TOKENS[tokens[i]]) {
                res[tok].push(tokens[i]);
                i++;
            }
            continue;
        }
        i++;
    }
    return res;
}

class ChessReviewEngine {
    constructor(numWorkers = Math.min(4, require('os').cpus().length || 2)) {
        this.sfPath = path.join(__dirname, 'stockfish', 'stockfish-windows-x86-64-universal.exe');
        this.wasmPath = path.join(__dirname, 'explanation-engine.wasm');
        this.numWorkers = numWorkers;
    }

    async evaluatePositionsPool(fens, depth = 18, multiPv = 2, targetMoves = [], onProgress = null) {
        const workers = [];
        for (let i = 0; i < this.numWorkers; i++) {
            const proc = spawn(this.sfPath);
            proc.stdin.write('uci\n');
            proc.stdin.write('setoption name Threads value 1\n');
            proc.stdin.write('setoption name Hash value 16\n');
            proc.stdin.write('setoption name Skill Level value 20\n');
            proc.stdin.write(`setoption name MultiPV value ${multiPv}\n`);
            proc.stdin.write('isready\n');
            workers.push({ proc, busy: false });
        }

        await new Promise(r => setTimeout(r, 200));

        const queue = fens.map((fen, idx) => ({ fen, idx, playedLan: targetMoves[idx] }));
        const results = new Array(fens.length);

        await new Promise((resolve) => {
            let completed = 0;

            function assignNext(worker) {
                if (queue.length === 0) {
                    if (completed === fens.length) resolve();
                    return;
                }
                const item = queue.shift();
                worker.busy = true;

                const c = new Chess(item.fen);
                if (c.isGameOver()) {
                    results[item.idx] = [];
                    completed++;
                    worker.busy = false;
                    if (onProgress) {
                        try {
                            onProgress({
                                completed,
                                total: fens.length,
                                idx: item.idx,
                                fen: item.fen,
                                playedLan: item.playedLan
                            });
                        } catch {}
                    }
                    if (completed % 15 === 0 || completed === fens.length) {
                        console.log(`[ReviewPipeline] Evaluated ${completed}/${fens.length} positions...`);
                    }
                    if (completed === fens.length) {
                        resolve();
                    } else {
                        assignNext(worker);
                    }
                    return;
                }

                const isWhiteTurn = item.fen.split(' ')[1] === 'w';
                let buffer = '';
                let onTargetFn = null;
                let itemDone = false;
                let curEval = [];

                function finishItem() {
                    if (itemDone) return;
                    itemDone = true;
                    clearTimeout(itemTimer);
                    worker.proc.stdout.removeListener('data', onData);
                    if (onTargetFn) worker.proc.stdout.removeListener('data', onTargetFn);

                    results[item.idx] = (curEval || []).filter(Boolean);
                    completed++;
                    worker.busy = false;
                    if (onProgress) {
                        try {
                            onProgress({
                                completed,
                                total: fens.length,
                                idx: item.idx,
                                fen: item.fen,
                                playedLan: item.playedLan
                            });
                        } catch {}
                    }

                    if (completed % 15 === 0 || completed === fens.length) {
                        console.log(`[ReviewPipeline] Evaluated ${completed}/${fens.length} positions...`);
                    }

                    if (completed === fens.length) {
                        resolve();
                    } else {
                        assignNext(worker);
                    }
                }

                const itemTimer = setTimeout(() => {
                    try { worker.proc.stdin.write('stop\n'); } catch {}
                    finishItem();
                }, 3500);

                function onData(chunk) {
                    buffer += chunk.toString();
                    if (buffer.includes('bestmove')) {
                        worker.proc.stdout.removeListener('data', onData);
                        curEval = [];

                        for (const line of buffer.split('\n')) {
                            if (!line.startsWith('info depth')) continue;
                            const parsed = parseUciLine(line);
                            if (!parsed || !parsed.pv || !parsed.multipv) continue;
                            if (parsed.upperbound || parsed.lowerbound) continue;

                            const mateIn = parsed.mate !== undefined ? (isWhiteTurn ? parsed.mate : -parsed.mate) : null;
                            let cp = parsed.cp !== undefined ? (isWhiteTurn ? parsed.cp : -parsed.cp) : null;
                            if (cp !== null && Math.abs(cp) === 9) cp = 0;

                            const slot = parsed.multipv - 1;
                            curEval[slot] = {
                                pv: parsed.pv,
                                cp,
                                mateIn,
                                depth: parsed.depth
                            };
                        }

                        // Targeted search for played move if not present in curEval
                        const hasPlayedMove = item.playedLan ? curEval.some(ev => ev && ev.pv && ev.pv[0] === item.playedLan) : true;
                        if (!hasPlayedMove && item.playedLan) {
                            let targetBuf = '';
                            onTargetFn = function(tChunk) {
                                targetBuf += tChunk.toString();
                                if (targetBuf.includes('bestmove')) {
                                    worker.proc.stdout.removeListener('data', onTargetFn);
                                    let latestTargetEval = null;
                                    for (const tLine of targetBuf.split('\n')) {
                                        if (!tLine.startsWith('info depth')) continue;
                                        const tParsed = parseUciLine(tLine);
                                        if (!tParsed || !tParsed.pv || tParsed.upperbound || tParsed.lowerbound) continue;
                                        const mateIn = tParsed.mate !== undefined ? (isWhiteTurn ? tParsed.mate : -tParsed.mate) : null;
                                        let cp = tParsed.cp !== undefined ? (isWhiteTurn ? tParsed.cp : -tParsed.cp) : null;
                                        if (cp !== null && Math.abs(cp) === 9) cp = 0;
                                        latestTargetEval = {
                                            pv: tParsed.pv,
                                            cp,
                                            mateIn,
                                            depth: tParsed.depth
                                        };
                                    }
                                    if (latestTargetEval) {
                                        curEval.push(latestTargetEval);
                                    }
                                    finishItem(curEval);
                                }
                            };
                            worker.proc.stdout.on('data', onTargetFn);
                            worker.proc.stdin.write(`position fen ${item.fen}\n`);
                            worker.proc.stdin.write(`go depth ${depth} movetime 1500 searchmoves ${item.playedLan}\n`);
                        } else {
                            finishItem(curEval);
                        }
                    }
                }

                worker.proc.stdout.on('data', onData);
                worker.proc.stdin.write(`position fen ${item.fen}\n`);
                worker.proc.stdin.write(`go depth ${depth} movetime 1500\n`);
            }

            workers.forEach(w => assignNext(w));
        });

        workers.forEach(w => {
            try {
                w.proc.stdin.write('quit\n');
                setTimeout(() => {
                    if (!w.proc.killed) w.proc.kill();
                }, 300);
            } catch {
                if (!w.proc.killed) w.proc.kill();
            }
        });
        return results;
    }

    async analyzeGame({ pgn, moves, startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', whiteElo = 1500, blackElo = 1500, depth = 18, multiPv = 2, onProgress = null }) {
        const t0 = Date.now();

        // 1. Reconstruct positions and moves
        const chess = new Chess(startFen);
        if (pgn) {
            let cleanPgn = pgn.replace(/\r\n/g, '\n').trim();
            const lastTag = cleanPgn.lastIndexOf(']');
            if (lastTag !== -1 && lastTag < cleanPgn.length - 1) {
                const hdrs = cleanPgn.slice(0, lastTag + 1);
                const body = cleanPgn.slice(lastTag + 1).trim();
                cleanPgn = hdrs + '\n\n' + body;
            }
            try {
                chess.loadPgn(cleanPgn);
            } catch (e) {
                try {
                    const stripped = cleanPgn.replace(/\{[^}]*\}/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\$\d+/g, ' ');
                    chess.loadPgn(stripped);
                } catch (e2) {
                    const moveText = cleanPgn.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\([^)]*\)/g, ' ');
                    const tokens = moveText.split(/\s+/).filter(t => t && !/^\d+\.?$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
                    const replay = new Chess(startFen);
                    for (const tok of tokens) {
                        try {
                            const res = replay.move(tok);
                            if (!res) break;
                        } catch {
                            break;
                        }
                    }
                    if (replay.history().length > 0) {
                        chess.loadPgn(replay.pgn());
                    } else {
                        console.warn('loadPgn failed and fallback exhausted:', e.message);
                    }
                }
            }
        }

        let headerEco = null;
        let headerEcoUrl = null;
        let headerOpeningName = null;
        if (pgn) {
            const ecoMatch = pgn.match(/\[ECO\s+"([^"]+)"\]/);
            if (ecoMatch) headerEco = ecoMatch[1];
            const ecoUrlMatch = pgn.match(/\[ECOUrl\s+"([^"]+)"\]/);
            if (ecoUrlMatch) {
                headerEcoUrl = ecoUrlMatch[1];
                const slug = headerEcoUrl.split('/openings/')[1] || headerEcoUrl.split('/').pop();
                if (slug) {
                    headerOpeningName = slug.replace(/(\d+)-([a-zA-Z])/g, (m, p1, p2) => p1 + '.' + p2).replace(/-/g, ' ');
                }
            }
        }

        const gamePlies = [];
        const allFens = [startFen];
        let resolvedOpening = headerEco ? {
            c: headerEco,
            n: headerOpeningName || headerEco,
            u: headerEcoUrl || ''
        } : null;
        let resolvedOpeningPly = 0;

        if (pgn && chess.history().length > 0) {
            const history = chess.history({ verbose: true });
            const cReplay = new Chess(startFen);
            let inBook = true;
            for (let i = 0; i < history.length; i++) {
                const m = history[i];
                const legalMoves = cReplay.moves({ verbose: true });
                const numLegal = legalMoves.length;
                const beforeFen = cReplay.fen();
                cReplay.move(m);
                const afterFen = cReplay.fen();
                allFens.push(afterFen);

                const shortFen = afterFen.split(' ').slice(0, 3).join(' ');
                if (!headerEco && ecoMap[shortFen]) {
                    resolvedOpening = ecoMap[shortFen];
                    resolvedOpeningPly = i + 1;
                }
                if (inBook && !ecoBook.has(shortFen)) {
                    inBook = false;
                }
                const isBook = inBook;

                gamePlies.push({
                    ply: i + 1,
                    san: m.san,
                    lan: m.from + m.to + (m.promotion || ''),
                    beforeFen,
                    afterFen,
                    color: m.color === 'w' ? 'white' : 'black',
                    numLegal,
                    isBook
                });
            }
        } else if (moves && moves.length > 0) {
            const cReplay = new Chess(startFen);
            let inBook = true;
            for (let i = 0; i < moves.length; i++) {
                const m = moves[i];
                const legalMoves = cReplay.moves({ verbose: true });
                const numLegal = legalMoves.length;
                let matched = null;
                if (m.lan) matched = legalMoves.find(lm => (lm.from + lm.to + (lm.promotion || '')) === m.lan);
                if (!matched && m.fen) {
                    const targetBoard = m.fen.split(' ')[0];
                    matched = legalMoves.find(lm => {
                        const clone = new Chess(cReplay.fen());
                        clone.move(lm);
                        return clone.fen().split(' ')[0] === targetBoard;
                    });
                }
                if (!matched && m.san) matched = legalMoves.find(lm => lm.san === m.san || lm.san.replace(/[+#x]/g, '') === m.san.replace(/[+#x]/g, ''));
                if (!matched) throw new Error(`Cannot match move at ply ${i + 1}: ${JSON.stringify(m)}`);

                const beforeFen = cReplay.fen();
                cReplay.move(matched);
                const afterFen = cReplay.fen();
                allFens.push(afterFen);

                const shortFen = afterFen.split(' ').slice(0, 3).join(' ');
                if (!headerEco && ecoMap[shortFen]) {
                    resolvedOpening = ecoMap[shortFen];
                    resolvedOpeningPly = i + 1;
                }
                if (inBook && !ecoBook.has(shortFen)) {
                    inBook = false;
                }
                const isBook = inBook;

                gamePlies.push({
                    ply: i + 1,
                    san: matched.san,
                    lan: matched.from + matched.to + (matched.promotion || ''),
                    beforeFen,
                    afterFen,
                    color: matched.color === 'w' ? 'white' : 'black',
                    numLegal,
                    isBook
                });
            }
        } else {
            throw new Error('No moves or PGN provided for analysis');
        }

        console.log(`[ReviewPipeline] Analyzing ${allFens.length} positions with Deep Stockfish Pool (depth ${depth}, multiPV ${multiPv}, ${this.numWorkers} workers)...`);
        const targetMoves = gamePlies.map(p => p.lan);
        const crypto = require('crypto');
        const gameHash = crypto.createHash('md5').update(allFens.join('|')).digest('hex');
        const cacheDir = path.join(__dirname, '.eval_cache');
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        const cachePath = path.join(cacheDir, `pool_${gameHash}_d${depth}_mpv${multiPv}.json`);

        let allEvals;
        if (fs.existsSync(cachePath)) {
            console.log(`[ReviewPipeline] Loaded cached Stockfish evaluations (${allFens.length} positions).`);
            allEvals = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (onProgress) {
                try {
                    onProgress({
                        completed: allFens.length,
                        total: allFens.length,
                        stage: 'Evaluations ready',
                        elapsedSeconds: 0,
                        etaSeconds: 0,
                        speed: allFens.length
                    });
                } catch {}
            }
        } else {
            const tPoolStart = Date.now();
            allEvals = await this.evaluatePositionsPool(allFens, depth, multiPv, targetMoves, (p) => {
                if (onProgress) {
                    try {
                        const elapsed = Math.max(0.1, (Date.now() - tPoolStart) / 1000);
                        const rate = p.completed > 0 ? p.completed / elapsed : 0;
                        const remaining = p.total - p.completed;
                        const eta = rate > 0 ? Math.round(remaining / rate) : undefined;
                        const plyIdx = p.idx;
                        const currentPly = plyIdx > 0 && gamePlies[plyIdx - 1] ? gamePlies[plyIdx - 1] : null;

                        onProgress({
                            completed: p.completed,
                            total: p.total,
                            san: currentPly ? currentPly.san : undefined,
                            color: currentPly ? (currentPly.color === 'white' ? 'w' : 'b') : undefined,
                            fen: p.fen,
                            stage: p.completed < 8 ? 'Opening Book Recognition' : p.completed > p.total - 10 ? 'Endgame Conversion' : 'Middlegame Tactical Evaluation',
                            elapsedSeconds: Math.round(elapsed),
                            etaSeconds: eta,
                            speed: Number(rate.toFixed(1))
                        });
                    } catch {}
                }
            });
            fs.writeFileSync(cachePath, JSON.stringify(allEvals));
        }
        const evalTime = ((Date.now() - t0) / 1000).toFixed(2);
        console.log(`[ReviewPipeline] Stockfish evaluation finished in ${evalTime}s.`);

        if (onProgress) {
            try {
                const elapsed = Math.round((Date.now() - t0) / 1000);
                onProgress({
                    completed: allFens.length,
                    total: allFens.length,
                    stage: 'Calculating CAPS2 Accuracy & Coach Feedback',
                    elapsedSeconds: elapsed,
                    etaSeconds: 1,
                    speed: 0
                });
            } catch {}
        }

        // 2. Run CEE batch analysis
        console.log(`[ReviewPipeline] Classifying entire game with Chess.com CEE in single batch...`);
        const tCee = Date.now();
        const ceeRes = await new Promise((resolve, reject) => {
            const engine = KOMODO_TEP(this.wasmPath, {
                onKomodoTepInitialized: () => {
                    engine.postMessage('uci');
                    engine.postMessage('isready');
                },
                onmessage: (msg) => {
                    if (typeof msg !== 'string') return;
                    if (msg.startsWith('readyok')) {
                        engine.postMessage('setoption name ScoreWhiteToMove value true');
                        engine.postMessage('setoption name SerializeLikeCEAC value true');
                        engine.postMessage('setoption name SerializeBoardEvents value true');
                        engine.postMessage('setoption name ClassificationV3 value true');
                        engine.postMessage('setoption name SpeechV3 value false');
                        engine.postMessage('setoption name CoachAssetsV2 value false');
                        engine.postMessage('setoption name Language value en_US');
                        engine.postMessage(`setoption name WhiteElo value ${whiteElo}`);
                        engine.postMessage(`setoption name BlackElo value ${blackElo}`);
                        engine.postMessage('setoption name UCI_Variant value chess');
                        engine.postMessage('setoption name UCI_Chess960 value false');
                        engine.postMessage('setoption name DefaultNumVariations value 2');
                        engine.postMessage(`position fen ${allFens[0]}`);

                        for (const ev of allEvals[0] || []) {
                            if (!ev || !ev.pv || ev.pv.length === 0) continue;
                            const pvStr = ev.pv.join(' ');
                            if (ev.mateIn !== null && ev.mateIn !== undefined) {
                                engine.postMessage(`variation ${pvStr} mate ${ev.mateIn} depth ${ev.depth}`);
                            } else if (ev.cp !== null && ev.cp !== undefined) {
                                engine.postMessage(`variation ${pvStr} cp ${Math.round(ev.cp)} depth ${ev.depth}`);
                            }
                        }

                        for (let i = 0; i < gamePlies.length; i++) {
                            const ply = gamePlies[i];
                            engine.postMessage(`push ${ply.lan}${ply.isBook ? ' isBook' : ''}`);
                            const evalsAfter = allEvals[i + 1] || [];
                            for (const ev of evalsAfter) {
                                if (!ev || !ev.pv || ev.pv.length === 0) continue;
                                const pvStr = ev.pv.join(' ');
                                if (ev.mateIn !== null && ev.mateIn !== undefined) {
                                    engine.postMessage(`variation ${pvStr} mate ${ev.mateIn} depth ${ev.depth}`);
                                } else if (ev.cp !== null && ev.cp !== undefined) {
                                    engine.postMessage(`variation ${pvStr} cp ${Math.round(ev.cp)} depth ${ev.depth}`);
                                }
                            }
                        }

                        engine.postMessage('fetch analysis');
                    } else if (msg.startsWith('json')) {
                        resolve(JSON.parse(msg.slice(5)));
                    } else if (msg.includes('CEEError')) {
                        reject(new Error(msg));
                    }
                }
            });
        });

        const ceeTime = ((Date.now() - tCee) / 1000).toFixed(2);
        console.log(`[ReviewPipeline] CEE classification finished in ${ceeTime}s.`);

        // 3. Format classified moves using Authoritative 2026 Expected Points Model
        const classifiedMoves = [];
        const rawPositions = ceeRes.positions || [];
        let lastMoveClassification = undefined;

        function getEvalCp(ev) {
            if (!ev) return 0;
            if (ev.mateIn !== null && ev.mateIn !== undefined) {
                if (ev.mateIn > 0) return 100000 - ev.mateIn * 100;
                if (ev.mateIn < 0) return -100000 - Math.abs(ev.mateIn) * 100;
                return 100000;
            }
            return ev.cp !== null && ev.cp !== undefined ? ev.cp : 0;
        }

        for (let i = 0; i < gamePlies.length; i++) {
            const ply = gamePlies[i];
            const pos = rawPositions[i + 1] || {};
            const isWhite = ply.color === 'white';
            const playerElo = isWhite ? whiteElo : blackElo;

            // Score before and after move (from player's perspective)
            const evBefore = allEvals[i]?.[0];
            const evBefore2 = allEvals[i]?.[1];
            const evAfter = allEvals[i + 1]?.[0];

            const playerScoreBefore = getEvalCp(evBefore);
            const playerScoreAfter = -getEvalCp(evAfter);
            const secondBestScore = evBefore2 ? getEvalCp(evBefore2) : undefined;
            const isBestMove = Boolean(evBefore?.pv?.[0] && evBefore.pv[0] === ply.lan);

            // Piece count for endgame / sacrifice evaluation
            const chessAfter = new Chess(ply.afterFen);
            let piecesCount = 0;
            for (const row of chessAfter.board()) {
                for (const sq of row) {
                    if (sq && sq.type !== 'k') piecesCount++;
                }
            }

            const res = classifyMove({
                playerScoreBefore,
                playerScoreAfter,
                playerRating: playerElo,
                isBestMove,
                isBookMove: Boolean(ply.isBook),
                isForced: ply.numLegal === 1,
                isSacrifice: pos.classificationName === 'brilliant',
                piecesCount,
                opponentPreviousRating: lastMoveClassification,
                secondBestScore,
                san: ply.san,
                bookComment: ply.isBook ? (ply.opening?.name || 'Standard opening book move.') : undefined
            });

            const classification = res.classification;
            const difference = res.deltaE;
            const caps2 = res.accuracy;
            const comment = res.comment;
            lastMoveClassification = classification;

            const score = isWhite ? (playerScoreAfter / 100) : (-playerScoreAfter / 100);
            const bestMoveLan = allEvals[i]?.[0]?.pv?.[0] || pos.bestMove?.moveLan || ply.lan;

            classifiedMoves.push({
                ply: ply.ply,
                color: ply.color,
                san: ply.san,
                lan: ply.lan,
                fen: ply.afterFen,
                classification,
                rawClassification: pos.classificationName,
                eval: score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2),
                caps2,
                difference,
                comment,
                bestMoveLan
            });
        }

        // Clean up tallies directly from classifiedMoves
        const computeTallies = (moves, color) => {
            const counts = {
                brilliant: 0,
                great: 0,
                best: 0,
                excellent: 0,
                good: 0,
                inaccuracy: 0,
                mistake: 0,
                miss: 0,
                blunder: 0,
                book: 0
            };
            for (const m of moves) {
                if (m.color !== color) continue;
                let c = (m.classification || '').toLowerCase();
                if (c === 'last book') c = 'book';
                if (c === 'great_find' || c === 'great find') c = 'great';
                if (c === 'incorrect') c = 'miss';
                if (c === 'forced') c = 'best';
                if (counts[c] !== undefined) counts[c]++;
            }
            return counts;
        };

        const whiteTallies = computeTallies(classifiedMoves, 'white');
        const blackTallies = computeTallies(classifiedMoves, 'black');

        // Calculate overall CAPS2 player game accuracy
        const calculatePlayerAccuracy = (moves, color) => {
            const playerMoves = moves.filter(m => m.color === color);
            if (playerMoves.length === 0) return 100.0;
            
            const nonBookMoves = playerMoves.filter(m => m.classification !== 'book' && m.classification !== 'forced');
            if (nonBookMoves.length === 0) return 100.0;
            const totalScore = nonBookMoves.reduce((s, m) => s + (m.caps2 !== undefined ? m.caps2 : 100), 0);
            return Number(Math.max(0, Math.min(100, totalScore / nonBookMoves.length)).toFixed(1));
        };

        const whiteAccuracy = calculatePlayerAccuracy(classifiedMoves, 'white');
        const blackAccuracy = calculatePlayerAccuracy(classifiedMoves, 'black');

        // Universal Single-Game Performance Rating per Article 10773754
        const calculateGameRating = (color, acc, elo, tallyObj) => {
            const tallies = tallyObj || {};
            const playerElo = elo || 1500;
            const expectedAcc = Math.min(95, Math.max(55, 68 + (playerElo - 1000) * 0.015));
            const deltaAcc = (acc - expectedAcc) * 26;
            const deltaErr = -((tallies.blunder || 0) * 110) - ((tallies.mistake || 0) * 45) - ((tallies.miss || 0) * 25);
            const performance = playerElo + deltaAcc + deltaErr;
            return Math.max(100, Math.min(3200, Math.round(performance / 50) * 50));
        };

        const whiteRating = calculateGameRating('white', whiteAccuracy, whiteElo, whiteTallies);
        const blackRating = calculateGameRating('black', blackAccuracy, blackElo, blackTallies);

        const totalTime = ((Date.now() - t0) / 1000).toFixed(2);
        console.log(`[ReviewPipeline] Full review completed in ${totalTime}s! White: ${whiteAccuracy}%, Black: ${blackAccuracy}%, Game Rating: W=${whiteRating}, B=${blackRating}\n`);

        return {
            opening: resolvedOpening ? {
                code: resolvedOpening.c,
                name: resolvedOpening.n,
                url: resolvedOpening.u,
                ply: resolvedOpeningPly
            } : null,
            accuracies: {
                white: whiteAccuracy,
                black: blackAccuracy
            },
            capsBreakdown: ceeRes.CAPS,
            tallies: {
                white: whiteTallies,
                black: blackTallies
            },
            performanceRatings: {
                white: whiteRating,
                black: blackRating
            },
            gamePhases: ceeRes.gamePhases,
            moves: classifiedMoves,
            executionTime: {
                stockfish: evalTime,
                cee: ceeTime,
                total: totalTime
            }
        };
    }
}

module.exports = { ChessReviewEngine };
