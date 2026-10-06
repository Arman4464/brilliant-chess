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
    if (score >= 50000) {
        const moves = Math.max(1, Math.round((100000 - score) / 100));
        return 2000 + Math.max(0, 500 - moves * 20);
    }
    if (score <= -50000) {
        const moves = Math.max(1, Math.round((100000 - Math.abs(score)) / 100));
        return -2000 - Math.max(0, 500 - moves * 20);
    }
    return score;
}

function winExpectancy(cp, rating = 1000) {
    if (cp >= 50000) return 1.0;
    if (cp <= -50000) return 0.0;
    const s = Math.max(0.60, Math.min(1.40, 0.65 + 0.25 * (rating / 1000)));
    return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
}

function caps2MoveAccuracy(deltaE, rating, deltaCp, playerScoreBefore, playerScoreAfter, isBest, isBook, isForced) {
    if (isBest || isBook) return 100;
    if (isForced) return null;

    if (playerScoreBefore >= 99000 && playerScoreAfter < 99000) return 18.0;
    if (playerScoreBefore > -90000 && playerScoreAfter <= -99000) return 5.0;

    const rFactor = Math.pow(rating / 1000, -0.2);
    const normBefore = normalizeCp(playerScoreBefore);
    const normAfter = normalizeCp(playerScoreAfter);
    const dCp = Math.max(0, normBefore - normAfter);

    const winDiscount = normAfter > 200 ? Math.max(0.20, 1.0 - (normAfter - 200) / 1000) : 1.0;
    const lossDiscount = normBefore < -200 ? Math.max(0.40, 1.0 - Math.abs(normBefore + 200) / 1500) : 1.0;

    const effectiveCpLoss = (Math.max(0, dCp - 10) / 100) * 3.2 * winDiscount * lossDiscount;
    const effectiveWinLoss = (deltaE * 100) * 0.85;
    const totalLoss = effectiveWinLoss + effectiveCpLoss;

    const k = 0.046;
    const raw = 103.1668 * Math.exp(-k * totalLoss * rFactor) - 3.1668;
    return Math.max(0, Math.min(100, raw));
}

function avg(arr, p = 0.25, alpha = 0.70) {
    if (arr.length === 0) return 100;
    const arith = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sumP = arr.reduce((a, b) => a + Math.pow(Math.max(b, 0.5), p), 0);
    const pMean = Math.pow(sumP / arr.length, 1 / p);
    return alpha * pMean + (1 - alpha) * arith;
}

let totalDiff = 0, count = 0;

console.log('========================================================================================');
console.log('CONTINUOUS CAPS2 WIN EXPECTANCY MODEL vs OFFICIAL GAME REVIEW ACCURACIES');
console.log('========================================================================================');

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

        const beforeNorm = normalizeCp(playerBefore);
        const afterNorm = normalizeCp(playerAfter);
        const dCp = Math.max(0, beforeNorm - afterNorm);

        const beforeE = winExpectancy(playerBefore, rating);
        const afterE = winExpectancy(playerAfter, rating);
        const dE = Math.max(0, beforeE - afterE);

        const isBest = m.classification === 'best' || m.classification === 'great';
        const isBook = m.classification === 'book' || m.classification === 'last book';
        const isForced = m.classification === 'forced';

        const acc = caps2MoveAccuracy(dE, rating, dCp, playerBefore, playerAfter, isBest, isBook, isForced);
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
        `${g.game.id.padEnd(14)} | White (${g.players.white.username?.padEnd(12)}): Pred ${wPred.toFixed(1)}% vs Target ${wTarget}% (Diff ${(wPred - wTarget).toFixed(1)}%) | Black (${g.players.black.username?.padEnd(12)}): Pred ${bPred.toFixed(1)}% vs Target ${bTarget}% (Diff ${(bPred - bTarget).toFixed(1)}%)`
    );
}

const mae = totalDiff / count;
console.log('========================================================================================');
console.log(`MEAN ABSOLUTE ERROR : ${mae.toFixed(2)}%`);
console.log(`PARITY WITH CHESS.COM: ${(100 - mae).toFixed(2)}%`);
console.log('========================================================================================');
