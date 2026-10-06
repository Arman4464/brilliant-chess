const fs = require('fs');
const path = require('path');
const { loadCachedGames } = require('./train_and_calibrate');

const games = loadCachedGames();
console.log(`Loaded ${games.length} games.`);

// Classify each move based on deltaE and deltaCp
function classifyMove(m, pRating) {
    if (m.isForced) return 'forced';
    if (m.isBest) return 'best';

    const s = 0.65 + 0.25 * (pRating / 1000);
    function winExp(cp) {
        if (cp >= 50000) return 1.0;
        if (cp <= -50000) return 0.0;
        return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
    }

    const beforeE = winExp(m.scoreBefore);
    const afterE = winExp(m.scoreAfter);
    const deltaE = Math.max(0, beforeE - afterE);
    const dCp = m.deltaCp;

    if (dCp <= 10) return 'best';

    // Mate sequences
    if (m.scoreBefore <= -90000 && m.scoreAfter <= -90000) {
        if (dCp > 200) return 'mistake';
        return 'excellent';
    }

    // Blunder: ends in lost position with large loss
    if (m.scoreAfter < -150 && (deltaE >= 0.20 || dCp >= 250)) {
        return 'blunder';
    }

    // Mistake
    if (deltaE >= 0.10 || dCp >= 140 || (m.scoreBefore >= 180 && m.scoreAfter <= 40)) {
        return 'mistake';
    }

    // Inaccuracy
    if (deltaE >= 0.040 || dCp >= 75) {
        return 'inaccuracy';
    }

    // Good
    if (deltaE >= 0.025 || dCp >= 40) {
        return 'good';
    }

    return 'excellent';
}

// Compute tallies for each player
const dataset = [];
for (const g of games) {
    const wCounts = { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, total: 0 };
    const bCounts = { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, total: 0 };

    for (let i = 0; i < g.moves.length; i++) {
        const m = g.moves[i];
        const isW = m.color === 'white';
        const rating = isW ? g.whiteRating : g.blackRating;
        const counts = isW ? wCounts : bCounts;

        const cls = classifyMove(m, rating);
        if (cls === 'forced') continue;

        if (i < 4 || cls === 'best') counts.best++;
        else if (cls === 'excellent') counts.excellent++;
        else if (cls === 'good') counts.good++;
        else if (cls === 'inaccuracy') counts.inaccuracy++;
        else if (cls === 'mistake') counts.mistake++;
        else if (cls === 'blunder') counts.blunder++;
        counts.total++;
    }

    dataset.push({
        id: g.id,
        color: 'white',
        rating: g.whiteRating,
        counts: wCounts,
        realAcc: g.officialWhiteAcc
    });

    dataset.push({
        id: g.id,
        color: 'black',
        rating: g.blackRating,
        counts: bCounts,
        realAcc: g.officialBlackAcc
    });
}

console.log(`Total samples: ${dataset.length} player games.`);

// Grid search for optimal discrete move weights [w_exc, w_good, w_inac, w_mist, w_blun]
let bestMAE = 999;
let bestWeights = null;

for (let wExc = 85; wExc <= 95; wExc += 2) {
    for (let wGood = 65; wGood <= 78; wGood += 2) {
        for (let wInac = 35; wInac <= 50; wInac += 3) {
            for (let wMist = 15; wMist <= 25; wMist += 3) {
                for (let wBlun = 0; wBlun <= 10; wBlun += 2) {
                    let totalErr = 0;
                    for (const d of dataset) {
                        if (d.counts.total === 0) continue;
                        const score = (
                            d.counts.best * 100 +
                            d.counts.excellent * wExc +
                            d.counts.good * wGood +
                            d.counts.inaccuracy * wInac +
                            d.counts.mistake * wMist +
                            d.counts.blunder * wBlun
                        ) / d.counts.total;

                        totalErr += Math.abs(score - d.realAcc);
                    }
                    const mae = totalErr / dataset.length;
                    if (mae < bestMAE) {
                        bestMAE = mae;
                        bestWeights = { wExc, wGood, wInac, wMist, wBlun, mae, parity: (100 - mae).toFixed(2) + '%' };
                    }
                }
            }
        }
    }
}

console.log('\n--- OPTIMAL DISCRETE CLASSIFICATION WEIGHTS ---');
console.log(bestWeights);
