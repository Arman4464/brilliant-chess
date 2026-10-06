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

function parseScore(evalStr, prevScore) {
    if (!evalStr) return null;
    if (evalStr === '0-1') return -100000;
    if (evalStr === '1-0') return 100000;
    if (evalStr === '1/2-1/2') return 0;
    if (evalStr.startsWith('-M')) return -100000 + parseInt(evalStr.slice(2), 10) * 100;
    if (evalStr.startsWith('M')) {
        const moves = parseInt(evalStr.slice(1), 10);
        if (prevScore !== null && prevScore < -150) {
            return -100000 + moves * 100;
        }
        return 100000 - moves * 100;
    }
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
    if (m.classification === 'best' || m.classification === 'book' || m.classification === 'last book' || m.classification === 'great' || m.classification === 'brilliant') {
        return 100;
    }
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

    // Bound by official classification
    if (m.classification === 'excellent') acc = Math.max(acc, 93.0);
    if (m.classification === 'good') acc = Math.min(acc, 85.0);
    if (m.classification === 'inaccuracy') acc = Math.min(acc, 60.0);
    if (m.classification === 'mistake') acc = Math.min(acc, 30.0);
    if (m.classification === 'miss') acc = Math.min(acc, 18.0);
    if (m.classification === 'blunder') acc = Math.min(acc, 6.0);

    return acc;
}

function avg(arr) {
    if (arr.length === 0) return 100;
    const p = 0.35;
    const arith = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sumP = arr.reduce((a, b) => a + Math.pow(Math.max(b, 0.5), p), 0);
    const pMean = Math.pow(sumP / arr.length, 1 / p);
    return 0.50 * pMean + 0.50 * arith;
}

console.log('========================================================================================');
console.log('CALIBRATED BENCHMARK ON ALL OFFICIAL GROUND TRUTH MOVE-BY-MOVE REVIEWS (12 PLAYERS)');
console.log('========================================================================================');

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
        const currentScore = parseScore(m.eval, prevScore);
        if (currentScore === null) continue;

        const playerBefore = isWhite ? prevScore : -prevScore;
        const playerAfter = isWhite ? currentScore : -currentScore;

        const acc = computeMoveAcc(m, playerBefore, playerAfter, rating);
        if (acc !== null) {
            (isWhite ? wAccs : bAccs).push(acc);
        }

        prevScore = currentScore;
    }

    const wPred = avg(wAccs);
    const bPred = avg(bAccs);
    const wTarget = g.players.white.accuracy;
    const bTarget = g.players.black.accuracy;

    totalDiff += Math.abs(wPred - wTarget) + Math.abs(bPred - bTarget);
    count += 2;

    console.log(
        `${g.game.id.padEnd(14)} | White (${g.players.white.username?.padEnd(12)}): Pred ${wPred.toFixed(1)}% vs Target ${String(wTarget).padStart(5)}% (Diff ${(wPred - wTarget).toFixed(1).padStart(5)}%) | Black (${g.players.black.username?.padEnd(12)}): Pred ${bPred.toFixed(1)}% vs Target ${String(bTarget).padStart(5)}% (Diff ${(bPred - bTarget).toFixed(1).padStart(5)}%)`
    );
}

const mae = totalDiff / count;
console.log('========================================================================================');
console.log(`TOTAL PLAYERS EVALUATED : ${count}`);
console.log(`MEAN ABSOLUTE ERROR     : ${mae.toFixed(2)}%`);
console.log(`OVERALL PARITY          : ${(100 - mae).toFixed(2)}%`);
console.log('========================================================================================');
