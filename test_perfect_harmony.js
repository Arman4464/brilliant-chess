const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

const gameData = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_172014464516.json', 'utf8'));

// 1. Reconstruct game plies and positions
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
        officialClassification: m.classification,
        officialEval: m.eval
    });
}

// 2. Load Stockfish evals
const allEvals = JSON.parse(fs.readFileSync('sf_evals_cache_172014464516.json', 'utf8'));

console.log('Running Authentic Chess.com CEE Pipeline with PV Continuation Linking...');

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

            // Initial position candidate variations
            for (const ev of allEvals[0]) {
                const pvStr = ev.pv.join(' ');
                if (ev.mate !== null) {
                    engine.postMessage(`variation ${pvStr} mate ${ev.mate} depth ${ev.depth}`);
                } else {
                    engine.postMessage(`variation ${pvStr} cp ${ev.cp} depth ${ev.depth}`);
                }
            }

            // For each move:
            for (let i = 0; i < gamePlies.length; i++) {
                const ply = gamePlies[i];
                engine.postMessage(`push ${ply.lan}${ply.isBook ? ' isBook' : ''}`);

                // Check if played move matches MultiPV 1 or MultiPV 2 in the BEFORE position
                const beforeEvals = allEvals[i] || [];
                const matchedPv = beforeEvals.find(ev => ev.pv && ev.pv[0] === ply.lan);

                if (matchedPv && matchedPv.pv.length > 1) {
                    // Played move is in the engine's principal variation!
                    // Continuation is the rest of the PV with the exact parent eval!
                    const contPv = matchedPv.pv.slice(1).join(' ');
                    if (matchedPv.mate !== null) {
                        engine.postMessage(`variation ${contPv} mate ${matchedPv.mate} depth ${matchedPv.depth}`);
                    } else {
                        engine.postMessage(`variation ${contPv} cp ${matchedPv.cp} depth ${matchedPv.depth}`);
                    }
                } else {
                    // Played move was not the top PV, use evaluations of the position after the move
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
            }

            engine.postMessage('fetch analysis');
        } else if (msg.startsWith('json')) {
            const res = JSON.parse(msg.slice(5));
            console.log('\n=== PARITY REPORT ===');
            console.log('CAPS Accuracies:', res.CAPS);
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
            console.log('\nRemaining differences:', JSON.stringify(diffs, null, 2));
            process.exit(0);
        } else if (msg.includes('CEEError')) {
            console.error('CEE Error:', msg);
            process.exit(1);
        }
    }
});
