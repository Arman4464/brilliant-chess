const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

const gameData = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_172014464516.json', 'utf8'));

// 1. Reconstruct all positions
const chess = new Chess();
const gamePlies = [];
const allFens = [chess.fen()];

for (let i = 0; i < gameData.moves.length; i++) {
    const m = gameData.moves[i];
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
        isBook: m.classification === 'book' || m.classification === 'last book',
        officialClassification: m.classification
    });
}

console.log(`Reconstructed ${gamePlies.length} plies.`);

// 2. Evaluate all positions with Native Stockfish + Chess.com NNUE network
async function evaluateAllPositions(depth = 16) {
    console.log(`Evaluating ${allFens.length} positions with Native Stockfish 19 (depth ${depth}, multiPV 2, net nn-61e7af4bb97d)...`);
    const sfPath = path.join(__dirname, 'stockfish', 'stockfish-windows-x86-64-universal.exe');
    const netPath = path.join(__dirname, 'stockfish', 'nn-61e7af4bb97d.nnue').replace(/\\/g, '/');
    const sf = spawn(sfPath);

    sf.stdin.write('uci\n');
    sf.stdin.write('setoption name Threads value 4\n');
    sf.stdin.write('setoption name Hash value 128\n');
    sf.stdin.write('setoption name MultiPV value 2\n');
    sf.stdin.write(`setoption name EvalFile value ${netPath}\n`);
    sf.stdin.write('isready\n');

    const results = [];
    let curIdx = 0;
    let buffer = '';

    return new Promise((resolve, reject) => {
        const sendNext = () => {
            if (curIdx >= allFens.length) {
                sf.kill();
                resolve(results);
                return;
            }
            buffer = '';
            sf.stdin.write(`position fen ${allFens[curIdx]}\n`);
            sf.stdin.write(`go depth ${depth}\n`);
        };

        sf.stdout.on('data', d => {
            buffer += d.toString();
            if (buffer.includes('bestmove')) {
                const fen = allFens[curIdx];
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

async function main() {
    const t0 = Date.now();
    const allEvals = await evaluateAllPositions(16);
    const evalTime = ((Date.now() - t0)/1000).toFixed(2);
    console.log(`Stockfish evaluations completed in ${evalTime}s.`);

    console.log('Running CEE batch classification...');
    const wasmPath = path.join(__dirname, 'explanation-engine.wasm');
    const engine = KOMODO_TEP(wasmPath, {
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
                engine.postMessage('setoption name WhiteElo value 1400');
                engine.postMessage('setoption name BlackElo value 1300');
                engine.postMessage('setoption name UCI_Variant value chess');
                engine.postMessage('setoption name UCI_Chess960 value false');
                engine.postMessage('position fen ' + allFens[0]);

                // Initial position variations (evals[0])
                for (const ev of allEvals[0]) {
                    const pvStr = ev.pv.join(' ');
                    if (ev.mate !== null) {
                        engine.postMessage(`variation ${pvStr} mate ${ev.mate} depth ${ev.depth}`);
                    } else {
                        engine.postMessage(`variation ${pvStr} cp ${ev.cp} depth ${ev.depth}`);
                    }
                }

                // For each move: push played move, then variations after the move
                for (let i = 0; i < gamePlies.length; i++) {
                    const ply = gamePlies[i];
                    engine.postMessage(`push ${ply.lan}${ply.isBook ? ' isBook' : ''}`);
                    const evalsAfter = allEvals[i + 1] || [];
                    for (const ev of evalsAfter) {
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
                const totalTime = ((Date.now() - t0)/1000).toFixed(2);
                const res = JSON.parse(msg.slice(5));
                console.log(`\n========================================`);
                console.log(`ANALYSIS COMPLETED IN ${totalTime}s!`);
                console.log('CAPS Result:', res.CAPS);
                console.log('White Tallies:', JSON.stringify(res.tallies.white));
                console.log('Black Tallies:', JSON.stringify(res.tallies.black));

                let matches = 0;
                const diffs = [];
                res.positions.slice(1).forEach((p, idx) => {
                    let pred = p.classificationName;
                    if (pred === 'greatFind') pred = 'great';
                    const actual = gamePlies[idx].officialClassification;
                    if (pred === actual) {
                        matches++;
                    } else {
                        diffs.push({
                            ply: idx + 1,
                            san: gamePlies[idx].san,
                            pred,
                            actual,
                            diff: p.difference,
                            caps2: p.caps2
                        });
                    }
                });

                console.log(`Move-by-Move Parity: ${matches} / ${gamePlies.length} (${(matches / gamePlies.length * 100).toFixed(1)}%)`);
                console.log('\nDifferences:', JSON.stringify(diffs, null, 2));
                process.exit(0);
            } else if (msg.includes('CEEError')) {
                console.error('CEE Error:', msg);
                process.exit(1);
            }
        }
    });
}

main().catch(console.error);
