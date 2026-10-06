const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

class PerfectReviewPipeline {
    constructor() {
        this.sfPath = path.join(__dirname, 'stockfish', 'stockfish-windows-x86-64-universal.exe');
        this.netPath = path.join(__dirname, 'stockfish', 'nn-61e7af4bb97d.nnue').replace(/\\/g, '/');
        this.wasmPath = path.join(__dirname, 'explanation-engine.wasm');
    }

    async evaluatePositions(fens, depth = 14) {
        return new Promise((resolve, reject) => {
            const sf = spawn(this.sfPath);
            sf.stdin.write('uci\n');
            sf.stdin.write('setoption name Threads value 4\n');
            sf.stdin.write('setoption name Hash value 128\n');
            sf.stdin.write('setoption name MultiPV value 2\n');
            sf.stdin.write('isready\n');

            const results = [];
            let curIdx = 0;
            let buffer = '';

            const sendNext = () => {
                if (curIdx >= fens.length) {
                    sf.stdin.write('quit\n');
                    resolve(results);
                    return;
                }

                const fen = fens[curIdx];
                const c = new Chess(fen);
                if (c.isCheckmate() || c.isDraw()) {
                    const isWhiteTurn = fen.split(' ')[1] === 'w';
                    results.push([{
                        pv: [],
                        cp: c.isCheckmate() ? (isWhiteTurn ? -31800 : 31800) : 0,
                        mate: c.isCheckmate() ? 0 : null,
                        depth: 0
                    }]);
                    curIdx++;
                    sendNext();
                    return;
                }

                buffer = '';
                sf.stdin.write(`position fen ${fen}\n`);
                sf.stdin.write(`go depth ${depth}\n`);
            };

            sf.stdout.on('data', (d) => {
                buffer += d.toString();
                if (buffer.includes('bestmove')) {
                    const fen = fens[curIdx];
                    const isWhiteTurn = fen.split(' ')[1] === 'w';
                    const pvs = {};
                    for (const l of buffer.split('\n')) {
                        if (!l.startsWith('info depth')) continue;
                        const pvIdx = l.indexOf(' pv ');
                        if (pvIdx === -1) continue;
                        const mpvMatch = l.match(/\bmultipv\s+(\d+)/);
                        const depthMatch = l.match(/\bdepth\s+(\d+)/);
                        const cpMatch = l.match(/\bscore cp (-?\d+)/);
                        const mateMatch = l.match(/\bscore mate (-?\d+)/);

                        const mpv = mpvMatch ? parseInt(mpvMatch[1], 10) : 1;
                        const d = depthMatch ? parseInt(depthMatch[1], 10) : depth;
                        const pvMoves = l.slice(pvIdx + 4).trim().split(/\s+/);

                        let cp = 0;
                        let mate = null;
                        if (mateMatch) {
                            mate = parseInt(mateMatch[1], 10);
                            if (!isWhiteTurn) mate = -mate;
                        } else if (cpMatch) {
                            const rawCp = parseInt(cpMatch[1], 10);
                            cp = isWhiteTurn ? rawCp : -rawCp;
                        }
                        pvs[mpv] = { pv: pvMoves, cp, mate, depth: d };
                    }
                    results.push(Object.values(pvs));
                    curIdx++;
                    sendNext();
                }
            });

            sf.on('error', reject);
            setTimeout(sendNext, 200);
        });
    }

