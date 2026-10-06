const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

// Load Chess.com ECO Opening Book
const ecoBook = new Set(JSON.parse(fs.readFileSync('eco_book_set.json', 'utf8')));

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

class DeepChessEnginePool {
    constructor(numWorkers = 3) {
        this.sfPath = path.join(__dirname, 'stockfish', 'stockfish-windows-x86-64-universal.exe');
        this.wasmPath = path.join(__dirname, 'explanation-engine.wasm');
        this.numWorkers = numWorkers;
    }

    async evaluatePositions(fens, depth = 16, multiPv = 3) {
        const workers = [];
        for (let i = 0; i < this.numWorkers; i++) {
            const proc = spawn(this.sfPath);
            proc.stdin.write('uci\n');
            proc.stdin.write('setoption name Threads value 2\n');
            proc.stdin.write('setoption name Hash value 64\n');
            proc.stdin.write('setoption name Skill Level value 20\n');
            proc.stdin.write(`setoption name MultiPV value ${multiPv}\n`);
            proc.stdin.write('isready\n');
            workers.push({ proc, busy: false });
        }

        await new Promise(r => setTimeout(r, 200));

        const queue = fens.map((fen, idx) => ({ fen, idx }));
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
                if (c.isCheckmate() || c.isDraw()) {
                    results[item.idx] = [];
                    completed++;
                    worker.busy = false;
                    assignNext(worker);
                    return;
                }

                const isWhiteTurn = item.fen.split(' ')[1] === 'w';
                let buffer = '';

                function onData(chunk) {
                    buffer += chunk.toString();
                    if (buffer.includes('bestmove')) {
                        worker.proc.stdout.removeListener('data', onData);
                        const curEval = [];

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

                        results[item.idx] = curEval.filter(Boolean);
                        completed++;
                        worker.busy = false;

                        if (completed % 25 === 0) {
                            console.log(`Evaluated ${completed} / ${fens.length} positions...`);
                        }

                        if (completed === fens.length) {
                            resolve();
                        } else {
                            assignNext(worker);
                        }
                    }
                }

                worker.proc.stdout.on('data', onData);
                worker.proc.stdin.write(`position fen ${item.fen}\n`);
                worker.proc.stdin.write(`go depth ${depth}\n`);
            }

