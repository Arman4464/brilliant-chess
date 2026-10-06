const fs = require('fs');
const path = require('path');
const { ChessReviewEngine } = require('../review_pipeline.js');

const benchmarkGames = [
    { id: '184653017586', wAcc: 60.3, bAcc: 70.0, folder: 'move_by_move_reviews' },
    { id: '171608609212', wAcc: 74.7, bAcc: 86.3, folder: 'move_by_move_reviews' },
    { id: '114104460147', wAcc: 70.5, bAcc: 74.5, folder: 'move_by_move_reviews' },
    { id: '172014464516', wAcc: 87.1, bAcc: 81.7, folder: 'move_by_move_reviews' },
    { id: '171853838612', wAcc: 83.9, bAcc: 76.5, folder: 'move_by_move_reviews' },
    { id: '165803154362', wAcc: 66.2, bAcc: 75.3, folder: 'move_by_move_reviews' },
    { id: '184348301442', wAcc: 63.0, bAcc: 75.3, folder: 'Spy-deer-man' },
    { id: '184347995768', wAcc: 67.5, bAcc: 53.7, isArchive: true }
];

async function run() {
    const engine = new ChessReviewEngine(4);
    const pairs = [];
    for (const bg of benchmarkGames) {
        let pgn = null, moves = null, whiteElo = 1500, blackElo = 1500;
        if (bg.isArchive) {
            const archiveRes = await fetch('https://api.chess.com/pub/player/spy-deer-man/games/2026/09', {
                headers: { 'User-Agent': 'ChessAnalysisTool/1.0' }
            });
            const archData = await archiveRes.json();
            const g = archData.games.find(x => x.url.includes(bg.id));
            pgn = g.pgn;
            whiteElo = g.white.rating;
            blackElo = g.black.rating;
        } else {
            const filePath = path.join(__dirname, '..', 'review_data', bg.folder, 'review_' + bg.id + '.json');
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            pgn = data.pgn;
            moves = data.moves;
            whiteElo = data.players?.white?.rating || 1500;
            blackElo = data.players?.black?.rating || 1500;
        }
        const res = await engine.analyzeGame({ pgn, moves, whiteElo, blackElo, depth: 18, multiPv: 2 });
        const wCee = res.capsBreakdown?.white?.all || 0;
        const bCee = res.capsBreakdown?.black?.all || 0;
        pairs.push({ id: bg.id, color: 'W', cee: wCee, official: bg.wAcc });
        pairs.push({ id: bg.id, color: 'B', cee: bCee, official: bg.bAcc });
    }
    console.log(JSON.stringify(pairs, null, 2));

    // Linear regression: official = slope * cee + intercept
    let n = pairs.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (const p of pairs) {
        sumX += p.cee;
        sumY += p.official;
        sumXY += p.cee * p.official;
        sumXX += p.cee * p.cee;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    console.log(`\nRegression: official = ${slope.toFixed(4)} * cee + ${intercept.toFixed(4)}`);
    let totalErr = 0;
    for (const p of pairs) {
        const pred = slope * p.cee + intercept;
        const err = Math.abs(pred - p.official);
        totalErr += err;
        console.log(`${p.id} ${p.color}: CEE=${p.cee.toFixed(1)} -> Pred=${pred.toFixed(1)} vs Official=${p.official.toFixed(1)} (Err: ${err.toFixed(1)})`);
    }
    console.log(`MAE: ${(totalErr / n).toFixed(2)}%`);
}
run().catch(console.error);
