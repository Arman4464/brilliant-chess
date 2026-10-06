const fs = require('fs');
const path = require('path');

const users = ['LittleNear', '911Samsung', 'Spy-deer-man'];
const allGames = [];

for (const user of users) {
    const dir = path.join(__dirname, '..', 'review_data', user);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.startsWith('review_') && f.endsWith('.json'));
    for (const f of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            if (data.accuracies && data.accuracies.white != null && data.accuracies.black != null) {
                allGames.push({
                    user,
                    file: path.join(dir, f),
                    id: data.game?.id,
                    white: data.players?.white?.username,
                    black: data.players?.black?.username,
                    whiteRating: parseInt(data.players?.white?.rating || 0, 10),
                    blackRating: parseInt(data.players?.black?.rating || 0, 10),
                    whiteAcc: data.accuracies.white,
                    blackAcc: data.accuracies.black,
                    movesCount: data.moves ? data.moves.length : 0,
                    pgn: data.pgn
                });
            }
        } catch (e) {}
    }
}

// Sort games by rating and select diverse sample
console.log(`Total games: ${allGames.length}`);

// Group by rating brackets:
// < 500, 500-800, 800-1100, 1100+
const b1 = allGames.filter(g => (g.whiteRating + g.blackRating) / 2 < 500);
const b2 = allGames.filter(g => (g.whiteRating + g.blackRating) / 2 >= 500 && (g.whiteRating + g.blackRating) / 2 < 800);
const b3 = allGames.filter(g => (g.whiteRating + g.blackRating) / 2 >= 800 && (g.whiteRating + g.blackRating) / 2 < 1100);
const b4 = allGames.filter(g => (g.whiteRating + g.blackRating) / 2 >= 1100);

console.log(`Bracket < 500: ${b1.length} games`);
console.log(`Bracket 500-800: ${b2.length} games`);
console.log(`Bracket 800-1100: ${b3.length} games`);
console.log(`Bracket 1100+: ${b4.length} games`);

// Sample 5 from each bracket for quick initial calibration set (20 games)
function pickSample(arr, n) {
    const step = Math.max(1, Math.floor(arr.length / n));
    const res = [];
    for (let i = 0; i < arr.length && res.length < n; i += step) {
        res.push(arr[i]);
    }
    return res;
}

const sample20 = [
    ...pickSample(b1, 5),
    ...pickSample(b2, 5),
    ...pickSample(b3, 5),
    ...pickSample(b4, 5)
];

console.log(`Selected initial calibration set of ${sample20.length} diverse games:`);
sample20.forEach((g, idx) => {
    console.log(`${idx + 1}. [ID: ${g.id}] ${g.white}(${g.whiteRating}) vs ${g.black}(${g.blackRating}) | Moves: ${g.movesCount} | White Acc: ${g.whiteAcc}%, Black Acc: ${g.blackAcc}%`);
});

fs.writeFileSync(path.join(__dirname, 'calibration_sample.json'), JSON.stringify(sample20.map(g => ({
    id: g.id,
    file: g.file,
    whiteRating: g.whiteRating,
    blackRating: g.blackRating,
    whiteAcc: g.whiteAcc,
    blackAcc: g.blackAcc,
    movesCount: g.movesCount
})), null, 2));
