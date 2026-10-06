const fs = require('fs');
const path = require('path');
const { ChessReviewEngine } = require('../review_pipeline.js');

const benchmarkGames = [
    { id: '184653017586', wRating: 550, bRating: 950, folder: 'move_by_move_reviews' },
    { id: '171608609212', wRating: 900, bRating: 1300, folder: 'move_by_move_reviews' },
    { id: '114104460147', wRating: 600, bRating: 1300, folder: 'move_by_move_reviews' },
    { id: '172014464516', wRating: 1400, bRating: 1300, folder: 'move_by_move_reviews' },
    { id: '171853838612', wRating: 1300, bRating: 1250, folder: 'move_by_move_reviews' },
    { id: '165803154362', wRating: 100, bRating: 900, folder: 'move_by_move_reviews' },
    { id: '184348301442', wRating: 600, bRating: 1200, folder: 'Spy-deer-man' },
    { id: '184347995768', wRating: 850, bRating: 250, isArchive: true }
];

async function run() {
    const engine = new ChessReviewEngine(4);
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
        console.log(`Game ${bg.id}: W_Elo_in=${whiteElo}, B_Elo_in=${blackElo} | Official: W=${bg.wRating}, B=${bg.bRating} | Calc: W=${res.performanceRatings.white}, B=${res.performanceRatings.black}`);
    }
}
run().catch(console.error);
