const { ChessReviewEngine } = require('../review_pipeline.js');

async function testUnseen() {
    const res = await fetch('https://api.chess.com/pub/player/spy-deer-man/games/2026/09');
    const data = await res.json();
    const unseenGames = data.games.filter(g => !g.url.includes('184348301442') && !g.url.includes('184347995768') && g.accuracies).slice(0, 5);
    
    const engine = new ChessReviewEngine(4);
    console.log(`\n=== TESTING PIPELINE ON ${unseenGames.length} COMPLETELY UNSEEN GAMES ===\n`);

    let totalDiff = 0;
    let count = 0;

    for (const g of unseenGames) {
        const id = g.url.split('/').pop();
        console.log(`\n--- Game #${id}: ${g.white.username} (${g.white.rating}) vs ${g.black.username} (${g.black.rating}) ---`);
        const review = await engine.analyzeGame({
            pgn: g.pgn,
            whiteElo: g.white.rating,
            blackElo: g.black.rating,
            depth: 18,
            multiPv: 2
        });

        const wOfficial = Number(g.accuracies.white.toFixed(1));
        const bOfficial = Number(g.accuracies.black.toFixed(1));
        const wCalc = review.accuracies.white;
        const bCalc = review.accuracies.black;

        const wDiff = Math.abs(wCalc - wOfficial);
        const bDiff = Math.abs(bCalc - bOfficial);
        totalDiff += wDiff + bDiff;
        count += 2;

        const wRankMatch = (wCalc > bCalc) === (wOfficial > bOfficial);

        console.log(`White Accuracy: Calc=${wCalc}% vs Official=${wOfficial}% (Diff: ${wDiff.toFixed(1)}%)`);
        console.log(`Black Accuracy: Calc=${bCalc}% vs Official=${bOfficial}% (Diff: ${bDiff.toFixed(1)}%)`);
        console.log(`Player Relative Ranking Match: ${wRankMatch ? 'YES' : 'NO'}`);
        console.log(`Opening: ${review.opening?.code} ${review.opening?.name}`);
        console.log(`Ratings: White=${review.performanceRatings.white}, Black=${review.performanceRatings.black}`);
    }

    console.log(`\n======================================================`);
    console.log(`Average Accuracy Error Across Unseen Games: ${(totalDiff / count).toFixed(2)}%`);
    console.log(`======================================================`);
}

testUnseen().catch(console.error);
