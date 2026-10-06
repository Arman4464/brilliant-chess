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

async function dump() {
    const engine = new ChessReviewEngine(4);
    const actualCases = [];

    for (const bg of benchmarkGames) {
        let pgn, moves, whiteElo, blackElo;
        if (bg.isArchive) {
            const archiveRes = await fetch('https://api.chess.com/pub/player/spy-deer-man/games/2026/09', {
                headers: { 'User-Agent': 'ChessAnalysisTool/1.0' }
            });
            const archData = await archiveRes.json();
            const g = archData.games.find(x => x.url.includes(bg.id));
            pgn = g.pgn;
            whiteElo = 700;
            blackElo = 698;
        } else {
            const filePath = path.join(__dirname, '..', 'review_data', bg.folder, 'review_' + bg.id + '.json');
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            pgn = data.pgn;
            moves = data.moves;
            whiteElo = data.players?.white?.rating || 1500;
            blackElo = data.players?.black?.rating || 1500;
        }

        const res = await engine.analyzeGame({ pgn, moves, whiteElo, blackElo, depth: 18, multiPv: 2 });
        
        actualCases.push({
            id: bg.id,
            color: 'white',
            target: bg.wRating,
            f: {
                acc: res.accuracies.white,
                elo: whiteElo,
                mist: res.tallies.white.mistake || 0,
                blund: res.tallies.white.blunder || 0,
                miss: res.tallies.white.miss || 0,
                inacc: res.tallies.white.inaccuracy || 0,
                great: (res.tallies.white.great || 0) + (res.tallies.white.greatFind || 0)
            }
        });

        actualCases.push({
            id: bg.id,
            color: 'black',
            target: bg.bRating,
            f: {
                acc: res.accuracies.black,
                elo: blackElo,
                mist: res.tallies.black.mistake || 0,
                blund: res.tallies.black.blunder || 0,
                miss: res.tallies.black.miss || 0,
                inacc: res.tallies.black.inaccuracy || 0,
                great: (res.tallies.black.great || 0) + (res.tallies.black.greatFind || 0)
            }
        });
    }

    fs.writeFileSync(path.join(__dirname, 'actual_rating_cases.json'), JSON.stringify(actualCases, null, 2));
    console.log('Saved 16 actual rating cases to actual_rating_cases.json');
}

dump().catch(console.error);