    async analyzeGame({ moves, startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', whiteElo = 1500, blackElo = 1500, depth = 14 }) {
        const t0 = Date.now();

        // 1. Reconstruct moves
        const chess = new Chess(startFen);
        const gamePlies = [];
        const allFens = [chess.fen()];

        for (let i = 0; i < moves.length; i++) {
            const m = moves[i];
            const legalMoves = chess.moves({ verbose: true });
            let matched = null;
            if (m.lan) matched = legalMoves.find(lm => (lm.from + lm.to + (lm.promotion || '')) === m.lan);
            if (!matched && m.fen) {
                const targetBoard = m.fen.split(' ')[0];
                matched = legalMoves.find(lm => {
                    const clone = new Chess(chess.fen());
                    clone.move(lm);
                    return clone.fen().split(' ')[0] === targetBoard;
                });
            }
            if (!matched && m.san) matched = legalMoves.find(lm => lm.san === m.san || lm.san.replace(/[+#x]/g, '') === m.san.replace(/[+#x]/g, ''));
            if (!matched) throw new Error('Cannot match ply ' + (i + 1));

            chess.move(matched);
            const lan = matched.from + matched.to + (matched.promotion || '');
            allFens.push(chess.fen());
            gamePlies.push({
                ply: i + 1,
                san: matched.san,
                lan,
                isBook: m.isBook || m.classification === 'book' || m.classification === 'last book',
                officialClassification: m.classification
            });
        }

        // 2. Evaluate positions with Stockfish
        const allEvals = await this.evaluatePositions(allFens, depth);
        const evalTime = ((Date.now() - t0) / 1000).toFixed(2);

        // 3. Batch CEE review
        const tCeeStart = Date.now();
        const ceeResult = await new Promise((resolve, reject) => {
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
                        engine.postMessage('position fen ' + allFens[0]);

                        // Initial position variations
                        for (const ev of allEvals[0] || []) {
                            if (!ev.pv || ev.pv.length === 0) continue;
                            const pvStr = ev.pv.join(' ');
                            if (ev.mate !== null) {
                                engine.postMessage(`variation ${pvStr} mate ${ev.mate} depth ${ev.depth}`);
                            } else {
                                engine.postMessage(`variation ${pvStr} cp ${ev.cp} depth ${ev.depth}`);
                            }
                        }

                        // Moves and subsequent variations
                        for (let i = 0; i < gamePlies.length; i++) {
                            const ply = gamePlies[i];
                            engine.postMessage(`push ${ply.lan}${ply.isBook ? ' isBook' : ''}`);
                            const evalsAfter = allEvals[i + 1] || [];
                            for (const ev of evalsAfter) {
                                if (!ev.pv || ev.pv.length === 0) continue;
                                const pvStr = ev.pv.join(' ');
                                if (ev.mate !== null) {
                                    engine.postMessage(`variation ${pvStr} mate ${ev.mate} depth ${ev.depth}`);
                                } else {
                                    engine.postMessage(`variation ${pvStr} cp ${ev.cp} depth ${ev.depth}`);
                                }
                            }
                        }

                        engine.postMessage('fetch analysis');
                    } else if (msg.startsWith('json')) {
                        const data = JSON.parse(msg.slice(5));
                        resolve(data);
                    } else if (msg.includes('CEEError')) {
                        reject(new Error(msg));
                    }
                }
            });
        });

        const totalTime = ((Date.now() - t0) / 1000).toFixed(2);
        return {
            evalTime,
            totalTime,
            ceeResult,
            gamePlies,
            allEvals
        };
    }
}

async function testBothGames() {
    const pipeline = new PerfectReviewPipeline();

    for (const gameId of ['172014464516', '171853838612']) {
        const gameData = JSON.parse(fs.readFileSync(`review_data/move_by_move_reviews/review_${gameId}.json`, 'utf8'));
        console.log(`\n======================================================`);
        console.log(`RUNNING AUTHENTIC PIPELINE ON GAME ${gameId} (${gameData.moves.length} plies)...`);
        console.log(`======================================================`);

        const res = await pipeline.analyzeGame({
            moves: gameData.moves,
            whiteElo: gameData.players?.white?.rating || 1500,
            blackElo: gameData.players?.black?.rating || 1500,
            depth: 14
        });

        console.log(`Completed in ${res.totalTime}s (Stockfish: ${res.evalTime}s, CEE: ${((res.totalTime - res.evalTime)).toFixed(2)}s)`);
        console.log('CAPS:', res.ceeResult.CAPS);
        console.log('Official White Acc:', gameData.accuracies.white, 'Official Black Acc:', gameData.accuracies.black);
        console.log('White Tallies:', JSON.stringify(res.ceeResult.tallies.white));
        console.log('Official White Tallies:', JSON.stringify(Object.fromEntries(
            Object.entries(gameData.tallies).map(([k, v]) => [k, v.white])
        )));
        console.log('Black Tallies:', JSON.stringify(res.ceeResult.tallies.black));
        console.log('Official Black Tallies:', JSON.stringify(Object.fromEntries(
            Object.entries(gameData.tallies).map(([k, v]) => [k, v.black])
        )));

        let matches = 0;
        const diffs = [];
        res.ceeResult.positions.slice(1).forEach((p, idx) => {
            let pred = p.classificationName;
            if (pred === 'greatFind') pred = 'great';
            const actual = res.gamePlies[idx].officialClassification;
            if (pred === actual) {
                matches++;
            } else {
                diffs.push({
                    ply: idx + 1,
                    san: res.gamePlies[idx].san,
                    pred,
                    actual,
                    diff: p.difference,
                    caps2: p.caps2
                });
            }
        });

        console.log(`Exact Classification Parity: ${matches} / ${res.gamePlies.length} (${(matches / res.gamePlies.length * 100).toFixed(1)}%)`);
        if (diffs.length > 0) {
            console.log(`Diff count: ${diffs.length}, sample:`, diffs.slice(0, 5));
        }
    }
}

testBothGames().catch(console.error);
