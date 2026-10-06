const fs = require('fs');
const path = require('path');

const users = ['LittleNear', '911Samsung', 'Spy-deer-man'];
const allGames = [];

for (const user of users) {
    const dir = path.join(__dirname, '..', 'review_data', user);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.startsWith('review_') && f.endsWith('.json'));
    console.log(`User ${user}: found ${files.length} review files`);
    for (const f of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            if (data.accuracies && data.accuracies.white != null && data.accuracies.black != null) {
                allGames.push({
                    user,
                    file: f,
                    id: data.game?.id,
                    whiteRating: parseInt(data.players?.white?.rating || 0, 10),
                    blackRating: parseInt(data.players?.black?.rating || 0, 10),
                    whiteAcc: data.accuracies.white,
                    blackAcc: data.accuracies.black,
                    totalMoves: data.moves ? data.moves.length : 0,
                    pgn: data.pgn
                });
            }
        } catch (e) {
            console.error(`Error reading ${f}:`, e.message);
        }
    }
}

console.log(`\nTotal verified games with official accuracies: ${allGames.length}`);
const whiteAccs = allGames.map(g => g.whiteAcc);
const blackAccs = allGames.map(g => g.blackAcc);
const allAccs = [...whiteAccs, ...blackAccs];
const minAcc = Math.min(...allAccs);
const maxAcc = Math.max(...allAccs);
const avgAcc = allAccs.reduce((a, b) => a + b, 0) / allAccs.length;

console.log(`Accuracy range: ${minAcc}% - ${maxAcc}% (average: ${avgAcc.toFixed(2)}%)`);
const totalPlys = allGames.reduce((a, g) => a + g.totalMoves, 0);
console.log(`Total plies across all games: ${totalPlys} (avg per game: ${(totalPlys / allGames.length).toFixed(1)})`);
