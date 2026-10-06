const { ChessReviewEngine } = require('../review_pipeline.js');

async function test() {
    const archiveRes = await fetch('https://api.chess.com/pub/player/spy-deer-man/games/2026/09', {
        headers: { 'User-Agent': 'ChessAnalysisTool/1.0' }
    });
    const archData = await archiveRes.json();
    const g = archData.games?.find(x => x.url.includes('184347995768'));
    console.log('Found archive game in 2026/09:', !!g);
    if (!g) {
        // Try other months or callback
        console.log('Available games:', archData.games?.length);
    } else {
        console.log('Official API accuracies:', g.accuracies);
        console.log('PGN:', g.pgn);
        const engine = new ChessReviewEngine(4);
        const res = await engine.analyzeGame({
            pgn: g.pgn,
            whiteElo: g.white.rating,
            blackElo: g.black.rating,
            depth: 18,
            multiPv: 2
        });
        console.log('Engine Calculated Accuracies:', res.accuracies);
        console.log('Engine Calculated Ratings:', res.performanceRatings);
        console.log('Engine Calculated Tallies W:', res.tallies.white);
        console.log('Engine Calculated Tallies B:', res.tallies.black);
    }
}
test().catch(console.error);
