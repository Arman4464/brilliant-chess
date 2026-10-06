const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

async function testOfficialStack() {
    const gameData = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_172014464516.json', 'utf8'));

    // 1. Reconstruct game
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

    console.log(`Reconstructed ${gamePlies.length} plies across ${allFens.length} positions.`);

    // 2. Evaluate positions with Stockfish 19 Lite WASM
    console.log('Evaluating all positions with Chess.com Stockfish 19 Lite WASM...');
    const tEvalStart = Date.now();

    const sf = spawn('node', ['stockfish-19-lite-single.js']);
    sf.stdin.write('uci\n');
    sf.stdin.write('setoption name MultiPV value 2\n');
    sf.stdin.write('isready\n');

    const allEvals = [];
    let curFenIdx = 0;
    let buffer = '';

    await new Promise((resolve, reject) => {
        const sendNext = () => {
            if (curFenIdx >= allFens.length) {
                sf.stdin.write('quit\n');
                resolve();
                return;
            }
            buffer = '';
            sf.stdin.write(`position fen ${allFens[curFenIdx]}\n`);
            sf.stdin.write(`go depth 14\n`);
        };

        sf.stdout.on('data', (d) => {
            buffer += d.toString();
            if (buffer.includes('bestmove')) {
                const fen = allFens[curFenIdx];
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
                    const depth = depthMatch ? parseInt(depthMatch[1], 10) : 14;
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
                    pvs[mpv] = { pv: pvMoves, cp, mate, depth };
                }
                allEvals.push(Object.values(pvs));
                curFenIdx++;
                sendNext();
            }
        });

        sf.on('error', reject);
        setTimeout(sendNext, 400);
    });

    console.log(`Evaluated ${allEvals.length} positions in ${((Date.now() - tEvalStart) / 1000).toFixed(2)}s.`);

    // 3. Run CEE
    console.log('Sending to Chess.com CEE...');
    const tCeeStart = Date.now();
    const wasmPath = path.join(__dirname, 'explanation-engine.wasm');

    await new Promise((resolve, reject) => {
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

                    for (const ev of allEvals[0]) {
                        const pvStr = ev.pv.join(' ');
                        if (ev.mate !== null) {
                            engine.postMessage(`variation ${pvStr} mate ${ev.mate} depth ${ev.depth}`);
                        } else {
                            engine.postMessage(`variation ${pvStr} cp ${ev.cp} depth ${ev.depth}`);
                        }
                    }

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
                    console.log(`CEE finished in ${((Date.now() - tCeeStart) / 1000).toFixed(2)}s!`);
                    const res = JSON.parse(msg.slice(5));

                    console.log('\n=== CAPS ACCURACY ===');
                    console.log('Calculated:', res.CAPS);
                    console.log('Official White:', gameData.accuracies.white, 'Official Black:', gameData.accuracies.black);

                    console.log('\n=== TALLIES ===');
                    console.log('White Calculated:', JSON.stringify(res.tallies.white));
                    console.log('White Official:', JSON.stringify(Object.fromEntries(
                        Object.entries(gameData.tallies).map(([k, v]) => [k, v.white])
                    )));
                    console.log('Black Calculated:', JSON.stringify(res.tallies.black));
                    console.log('Black Official:', JSON.stringify(Object.fromEntries(
                        Object.entries(gameData.tallies).map(([k, v]) => [k, v.black])
                    )));

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

                    console.log(`\nExact Parity: ${matches} / ${gamePlies.length} (${(matches / gamePlies.length * 100).toFixed(1)}%)`);
                    if (diffs.length > 0) {
                        console.log('Differences:', JSON.stringify(diffs, null, 2));
                    }
                    resolve();
                } else if (msg.includes('CEEError')) {
                    reject(new Error(msg));
                }
            }
        });
    });
}

testOfficialStack().catch(console.error);
