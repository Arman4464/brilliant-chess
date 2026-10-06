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

async function collect() {
    const engine = new ChessReviewEngine(4);
    const samples = [];
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
        
        for (const color of ['white', 'black']) {
            const playerMoves = res.moves.filter(m => m.color === color);
            const officialAcc = color === 'white' ? bg.wAcc : bg.bAcc;
            const ceeCaps = res.capsBreakdown?.[color]?.all || 0;
            
            // Raw CEE move stats
            const nonBook = playerMoves.filter(m => m.classification !== 'book');
            const avgCaps2 = playerMoves.reduce((s, m) => s + (m.caps2 ?? 100), 0) / playerMoves.length;
            const avgCaps2Clamped = playerMoves.reduce((s, m) => s + Math.max(0, m.caps2 ?? 100), 0) / playerMoves.length;
            const avgNbCaps2Clamped = nonBook.length ? nonBook.reduce((s, m) => s + Math.max(0, m.caps2 ?? 100), 0) / nonBook.length : 100;

            const counts = {};
            for (const m of playerMoves) {
                const c = (m.rawClassification || m.classification || '').toLowerCase();
                counts[c] = (counts[c] || 0) + 1;
            }

            samples.push({
                gameId: bg.id,
                color,
                officialAcc,
                ceeCaps,
                avgCaps2,
                avgCaps2Clamped,
                avgNbCaps2Clamped,
                numMoves: playerMoves.length,
                counts
            });
        }
    }

    fs.writeFileSync(path.join(__dirname, 'collected_acc_samples.json'), JSON.stringify(samples, null, 2));
    console.log(`Saved ${samples.length} accuracy samples to collected_acc_samples.json`);
}
collect().catch(console.error);
