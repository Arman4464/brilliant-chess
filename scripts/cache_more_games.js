const fs = require('fs');
const path = require('path');
const { evaluateBatch } = require('./evaluate_dataset');

const users = ['LittleNear', '911Samsung', 'Spy-deer-man'];
const CACHE_DIR = path.join(__dirname, 'cache');

const allGames = [];
for (const user of users) {
    const dir = path.join(__dirname, '..', 'review_data', user);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.startsWith('review_') && f.endsWith('.json'));
    for (const f of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            const gameId = data.game?.id;
            const cacheFile = path.join(CACHE_DIR, `game_${gameId}.json`);
            if (data.accuracies && data.accuracies.white != null && data.accuracies.black != null) {
                allGames.push({
                    id: gameId,
                    file: path.join(dir, f),
                    whiteRating: parseInt(data.players?.white?.rating || 0, 10),
                    blackRating: parseInt(data.players?.black?.rating || 0, 10),
                    whiteAcc: data.accuracies.white,
                    blackAcc: data.accuracies.black,
                    movesCount: data.moves ? data.moves.length : 0,
                    alreadyCached: fs.existsSync(cacheFile)
                });
            }
        } catch (e) {}
    }
}

const uncached = allGames.filter(g => !g.alreadyCached && g.movesCount >= 20 && g.movesCount <= 90);
console.log(`Total games in dataset: ${allGames.length}`);
console.log(`Uncached suitable games: ${uncached.length}`);

// Pick 20 more games spread across the rating spectrum
const step = Math.max(1, Math.floor(uncached.length / 20));
const batch = [];
for (let i = 0; i < uncached.length && batch.length < 20; i += step) {
    batch.push(uncached[i]);
}

console.log(`Selected ${batch.length} new games to evaluate and cache.`);
const batchFile = path.join(__dirname, 'cache', 'batch_20.json');
fs.writeFileSync(batchFile, JSON.stringify(batch, null, 2));

evaluateBatch(batchFile, 13, 8, 128).catch(console.error);
