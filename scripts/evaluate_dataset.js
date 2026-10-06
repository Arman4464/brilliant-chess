const fs = require('fs');
const path = require('path');
const { Evaluator } = require('./engine_evaluator');

const CACHE_DIR = path.join(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

async function evaluateBatch(sampleFilePath, depth = 13, threads = 8, hash = 128) {
    const gamesList = JSON.parse(fs.readFileSync(sampleFilePath, 'utf8'));
    console.log(`Starting batch evaluation of ${gamesList.length} games at depth ${depth}...`);

    const ev = new Evaluator(depth, threads, hash);

    for (let idx = 0; idx < gamesList.length; idx++) {
        const item = gamesList[idx];
        const gameCacheFile = path.join(CACHE_DIR, `game_${item.id}.json`);

        if (fs.existsSync(gameCacheFile)) {
            console.log(`[${idx + 1}/${gamesList.length}] Game ${item.id} already evaluated in cache.`);
            continue;
        }

        console.log(`[${idx + 1}/${gamesList.length}] Evaluating game ${item.id} (${item.movesCount} plies)...`);
        const gameData = JSON.parse(fs.readFileSync(item.file, 'utf8'));
        const t0 = Date.now();
        const moveResults = await ev.evaluateGame(gameData);
        const elapsed = Date.now() - t0;

        const record = {
            id: item.id,
            whiteRating: item.whiteRating,
            blackRating: item.blackRating,
            officialWhiteAcc: item.whiteAcc,
            officialBlackAcc: item.blackAcc,
            moves: moveResults
        };

        fs.writeFileSync(gameCacheFile, JSON.stringify(record, null, 2));
        console.log(`  Done in ${(elapsed / 1000).toFixed(1)}s! Saved to ${gameCacheFile}`);
    }

    ev.terminate();
    console.log('\nBatch evaluation complete!');
}

if (require.main === module) {
    const sampleFile = path.join(__dirname, 'calibration_sample.json');
    evaluateBatch(sampleFile, 13, 8, 128).catch(console.error);
}

module.exports = { evaluateBatch };
