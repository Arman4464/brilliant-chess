const fs = require('fs');
const { ChessReviewEngine } = require('../review_pipeline.js');

const games = [
    { id: '184653017586', wAcc: 60.3, bAcc: 70.0, folder: 'move_by_move_reviews' },
    { id: '171608609212', wAcc: 74.7, bAcc: 86.3, folder: 'move_by_move_reviews' },
    { id: '114104460147', wAcc: 70.5, bAcc: 74.5, folder: 'move_by_move_reviews' },
    { id: '172014464516', wAcc: 87.1, bAcc: 81.7, folder: 'move_by_move_reviews' },
    { id: '171853838612', wAcc: 83.9, bAcc: 76.5, folder: 'move_by_move_reviews' },
    { id: '165803154362', wAcc: 66.2, bAcc: 75.3, folder: 'move_by_move_reviews' },
    { id: '184348301442', wAcc: 63.0, bAcc: 75.3, folder: 'Spy-deer-man' },
    { id: '184347995768', wAcc: 67.5, bAcc: 53.7, isNew: true }
];

async function checkCaps() {
    const engine = new ChessReviewEngine(4);
    for (const g of games) {
        let pgn, moves, wElo, bElo;
        if (g.isNew) {
            const arch = JSON.parse(await (await fetch('https://api.chess.com/pub/player/spy-deer-man/games/2026/09', { headers: { 'User-Agent': 'ChessTool/1.0' } })).text());
            const gm = arch.games.find(x => x.url.includes(g.id));
            pgn = gm.pgn; wElo = 700; bElo = 698;
        } else {
            const data = JSON.parse(fs.readFileSync('review_data/' + g.folder + '/review_' + g.id + '.json'));
            pgn = data.pgn; moves = data.moves; wElo = data.players?.white?.rating; bElo = data.players?.black?.rating;
        }
        const res = await engine.analyzeGame({ pgn, moves, whiteElo: wElo, blackElo: bElo, depth: 18, multiPv: 2 });
        const wCaps = res.capsBreakdown?.white?.all ?? 0;
        const bCaps = res.capsBreakdown?.black?.all ?? 0;
        console.log(`Game ${g.id}:`);
        console.log(`  White CEE: ${wCaps} vs Target: ${g.wAcc} (diff: ${(wCaps - g.wAcc).toFixed(1)})`);
        console.log(`  Black CEE: ${bCaps} vs Target: ${g.bAcc} (diff: ${(bCaps - g.bAcc).toFixed(1)})`);
    }
}
checkCaps().catch(console.error);
