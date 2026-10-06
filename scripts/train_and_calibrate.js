const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, 'cache');

// Load all cached game evaluations
function loadCachedGames() {
    if (!fs.existsSync(CACHE_DIR)) return [];
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.startsWith('game_') && f.endsWith('.json'));
    const games = [];
    for (const f of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
            if (data.moves && data.moves.length > 0 && data.officialWhiteAcc != null && data.officialBlackAcc != null) {
                games.push(data);
            }
        } catch (e) {}
    }
    return games;
}

// Compute player accuracies for a single game
function computeGameAccuracies(game, params) {
    const {
        k = 0.05,
        p = 0.25,
        alpha = 0.85,
        s0 = 0.65,
        s1 = 0.25,
        cpWeight = 2.0,
        cpTol = 10,
        includeForced = false
    } = params;

    const wRating = game.whiteRating || 1500;
    const bRating = game.blackRating || 1500;

    const sW = Math.max(0.60, Math.min(1.40, s0 + s1 * (wRating / 1000)));
    const sB = Math.max(0.60, Math.min(1.40, s0 + s1 * (bRating / 1000)));

    function winExpectancy(cp, s) {
        if (cp >= 50000) return 1.0;
        if (cp <= -50000) return 0.0;
        return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
    }

    const wMoves = [];
    const bMoves = [];

    for (let i = 0; i < game.moves.length; i++) {
        const m = game.moves[i];
        const isWhite = m.color === 'white';
        const s = isWhite ? sW : sB;

        // Forced moves are excluded from the game accuracy denominator
        if (m.isForced) {
            if (includeForced) {
                (isWhite ? wMoves : bMoves).push(100);
            }
            continue;
        }

        // Opening book moves or top engine moves or negligible cp change: 100%
        if (i < 4 || m.isBest || m.deltaCp <= cpTol) {
            (isWhite ? wMoves : bMoves).push(100);
            continue;
        }

        const beforeE = winExpectancy(m.scoreBefore, s);
        const afterE = winExpectancy(m.scoreAfter, s);
        const deltaE = Math.max(0, beforeE - afterE);

        // In winning positions, cp loss penalizes accuracy even when deltaE is small
        const cpPenalty = (Math.max(0, m.deltaCp - cpTol) / 100) * cpWeight;
        const effectiveLoss = (deltaE * 100) + cpPenalty;

        const moveAcc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-k * effectiveLoss) - 3.1668));
        (isWhite ? wMoves : bMoves).push(moveAcc);
    }

    function aggregate(arr) {
        if (arr.length === 0) return 100;
        const arith = arr.reduce((a, b) => a + b, 0) / arr.length;
        if (p === 1.0) return arith;
        const sumP = arr.reduce((a, b) => a + Math.pow(Math.max(b, 0.5), p), 0);
        const pMean = Math.pow(sumP / arr.length, 1 / p);
        return alpha * pMean + (1 - alpha) * arith;
    }

    const whiteAcc = aggregate(wMoves);
    const blackAcc = aggregate(bMoves);

    return { whiteAcc, blackAcc };
}

// Evaluate entire dataset
function evaluateDataset(games, params) {
    let totalAbsErr = 0;
    let count = 0;
    const diffs = [];

    for (const g of games) {
        const { whiteAcc, blackAcc } = computeGameAccuracies(g, params);
        const errW = Math.abs(whiteAcc - g.officialWhiteAcc);
        const errB = Math.abs(blackAcc - g.officialBlackAcc);

        totalAbsErr += errW + errB;
        count += 2;

        diffs.push({
            id: g.id,
            whiteRating: g.whiteRating,
            blackRating: g.blackRating,
            predW: whiteAcc,
            realW: g.officialWhiteAcc,
            errW,
            predB: blackAcc,
            realB: g.officialBlackAcc,
            errB
        });
    }

    const mae = count > 0 ? totalAbsErr / count : 999;
    const parity = Math.max(0, 100 - mae);
    return { mae, parity, diffs };
}

// Optimization routine
function optimize(games) {
    console.log(`\n=== OPTIMIZING PARAMETERS ACROSS ${games.length} GAMES (${games.length * 2} PLAYERS) ===`);

    let bestMAE = 999;
    let bestParams = null;

    const kRange = [0.035, 0.040, 0.045, 0.050, 0.055, 0.060, 0.065];
    const pRange = [0.20, 0.25, 0.30, 0.35];
    const alphaRange = [0.70, 0.75, 0.80, 0.85, 0.90];
    const cpWeightRange = [1.5, 2.0, 2.5, 3.0, 3.5];
    const s0Range = [0.60, 0.65, 0.70];
    const s1Range = [0.20, 0.25, 0.30];
    const cpTolRange = [8, 10, 12];

    const total = kRange.length * pRange.length * alphaRange.length * cpWeightRange.length * s0Range.length * s1Range.length * cpTolRange.length;
    console.log(`Grid search space: ${total} configurations...`);

    const t0 = Date.now();
    for (const k of kRange) {
        for (const p of pRange) {
            for (const alpha of alphaRange) {
                for (const cpWeight of cpWeightRange) {
                    for (const s0 of s0Range) {
                        for (const s1 of s1Range) {
                            for (const cpTol of cpTolRange) {
                                const params = { k, p, alpha, cpWeight, s0, s1, cpTol, includeForced: false };
                                const res = evaluateDataset(games, params);
                                if (res.mae < bestMAE) {
                                    bestMAE = res.mae;
                                    bestParams = { ...params, mae: res.mae, parity: res.parity };
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    const elapsed = Date.now() - t0;
    console.log(`Completed grid search in ${(elapsed / 1000).toFixed(2)}s!`);

    console.log('\n--- OPTIMAL CALIBRATED PARAMETERS ---');
    console.log(JSON.stringify(bestParams, null, 2));

    const finalEval = evaluateDataset(games, bestParams);
    console.log(`\nGlobal Mean Absolute Error (MAE): ${finalEval.mae.toFixed(2)}%`);
    console.log(`Global Parity: ${finalEval.parity.toFixed(2)}%`);

    console.log('\n--- GAME-BY-GAME CALIBRATION RESULTS ---');
    console.log('Game ID      | White (Pred / Real / Diff) | Black (Pred / Real / Diff)');
    console.log('-------------+----------------------------+----------------------------');
    for (const d of finalEval.diffs) {
        const signW = d.predW - d.realW >= 0 ? '+' : '';
        const signB = d.predB - d.realB >= 0 ? '+' : '';
        console.log(
            `${d.id.padEnd(12)} | ` +
            `${d.predW.toFixed(1).padStart(5)}% / ${d.realW.toFixed(1).padStart(5)}% (${signW + (d.predW - d.realW).toFixed(1)}%) | ` +
            `${d.predB.toFixed(1).padStart(5)}% / ${d.realB.toFixed(1).padStart(5)}% (${signB + (d.predB - d.realB).toFixed(1)}%)`
        );
    }

    return bestParams;
}

if (require.main === module) {
    const games = loadCachedGames();
    console.log(`Loaded ${games.length} evaluated games from cache.`);
    if (games.length > 0) {
        optimize(games);
    }
}

module.exports = {
    loadCachedGames,
    computeGameAccuracies,
    evaluateDataset,
    optimize
};
