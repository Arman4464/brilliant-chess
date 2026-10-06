const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'review_data', 'move_by_move_reviews');
const files = [
    'review_114104460147.json',
    'review_165803154362.json',
    'review_171608609212.json',
    'review_171853838612.json',
    'review_172014464516.json',
    'review_184653017586.json'
];

const games = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f))));

function parseScore(evalStr) {
    if (!evalStr) return null;
    if (evalStr === '0-1') return -100000;
    if (evalStr === '1-0') return 100000;
    if (evalStr.startsWith('M')) return 100000 - parseInt(evalStr.slice(1), 10) * 100;
    if (evalStr.startsWith('-M')) return -100000 + parseInt(evalStr.slice(2), 10) * 100;
    const val = parseFloat(evalStr);
    return isNaN(val) ? null : Math.round(val * 100);
}

function normalizeCp(score) {
    if (score >= 50000) return 2000;
    if (score <= -50000) return -2000;
    return score;
}

function winExpectancy(cp, rating = 1000) {
    if (cp >= 50000) return 1.0;
    if (cp <= -50000) return 0.0;
    const s = Math.max(0.60, Math.min(1.40, 0.65 + 0.25 * (rating / 1000)));
    return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
}

// Grid search for move score parameters with ORDINARY MEAN (arithmetic mean)
let bestParams = null;
let minMae = 999;

for (let k of [0.035, 0.040, 0.045, 0.050, 0.055, 0.060]) {
    for (let cpWeight of [1.5, 2.0, 2.5, 3.0, 3.5]) {
        for (let winWeight of [1.0, 1.2, 1.4, 1.6]) {
            let totalDiff = 0, count = 0;

            for (const g of games) {
                const wRating = g.players.white.rating || 1000;
                const bRating = g.players.black.rating || 1000;

                const wAccs = [];
                const bAccs = [];
                let prevScore = 25;

                for (const m of g.moves) {
                    const isWhite = m.color === 'white';
                    const rating = isWhite ? wRating : bRating;
                    const currentScore = parseScore(m.eval);
                    if (currentScore === null) continue;

                    const playerBefore = isWhite ? prevScore : -prevScore;
                    const playerAfter = isWhite ? currentScore : -currentScore;

                    const isBest = m.classification === 'best' || m.classification === 'great';
                    const isBook = m.classification === 'book' || m.classification === 'last book';
                    const isForced = m.classification === 'forced';

                    if (isForced) {
                        prevScore = currentScore;
                        continue;
                    }

                    let acc;
                    if (isBest || isBook) {
                        acc = 100;
                    } else if (playerBefore >= 99000 && playerAfter < 99000) {
                        acc = 18.0;
                    } else if (playerBefore > -90000 && playerAfter <= -99000) {
                        acc = 5.0;
                    } else {
                        const normBefore = normalizeCp(playerBefore);
                        const normAfter = normalizeCp(playerAfter);
                        const dCp = Math.max(0, normBefore - normAfter);
                        if (dCp <= 10) {
                            acc = 100;
                        } else {
                            const beforeE = winExpectancy(playerBefore, rating);
                            const afterE = winExpectancy(playerAfter, rating);
                            const dE = Math.max(0, beforeE - afterE);

                            const winDiscount = normAfter > 200 ? Math.max(0.40, 1.0 - (normAfter - 200) / 2000) : 1.0;
                            const lossDiscount = normBefore < -200 ? Math.max(0.50, 1.0 - Math.abs(normBefore + 200) / 1500) : 1.0;

                            const effectiveCpLoss = (Math.max(0, dCp - 10) / 100) * cpWeight * winDiscount * lossDiscount;
                            const effectiveWinLoss = (dE * 100) * winWeight;
                            const totalLoss = effectiveWinLoss + effectiveCpLoss;

                            const rFactor = Math.pow(rating / 1000, -0.2);
                            const raw = 103.1668 * Math.exp(-k * totalLoss * rFactor) - 3.1668;
                            acc = Math.max(0, Math.min(100, raw));
                        }
                    }

                    (isWhite ? wAccs : bAccs).push(acc);
                    prevScore = currentScore;
                }

                // ORDINARY ARITHMETIC MEAN
                const wPred = wAccs.reduce((a, b) => a + b, 0) / wAccs.length;
                const bPred = bAccs.reduce((a, b) => a + b, 0) / bAccs.length;

                totalDiff += Math.abs(wPred - g.players.white.accuracy) + Math.abs(bPred - g.players.black.accuracy);
                count += 2;
            }

            const mae = totalDiff / count;
            if (mae < minMae) {
                minMae = mae;
                bestParams = { k, cpWeight, winWeight, mae };
            }
        }
    }
}

console.log('BEST ORDINARY MEAN PARAMETERS:');
console.log(bestParams);
console.log(`PARITY: ${(100 - minMae).toFixed(2)}% (MAE: ${minMae.toFixed(2)}%)`);
