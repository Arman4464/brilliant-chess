const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const StockfishFactory = require('./stockfish-19-lite-single.js');
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

// 2. Evaluate positions using Chess.com's Stockfish 19 Lite WASM
async function evaluateAllPositions(depth = 14) {
    console.log(`Evaluating positions with Chess.com Stockfish 19 Lite WASM (depth ${depth}, multiPV 2)...`);
    const sfWasmPath = path.join(__dirname, 'stockfish-19-lite-single.wasm');
    const createEngine = StockfishFactory();

    return new Promise((resolve, reject) => {
        let curIdx = 0;
        const results = [];
        let pvs = {};
        let send = null;

        function sendNext() {
            if (curIdx >= allFens.length) {
                if (send) send('quit');
                resolve(results);
                return;
            }
            if (send) {
                send(`position fen ${allFens[curIdx]}`);
                send(`go depth ${depth}`);
            }
        }

        createEngine({
            locateFile: () => sfWasmPath,
            listener: (l) => {
                if (curIdx >= allFens.length) return;
                if (l.startsWith('info depth')) {
                    const pvIdx = l.indexOf(' pv ');
                    if (pvIdx !== -1) {
                        const mpvMatch = l.match(/\bmultipv\s+(\d+)/);
                        const depthMatch = l.match(/\bdepth\s+(\d+)/);
                        const cpMatch = l.match(/\bscore cp (-?\d+)/);
                        const mateMatch = l.match(/\bscore mate (-?\d+)/);
                        const mpv = mpvMatch ? parseInt(mpvMatch[1], 10) : 1;
                        const d = depthMatch ? parseInt(depthMatch[1], 10) : depth;
                        const pvMoves = l.slice(pvIdx + 4).trim().split(/\s+/);
                        const isWhiteTurn = (allFens[curIdx] || '').split(' ')[1] === 'w';

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
                } else if (l.includes('bestmove')) {
                    results.push(Object.values(pvs));
                    curIdx++;
                    pvs = {};
                    sendNext();
                }
            }
        }).then(mod => {
            send = (cmd) => { mod.ccall('command', null, ['string'], [cmd]); };
            send('uci');
            send('setoption name Hash value 64');
            send('setoption name MultiPV value 2');
            send('isready');
            sendNext();
        }).catch(reject);
    });
}

async function main() {
    const t0 = Date.now();
    const allEvals = await evaluateAllPositions(14);
    const evalTime = ((Date.now() - t0)/1000).toFixed(2);
    console.log(`Stockfish WASM evaluation completed in ${evalTime}s.`);

    console.log('Sending evaluations to Chess.com CEE WASM...');
    const ceeWasmPath = path.join(__dirname, 'explanation-engine.wasm');
    const engine = KOMODO_TEP(ceeWasmPath, {
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

                // For each move: push, then variations after the move
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
                console.log(`PURE CHESS.COM ENGINE STACK RESULT (${totalTime}s)`);
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

                console.log(`Exact Parity: ${matches} / ${gamePlies.length} (${(matches / gamePlies.length * 100).toFixed(1)}%)`);
                console.log('Differences count:', diffs.length);
                process.exit(0);
            } else if (msg.includes('CEEError')) {
                console.error('CEE Error:', msg);
                process.exit(1);
            }
        }
    });
}

main().catch(console.error);
