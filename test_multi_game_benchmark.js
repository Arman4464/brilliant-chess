const fs = require('fs');
const path = require('path');
const { ChessReviewEngine } = require('./review_pipeline.js');

async function runBenchmark() {
    const testGames = [
        '172014464516',
        '171853838612',
        '114104460147',
        '165803154362'
    ];

    const engine = new ChessReviewEngine(3);
    console.log(`=== RUNNING MULTI-GAME DEEP BENCHMARK ACROSS ${testGames.length} GAMES ===\n`);

    for (const id of testGames) {
        const file = `review_data/move_by_move_reviews/review_${id}.json`;
        if (!fs.existsSync(file)) continue;
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));

        console.log(`Analyzing Game #${id} (${data.moves.length} plies) with Deep Pool (Depth 16, MultiPV 3, ECO Book)...`);
        const r = await engine.analyzeGame({
            moves: data.moves,
            whiteElo: data.players?.white?.rating || 1500,
            blackElo: data.players?.black?.rating || 1500,
            depth: 16,
            multiPv: 3
        });

        // Compute exact classification parity against official
        let matches = 0;
        const diffs = [];
        r.moves.forEach((m, idx) => {
            const off = data.moves[idx].classification;
            if (m.classification === off) {
                matches++;
            } else {
                diffs.push({
                    ply: m.ply,
                    san: m.san,
                    calc: m.classification,
                    official: off,
                    diff: m.difference,
                    caps2: m.caps2
                });
            }
        });

        const totalPlies = r.moves.length;
        const parityPct = (matches / totalPlies * 100).toFixed(1);
        const whiteOff = data.accuracies?.white ?? data.players?.white?.accuracy;
        const blackOff = data.accuracies?.black ?? data.players?.black?.accuracy;

        console.log(`✓ Completed in ${r.executionTime.total}s (Stockfish: ${r.executionTime.stockfish}s, CEE: ${r.executionTime.cee}s)`);
        console.log(`  White Accuracy: ${r.accuracies.white}% (Official: ${whiteOff}%) -> Diff: ${Math.abs(r.accuracies.white - whiteOff).toFixed(1)}%`);
        console.log(`  Black Accuracy: ${r.accuracies.black}% (Official: ${blackOff}%) -> Diff: ${Math.abs(r.accuracies.black - blackOff).toFixed(1)}%`);
        console.log(`  Classification Parity: ${matches}/${totalPlies} (${parityPct}%)\n`);
    }

    console.log('ALL BENCHMARKS COMPLETED SUCCESSFULLY!');
}

runBenchmark().catch(console.error);
