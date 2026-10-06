const fs = require('fs');
const path = require('path');
const { ChessReviewEngine } = require('../review_pipeline.js');

async function testHighTier() {
    const engine = new ChessReviewEngine(4);
    const files = fs.readdirSync(path.join(__dirname, '..', 'dataset_multi_tier')).filter(f => f.endsWith('.json')).slice(0, 3);

    for (const f of files) {
        const filePath = path.join(__dirname, '..', 'dataset_multi_tier', f);
        const g = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`\n=== Testing Multi-Tier Game: ${g.id} (${g.tier}) ===`);
        console.log(`Players: ${g.white.username} (${g.white.rating}) vs ${g.black.username} (${g.black.rating})`);
        console.log(`Official Accuracies: W ${g.white.accuracy}%, B ${g.black.accuracy}%`);

        const res = await engine.analyzeGame({
            pgn: g.pgn,
            whiteElo: g.white.rating,
            blackElo: g.black.rating,
            depth: 18,
            multiPv: 2
        });

        console.log(`Results:`);
        console.log(`  Opening:`, res.opening?.code, res.opening?.name);
        console.log(`  Calculated Accuracies: White ${res.accuracies.white}%, Black ${res.accuracies.black}%`);
        console.log(`  Performance Ratings: White ${res.performanceRatings.white}, Black ${res.performanceRatings.black}`);
        console.log(`  White Tallies:`, res.tallies.white);
        console.log(`  Black Tallies:`, res.tallies.black);
    }
}

testHighTier().catch(console.error);
