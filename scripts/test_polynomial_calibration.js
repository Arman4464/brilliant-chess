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

function computeMoveAcc(m, playerBefore, playerAfter, rating) {
    if (m.classification === 'best' || m.classification === 'book' || m.classification === 'last book' || m.classification === 'great' || m.classification === 'brilliant') return 100;
    if (m.classification === 'forced') return null;
    if (playerBefore >= 99000 && playerAfter < 99000) return 18.0;
    if (playerBefore > -90000 && playerAfter <= -99000) return 5.0;

    const normBefore = normalizeCp(playerBefore);
    const normAfter = normalizeCp(playerAfter);
    const dCp = Math.max(0, normBefore - normAfter);
    if (dCp <= 10) return 100;

    const beforeE = winExpectancy(playerBefore, rating);
    const afterE = winExpectancy(playerAfter, rating);
    const dE = Math.max(0, beforeE - afterE);

    const winDiscount = normAfter > 200 ? Math.max(0.40, 1.0 - (normAfter - 200) / 2000) : 1.0;
    const lossDiscount = normBefore < -200 ? Math.max(0.50, 1.0 - Math.abs(normBefore + 200) / 1500) : 1.0;

    const effectiveCpLoss = (Math.max(0, dCp - 10) / 100) * 4.5 * winDiscount * lossDiscount;
    const effectiveWinLoss = (dE * 100) * 1.0;
    const totalLoss = effectiveWinLoss + effectiveCpLoss;
    const rFactor = Math.pow(rating / 1000, -0.2);
    let acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.055 * totalLoss * rFactor) - 3.1668));

    if (m.classification === 'excellent') acc = Math.max(acc, 93.0);
    if (m.classification === 'good') acc = Math.min(acc, 85.0);
    if (m.classification === 'inaccuracy') acc = Math.min(acc, 60.0);
    if (m.classification === 'mistake') acc = Math.min(acc, 25.0);
    if (m.classification === 'miss') acc = Math.min(acc, 18.0);
    if (m.classification === 'blunder') acc = Math.min(acc, 6.0);

    return acc;
}

function avg(arr) {
    if (arr.length === 0) return 100;
    const p = 0.20;
    const arith = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sumP = arr.reduce((a, b) => a + Math.pow(Math.max(b, 0.5), p), 0);
    const pMean = Math.pow(sumP / arr.length, 1 / p);
    return 0.80 * pMean + 0.20 * arith;
}

const dataPoints = [];

for (const g of games) {
    for (const color of ['white', 'black']) {
        const rating = g.players[color].rating || 1000;
        const moves = g.moves.filter(m => m.color === color);
        const accs = [];
        let prevScore = 25;

        for (const m of g.moves) {
            const isTargetColor = m.color === color;
            const currentScore = parseScore(m.eval);
            if (currentScore === null) continue;

            if (isTargetColor) {
                const playerBefore = color === 'white' ? prevScore : -prevScore;
                const playerAfter = color === 'white' ? currentScore : -currentScore;
                const acc = computeMoveAcc(m, playerBefore, playerAfter, rating);
                if (acc !== null) accs.push(acc);
            }
            prevScore = currentScore;
        }

        const rawPred = avg(accs);
        const target = g.players[color].accuracy;
        dataPoints.push({ rawPred, target, rating, id: g.game.id, color });
    }
}

console.log('Raw Predictions vs Targets:');
for (const dp of dataPoints) {
    console.log(`${dp.id} ${dp.color.padEnd(5)} | Raw: ${dp.rawPred.toFixed(1)}% | Target: ${dp.target}% | Diff: ${(dp.rawPred - dp.target).toFixed(1)}%`);
}

// Fit linear calibration: target = a * rawPred + b
const n = dataPoints.length;
let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
for (const dp of dataPoints) {
    sumX += dp.rawPred;
    sumY += dp.target;
    sumXY += dp.rawPred * dp.target;
    sumX2 += dp.rawPred * dp.rawPred;
}
const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
const intercept = (sumY - slope * sumX) / n;

console.log(`\nFitted Linear Calibration Curve: Target = ${slope.toFixed(4)} * Raw + ${intercept.toFixed(4)}`);

let totalCalDiff = 0;
for (const dp of dataPoints) {
    const calPred = slope * dp.rawPred + intercept;
    totalCalDiff += Math.abs(calPred - dp.target);
}
const calMae = totalCalDiff / n;
console.log(`Calibrated MAE: ${calMae.toFixed(2)}% | Calibrated Parity: ${(100 - calMae).toFixed(2)}%`);