            workers.forEach(w => assignNext(w));
        });

        workers.forEach(w => w.proc.stdin.write('quit\n'));
        return results;
    }

    async analyzeGame(gameData, depth = 16, multiPv = 3) {
        const chess = new Chess();
        const allFens = [chess.fen()];
        const gamePlies = [];

        for (let i = 0; i < gameData.moves.length; i++) {
            const m = gameData.moves[i];
            const legalMoves = chess.moves({ verbose: true });
            let matched = legalMoves.find(lm => (lm.from + lm.to + (lm.promotion || '')) === m.lan);
            if (!matched && m.fen) {
                const targetBoard = m.fen.split(' ')[0];
                matched = legalMoves.find(lm => {
                    const clone = new Chess(chess.fen());
                    clone.move(lm);
                    return clone.fen().split(' ')[0] === targetBoard;
                });
            }
            if (!matched && m.san) matched = legalMoves.find(lm => lm.san === m.san || lm.san.replace(/[+#x]/g, '') === m.san.replace(/[+#x]/g, ''));
            if (!matched) throw new Error('Unmatched move: ' + JSON.stringify(m));

            chess.move(matched);
            const afterFen = chess.fen();
            allFens.push(afterFen);

            // Theoretical opening book check via ecoBook
            const shortFen = afterFen.split(' ').slice(0, 3).join(' ');
            const isBook = ecoBook.has(shortFen);

            gamePlies.push({
                ply: i + 1,
                san: matched.san,
                lan: matched.from + matched.to + (matched.promotion || ''),
                isBook,
                official: m.classification
            });
        }

        console.log(`Analyzing game (${gamePlies.length} plies, Depth ${depth}, MultiPV ${multiPv})...`);
        const tSf = Date.now();
        const allEvals = await this.evaluatePositions(allFens, depth, multiPv);
        const sfTime = ((Date.now() - tSf) / 1000).toFixed(2);
        console.log(`Deep Stockfish pool completed in ${sfTime}s`);

        // Run CEE
        console.log('Sending evaluations to Chess.com CEE...');
        const tCee = Date.now();
        const whiteElo = gameData.players?.white?.rating || 1500;
        const blackElo = gameData.players?.black?.rating || 1500;

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
                        engine.postMessage('setoption name SpeechV3 value true');
                        engine.postMessage(`setoption name WhiteElo value ${whiteElo}`);
                        engine.postMessage(`setoption name BlackElo value ${blackElo}`);
                        engine.postMessage('setoption name UCI_Variant value chess');
                        engine.postMessage('setoption name UCI_Chess960 value false');
                        engine.postMessage(`setoption name DefaultNumVariations value ${multiPv}`);
                        engine.postMessage('position fen ' + allFens[0]);

                        for (const ev of allEvals[0] || []) {
                            if (!ev.pv || ev.pv.length === 0) continue;
                            if (ev.mateIn !== null) engine.postMessage(`variation ${ev.pv.join(' ')} mate ${ev.mateIn} depth ${ev.depth}`);
                            else engine.postMessage(`variation ${ev.pv.join(' ')} cp ${Math.round(ev.cp)} depth ${ev.depth}`);
                        }

                        for (let i = 0; i < gamePlies.length; i++) {
                            const ply = gamePlies[i];
                            engine.postMessage(`push ${ply.lan}${ply.isBook ? ' isBook' : ''}`);
                            const evalsAfter = allEvals[i + 1] || [];
                            for (const ev of evalsAfter) {
                                if (!ev.pv || ev.pv.length === 0) continue;
                                if (ev.mateIn !== null) engine.postMessage(`variation ${ev.pv.join(' ')} mate ${ev.mateIn} depth ${ev.depth}`);
                                else engine.postMessage(`variation ${ev.pv.join(' ')} cp ${Math.round(ev.cp)} depth ${ev.depth}`);
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
        console.log(`CEE completed in ${ceeTime}s`);

        let matches = 0;
        const diffs = [];
        ceeRes.positions.slice(1).forEach((p, idx) => {
            let pred = p.classificationName;
            if (pred === 'greatFind') pred = 'great';
            const off = gamePlies[idx].official;
            if (pred === off) {
                matches++;
            } else {
                diffs.push({
                    ply: idx + 1,
                    san: gamePlies[idx].san,
                    calc: pred,
                    official: off,
                    diff: p.difference,
                    caps2: p.caps2?.toFixed(1)
                });
            }
        });

        return {
            sfTime,
            ceeTime,
            matches,
            totalPlies: gamePlies.length,
            accuracyWhiteCalc: ceeRes.CAPS?.white?.all ?? 0,
            accuracyWhiteOfficial: gameData.accuracies?.white ?? gameData.players?.white?.accuracy,
            accuracyBlackCalc: ceeRes.CAPS?.black?.all ?? 0,
            accuracyBlackOfficial: gameData.accuracies?.black ?? gameData.players?.black?.accuracy,
            talliesCalc: ceeRes.tallies,
            talliesOfficial: gameData.tallies,
            diffs
        };
    }
}

async function run() {
    const gameData = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_172014464516.json', 'utf8'));
    const engine = new DeepChessEnginePool(3);
    const r = await engine.analyzeGame(gameData, 16, 3);

    console.log('\n================ DEEP ENGINE RESULTS ================');
    console.log(`White Accuracy: ${r.accuracyWhiteCalc.toFixed(1)}% (Official: ${r.accuracyWhiteOfficial}%) -> Diff: ${Math.abs(r.accuracyWhiteCalc - r.accuracyWhiteOfficial).toFixed(1)}%`);
    console.log(`Black Accuracy: ${r.accuracyBlackCalc.toFixed(1)}% (Official: ${r.accuracyBlackOfficial}%) -> Diff: ${Math.abs(r.accuracyBlackCalc - r.accuracyBlackOfficial).toFixed(1)}%`);
    console.log(`Classification Matches: ${r.matches} / ${r.totalPlies} (${(r.matches / r.totalPlies * 100).toFixed(1)}%)`);
    console.log('Remaining Diffs:', r.diffs.length);
    console.table(r.diffs);
}

run().catch(console.error);
