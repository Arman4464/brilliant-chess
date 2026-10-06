const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

const gameData = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_172014464516.json', 'utf8'));

const chess = new Chess();
const moves = [];
for (let i = 0; i < gameData.moves.length; i++) {
    const m = gameData.moves[i];
    const legalMoves = chess.moves({ verbose: true });
    const targetBoard = m.fen.split(' ')[0];
    const matched = legalMoves.find(lm => {
        const clone = new Chess(chess.fen());
        clone.move(lm);
        return clone.fen().split(' ')[0] === targetBoard;
    });
    if (!matched) {
        console.error('Failed to match move at index', i);
        process.exit(1);
    }
    chess.move(matched);
    const lan = matched.from + matched.to + (matched.promotion || '');
    let cp = 0;
    let mateIn = null;
    if (m.eval) {
        if (m.eval.startsWith('M')) {
            mateIn = parseInt(m.eval.slice(1), 10);
        } else {
            cp = Math.round(parseFloat(m.eval) * 100);
        }
    }
    moves.push({
        lan,
        san: matched.san,
        classification: m.classification,
        cp,
        mateIn,
        isBook: m.classification === 'book' || m.classification === 'last book'
    });
}

console.log('Prepared ' + moves.length + ' moves. Initializing KOMODO_TEP...');

const engine = KOMODO_TEP(path.join(__dirname, 'explanation-engine.wasm'), {
    onKomodoTepInitialized: () => {
        console.log('KomodoTep initialized! Sending uci and isready...');
        engine.postMessage('uci');
        engine.postMessage('isready');
    },
    onmessage: (msg) => {
        if (typeof msg !== 'string') return;
        if (msg.startsWith('readyok')) {
            console.log('Received readyok! Sending options and moves...');
            engine.postMessage('setoption name ScoreWhiteToMove value true');
            engine.postMessage('setoption name SerializeLikeCEAC value true');
            engine.postMessage('setoption name WhiteElo value 1400');
            engine.postMessage('setoption name BlackElo value 1300');
            engine.postMessage('position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            
            // Root variation
            engine.postMessage('variation ' + moves[0].lan + ' cp 26 depth 14');
            
            for (let i = 0; i < moves.length; i++) {
                const m = moves[i];
                engine.postMessage('push ' + m.lan + (m.isBook ? ' isBook' : ''));
                if (m.mateIn !== null) {
                    engine.postMessage('variation ' + m.lan + ' mate ' + m.mateIn + ' depth 14');
                } else {
                    engine.postMessage('variation ' + m.lan + ' cp ' + m.cp + ' depth 14');
                }
            }
            
            console.log('All moves pushed! Fetching analysis...');
            engine.postMessage('fetch analysis');
        } else if (msg.startsWith('json')) {
            console.log('Analysis received successfully!');
            const res = JSON.parse(msg.slice(5));
            console.log('CAPS Result:', res.CAPS);
            console.log('Tallies Result:', JSON.stringify(res.tallies, null, 2));
            
            let matches = 0;
            const details = [];
            res.positions.slice(1).forEach((p, idx) => {
                const actual = moves[idx].classification;
                const predicted = p.classificationName;
                const match = actual === predicted;
                if (match) matches++;
                details.push({
                    ply: idx + 1,
                    lan: moves[idx].lan,
                    actual,
                    predicted,
                    match
                });
            });
            console.log('TOTAL MATCHES: ' + matches + ' / ' + moves.length + ' (' + (matches / moves.length * 100).toFixed(1) + '%)');
            fs.writeFileSync('cee_benchmark_result.json', JSON.stringify({
                accuracies: res.CAPS,
                tallies: res.tallies,
                matches,
                total: moves.length,
                details
            }, null, 2));
            process.exit(0);
        } else if (msg.includes('CEEError')) {
            console.error('CEE Error:', msg);
            process.exit(1);
        }
    }
});
