const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

const ecoBookPath = path.join(__dirname, 'eco_book_set.json');
const ecoBook = new Set(JSON.parse(fs.readFileSync(ecoBookPath, 'utf8')));

async function testGame(id) {
    const data = JSON.parse(fs.readFileSync(`review_data/move_by_move_reviews/review_${id}.json`, 'utf8'));
    const chess = new Chess();
    const gamePlies = [];
    const allFens = [chess.fen()];

    let inBook = true;
    for (let i = 0; i < data.moves.length; i++) {
        const m = data.moves[i];
        const legalMoves = chess.moves({ verbose: true });
        let matched = null;
        if (m.lan) matched = legalMoves.find(lm => (lm.from + lm.to + (lm.promotion || '')) === m.lan);
        if (!matched && m.fen) {
            const tb = m.fen.split(' ')[0];
            matched = legalMoves.find(lm => {
                const clone = new Chess(chess.fen());
                clone.move(lm);
                return clone.fen().split(' ')[0] === tb;
            });
        }
        if (!matched && m.san) matched = legalMoves.find(lm => lm.san === m.san || lm.san.replace(/[+#x]/g, '') === m.san.replace(/[+#x]/g, ''));
        if (!matched) throw new Error(`Unmatched ply ${i+1}`);

        const numLegal = legalMoves.length;
        chess.move(matched);
        const lan = matched.from + matched.to + (matched.promotion || '');
        const afterFen = chess.fen();
        allFens.push(afterFen);

        const shortFen = afterFen.split(' ').slice(0, 3).join(' ');
        if (inBook && !ecoBook.has(shortFen)) {
            inBook = false;
        }

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
            numLegal,
            isBook: inBook,
            officialClass: m.classification,
            officialEval: m.eval,
            cp,
            mate
        });
    }

    console.log(`Reconstructed ${gamePlies.length} plies for Game ${id}.`);

    // Run CEE with official evaluations
    const wasmPath = path.join(__dirname, 'explanation-engine.wasm');
    return new Promise((resolve, reject) => {
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
                    engine.postMessage('setoption name CoachAssetsV2 value true');
                    engine.postMessage('setoption name WhiteElo value ' + (data.players?.white?.rating || 1500));
                    engine.postMessage('setoption name BlackElo value ' + (data.players?.black?.rating || 1500));
                    engine.postMessage('setoption name UCI_Variant value chess');
                    engine.postMessage('setoption name UCI_Chess960 value false');
                    engine.postMessage('position fen ' + allFens[0]);

                    // Root variation
                    engine.postMessage(`variation ${gamePlies[0].lan} cp ${gamePlies[0].cp} depth 18`);

                    for (let i = 0; i < gamePlies.length; i++) {
                        const ply = gamePlies[i];
                        engine.postMessage(`push ${ply.lan}${ply.isBook ? ' isBook' : ''}`);
                        const nextPly = gamePlies[i + 1];
                        if (nextPly) {
                            if (nextPly.mate !== null) {
                                engine.postMessage(`variation ${nextPly.lan} mate ${nextPly.mate} depth 18`);
                            } else {
                                engine.postMessage(`variation ${nextPly.lan} cp ${nextPly.cp} depth 18`);
                            }
                        } else {
                            // Last ply
                            const cLast = new Chess(allFens[i + 1]);
                            const leg = cLast.moves({ verbose: true });
                            if (leg.length > 0) {
                                const m0 = leg[0].from + leg[0].to + (leg[0].promotion || '');
                                engine.postMessage(`variation ${m0} cp ${ply.cp} depth 18`);
                            }
                        }
                    }

                    engine.postMessage('fetch analysis');
                } else if (msg.startsWith('json')) {
                    const res = JSON.parse(msg.slice(5));
                    let matches = 0;
                    const diffs = [];
                    res.positions.slice(1).forEach((p, idx) => {
                        let pred = p.classificationName;
                        if (gamePlies[idx].numLegal === 1) {
                            pred = 'forced';
                        } else if (gamePlies[idx].isBook) {
                            const nextIsBook = (idx + 1 < gamePlies.length) && gamePlies[idx + 1].isBook;
                            pred = nextIsBook ? 'book' : 'last book';
                        }
                        if (pred === 'greatFind') pred = 'great';

                        const actual = gamePlies[idx].officialClass;
                        if (pred === actual) {
                            matches++;
                        } else {
                            diffs.push({
                                ply: idx + 1,
                                san: gamePlies[idx].san,
                                pred,
                                actual,
                                diff: p.difference,
                                caps2: p.caps2,
                                eval: gamePlies[idx].officialEval
                            });
                        }
                    });

                    const totalPlies = gamePlies.length;
                    const pct = (matches / totalPlies * 100).toFixed(1);
                    console.log(`\n========================================`);
                    console.log(`Game ${id} Parity: ${matches} / ${totalPlies} (${pct}%)`);
                    console.log(`Diffs count: ${diffs.length}`);
                    console.table(diffs);
                    resolve({ matches, total: totalPlies, pct });
                } else if (msg.includes('CEEError')) {
                    reject(new Error(msg));
                }
            }
        });
    });
}

testGame('184653017586').catch(console.error);
