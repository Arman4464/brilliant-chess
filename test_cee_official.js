const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

async function testLegalMoves() {
    const gameData = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_172014464516.json', 'utf8'));
    const chess = new Chess();
    const gamePlies = [];

    for (let i = 0; i < gameData.moves.length; i++) {
        const m = gameData.moves[i];
        const legal = chess.moves({ verbose: true });
        let matched = legal.find(lm => (lm.from + lm.to + (lm.promotion || '')) === m.lan);
        if (!matched && m.fen) {
            const target = m.fen.split(' ')[0];
            matched = legal.find(lm => {
                const c = new Chess(chess.fen());
                c.move(lm);
                return c.fen().split(' ')[0] === target;
            });
        }
        if (!matched && m.san) matched = legal.find(lm => lm.san === m.san || lm.san.replace(/[+#x]/g, '') === m.san.replace(/[+#x]/g, ''));
        const lan = matched.from + matched.to + (matched.promotion || '');
        chess.move(matched);

        let cp = 0, mate = null;
        if (m.eval) {
            if (m.eval.startsWith('M')) mate = parseInt(m.eval.slice(1), 10);
            else if (m.eval.startsWith('-M')) mate = -parseInt(m.eval.slice(2), 10);
            else cp = Math.round(parseFloat(m.eval) * 100);
        }

        const nextLegal = chess.moves({ verbose: true });
        const samplePv = nextLegal.length > 0 ? (nextLegal[0].from + nextLegal[0].to + (nextLegal[0].promotion || '')) : '';

        gamePlies.push({
            ply: i + 1,
            san: matched.san,
            lan,
            isBook: m.classification === 'book' || m.classification === 'last book',
            official: m.classification,
            cp,
            mate,
            samplePv
        });
    }

    console.log(`Parsed ${gamePlies.length} plies.`);

    const engine = KOMODO_TEP(path.join(__dirname, 'explanation-engine.wasm'), {
        onKomodoTepInitialized: () => {
            console.log('CEE Initialized! Sending uci & isready');
            engine.postMessage('uci');
            engine.postMessage('isready');
        },
        onmessage: (msg) => {
            if (typeof msg !== 'string') return;
            console.log('CEE msg:', msg.slice(0, 50));
            if (msg.startsWith('readyok')) {
                console.log('Sending game parameters to CEE...');
                engine.postMessage('setoption name ScoreWhiteToMove value true');
                engine.postMessage('setoption name SerializeLikeCEAC value true');
                engine.postMessage('setoption name SerializeBoardEvents value true');
                engine.postMessage('setoption name ClassificationV3 value true');
                engine.postMessage('setoption name SpeechV3 value true');
                engine.postMessage('setoption name WhiteElo value 1400');
                engine.postMessage('setoption name BlackElo value 1300');
                engine.postMessage('position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
                engine.postMessage('variation e2e4 cp 20 depth 14');

                for (let i = 0; i < gamePlies.length; i++) {
                    const p = gamePlies[i];
                    engine.postMessage(`push ${p.lan}${p.isBook ? ' isBook' : ''}`);
                    if (p.samplePv) {
                        if (p.mate !== null) {
                            engine.postMessage(`variation ${p.samplePv} mate ${p.mate} depth 14`);
                        } else {
                            engine.postMessage(`variation ${p.samplePv} cp ${p.cp} depth 14`);
                        }
                    }
                }
                console.log('Sent all plies, sending fetch analysis...');
                engine.postMessage('fetch analysis');
            } else if (msg.startsWith('json')) {
                const res = JSON.parse(msg.slice(5));
                console.log('\n================ CEE RESULTS ================');
                console.log('White CAPS:', res.CAPS?.white?.all, 'Official:', gameData.accuracies.white);
                console.log('Black CAPS:', res.CAPS?.black?.all, 'Official:', gameData.accuracies.black);
                let matches = 0;
                const diffs = [];
                res.positions.slice(1).forEach((p, idx) => {
                    let pred = p.classificationName;
                    if (pred === 'greatFind') pred = 'great';
                    if (pred === gamePlies[idx].official) {
                        matches++;
                    } else {
                        diffs.push({
                            ply: idx + 1,
                            san: gamePlies[idx].san,
                            calc: pred,
                            official: gamePlies[idx].official,
                            diff: p.difference
                        });
                    }
                });
                console.log(`Matches: ${matches} / ${gamePlies.length} (${(matches / gamePlies.length * 100).toFixed(1)}%)`);
                console.log('Diffs:', diffs.slice(0, 20));
                [48, 54, 58, 64].forEach(idx => {
                    console.log(`\n=== DETAIL PLY ${idx} (${gamePlies[idx-1].san}) ===`);
                    console.log('Official:', gamePlies[idx-1].official);
                    console.log('CEE:', JSON.stringify(res.positions[idx], null, 2));
                });
                process.exit(0);
            }
        }
    });
}
testLegalMoves().catch(console.error);
