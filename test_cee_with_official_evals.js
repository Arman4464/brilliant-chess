const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

async function testWithOfficialEvals() {
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

        // Parse official eval
        let cp = 0;
        let mate = null;
        if (m.eval) {
            if (m.eval.startsWith('M')) {
                mate = parseInt(m.eval.slice(1), 10);
                if (m.color === 'black') mate = -mate;
            } else if (m.eval.startsWith('-M')) {
                mate = -parseInt(m.eval.slice(2), 10);
                if (m.color === 'black') mate = -mate;
            } else {
                cp = Math.round(parseFloat(m.eval) * 100);
            }
        }

        gamePlies.push({
            ply: i + 1,
            san: matched.san,
            lan,
            isBook: m.classification === 'book' || m.classification === 'last book',
            officialClassification: m.classification,
            cp,
            mate
        });
    }

    console.log(`Testing CEE with game's actual official evaluations across ${gamePlies.length} plies...`);

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

                    // Start position variation
                    engine.postMessage(`variation e2e4 cp 20 depth 14`);

                    for (let i = 0; i < gamePlies.length; i++) {
                        const ply = gamePlies[i];
                        engine.postMessage(`push ${ply.lan}${ply.isBook ? ' isBook' : ''}`);
                        if (ply.mate !== null) {
                            engine.postMessage(`variation dummy mate ${ply.mate} depth 14`);
                        } else {
                            engine.postMessage(`variation dummy cp ${ply.cp} depth 14`);
                        }
                    }

                    engine.postMessage('fetch analysis');
                } else if (msg.startsWith('json')) {
                    const res = JSON.parse(msg.slice(5));
                    console.log('\n=== CEE WITH OFFICIAL EVALS ===');
                    console.log('CAPS:', res.CAPS);
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

testWithOfficialEvals().catch(console.error);
