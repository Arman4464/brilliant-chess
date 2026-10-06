const fs = require('fs');
const { ChessReviewEngine } = require('./review_pipeline.js');

async function main() {
    const gameData = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_172014464516.json', 'utf8'));
    console.log(`Analyzing game 172014464516 (${gameData.moves.length} moves)...`);

    const engine = new ChessReviewEngine();
    const t0 = Date.now();

    const result = await engine.analyzeGame({
        moves: gameData.moves,
        whiteElo: 1400,
        blackElo: 1300,
        depth: 14
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`\nAnalysis finished in ${elapsed}s!\n`);

    console.log('=== ACCURACY COMPARISON ===');
    console.log(`White Accuracy: ${result.accuracies.white}% (Official: ${gameData.accuracies.white}%)`);
    console.log(`Black Accuracy: ${result.accuracies.black}% (Official: ${gameData.accuracies.black}%)`);

    console.log('\n=== TALLIES COMPARISON ===');
    console.log('White Tallies:', JSON.stringify(result.tallies.white));
    console.log('White Official:', JSON.stringify(Object.fromEntries(
        Object.entries(gameData.tallies).map(([k, v]) => [k, v.white])
    )));

    console.log('Black Tallies:', JSON.stringify(result.tallies.black));
    console.log('Black Official:', JSON.stringify(Object.fromEntries(
        Object.entries(gameData.tallies).map(([k, v]) => [k, v.black])
    )));

    let matches = 0;
    result.moves.forEach((m, idx) => {
        const actual = gameData.moves[idx].classification;
        if (m.classification === actual) matches++;
    });

    console.log(`\nExact Move-by-Move Matches: ${matches}/${gameData.moves.length} (${(matches / gameData.moves.length * 100).toFixed(1)}%)`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
