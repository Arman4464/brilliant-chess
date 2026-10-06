const fs = require('fs');
const path = require('path');
const { ChessReviewEngine } = require('./review_pipeline.js');

async function dumpAllMoves() {
    const engine = new ChessReviewEngine(4);
    const games = ['184653017586', '171608609212', '114104460147', '172014464516', '171853838612', '165803154362'];
    const dataset = [];

    for (const id of games) {
        const d = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_' + id + '.json', 'utf8'));
        const r = await engine.analyzeGame({ moves: d.moves, depth: 18, multiPv: 2 });
        r.moves.forEach((m, idx) => {
            const off = d.moves[idx];
            let rawCee = m.rawClassification;
            if (rawCee === 'greatFind') rawCee = 'great';
            if (m.classification === 'forced') rawCee = 'forced';
            if (m.classification === 'book' || m.classification === 'last book') rawCee = m.classification;

            dataset.push({
                gameId: id,
                ply: m.ply,
                san: m.san,
                lan: m.lan,
                color: m.color,
                rawCee: rawCee || 'best',
                diff: Number((m.difference || 0).toFixed(2)),
                caps2: Number((m.caps2 || 0).toFixed(1)),
                eval: Number((parseFloat(m.eval) || 0).toFixed(2)),
                official: off.classification,
                officialEval: off.eval
            });
        });
    }

    fs.writeFileSync('all_510_moves.json', JSON.stringify(dataset, null, 2));
    console.log(`Successfully dumped ${dataset.length} moves to all_510_moves.json`);
}

dumpAllMoves().catch(console.error);
