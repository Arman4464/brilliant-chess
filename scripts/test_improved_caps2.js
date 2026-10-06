const fs = require('fs');
const path = require('path');
const { loadCachedGames } = require('./train_and_calibrate');

const games = loadCachedGames();

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

function winExpectancy(cp, rating = 1500) {
    if (cp >= 50000) return 1.0;
    if (cp <= -50000) return 0.0;
    const s = Math.max(0.60, Math.min(1.40, 0.65 + 0.25 * (rating / 1000)));
    return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
}

function computeMoveAcc(m, rating, params) {
    // 1. Forced moves are excluded from calling function
    // 2. Best move
    if (m.isBest) return 100;

    // 3. Missed checkmate sequence: player had forced mate and let it slip
    if (m.scoreBefore >= 99000 && m.scoreAfter < 99000) {
        return 18.0; // Miss
    }

    // 4. Allowed forced checkmate from non-mate position: player blundered into mate
    if (m.scoreBefore > -90000 && m.scoreAfter <= -99000) {
        return 5.0; // Blunder
    }

    const normBefore = normalizeCp(m.scoreBefore);
    const normAfter = normalizeCp(m.scoreAfter);
    const dCp = Math.max(0, normBefore - normAfter);

    if (dCp <= params.cpTol) return 100;

    const beforeE = winExpectancy(m.scoreBefore, rating);
    const afterE = winExpectancy(m.scoreAfter, rating);
    const deltaE = Math.max(0, beforeE - afterE);

    // In won positions (normAfter > 200), cp loss is discounted but NOT zero
    const winDiscount = normAfter > 200 ? Math.max(0.20, 1.0 - (normAfter - 200) / 1000) : 1.0;
    // In lost positions (normBefore < -200), blundering more material still penalizes
    const lossDiscount = normBefore < -200 ? Math.max(0.40, 1.0 - Math.abs(normBefore + 200) / 1500) : 1.0;

    const effectiveCpLoss = (Math.max(0, dCp - params.cpTol) / 100) * params.cpWeight * winDiscount * lossDiscount;
    const effectiveWinLoss = (deltaE * 100) * params.winWeight;
    const totalLoss = effectiveWinLoss + effectiveCpLoss;

    const rFactor = Math.pow(rating / 1000, -0.2);
    const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-params.k * totalLoss * rFactor) - 3.1668));
    return acc;
}

function evaluateAll(params) {
    let totalErr = 0;
    let count = 0;

    for (const g of games) {
        const wRating = g.whiteRating || 1500;
        const bRating = g.blackRating || 1500;

        const wMoves = [];
        const bMoves = [];

        for (let i = 0; i < g.moves.length; i++) {
            const m = g.moves[i];
            const isW = m.color === 'white';
            const rating = isW ? wRating : bRating;

            if (m.isForced) continue;

            if (i < 4) {
                (isW ? wMoves : bMoves).push(100);
                continue;
            }

            const acc = computeMoveAcc(m, rating, params);
            (isW ? wMoves : bMoves).push(acc);
        }

        function avg(arr) {
            if (arr.length === 0) return 100;
            const arith = arr.reduce((a, b) => a + b, 0) / arr.length;
            const sumP = arr.reduce((a, b) => a + Math.pow(Math.max(b, 0.5), params.p), 0);
            const pMean = Math.pow(sumP / arr.length, 1 / params.p);
            return params.alpha * pMean + (1 - params.alpha) * arith;
        }

        const wPred = avg(wMoves);
        const bPred = avg(bMoves);

        totalErr += Math.abs(wPred - g.officialWhiteAcc) + Math.abs(bPred - g.officialBlackAcc);
        count += 2;
    }

    return totalErr / count;
}

let bestMAE = 999;
let bestP = null;

for (let k of [0.045, 0.055, 0.065, 0.075]) {
    for (let cpWeight of [2.5, 3.5, 4.5]) {
        for (let winWeight of [0.8, 1.0, 1.2]) {
            for (let p of [0.25, 0.30, 0.35]) {
                for (let alpha of [0.65, 0.70, 0.75]) {
                    const mae = evaluateAll({ k, cpWeight, winWeight, p, alpha, cpTol: 10 });
                    if (mae < bestMAE) {
                        bestMAE = mae;
                        bestP = { k, cpWeight, winWeight, p, alpha, cpTol: 10, mae, parity: (100 - mae).toFixed(2) + '%' };
                    }
                }
            }
        }
    }
}

console.log('--- BEST PARAMETERS WITH TACTICAL AWARENESS ---');
console.log(bestP);

// Check Game 168326527358
const g168 = games.find(g => g.id === '168326527358');
if (g168) {
    const wMoves = [];
    const bMoves = [];
    for (let i = 0; i < g168.moves.length; i++) {
        const m = g168.moves[i];
        const isW = m.color === 'white';
        const rating = isW ? g168.whiteRating : g168.blackRating;
        if (m.isForced) continue;
        if (i < 4) { (isW ? wMoves : bMoves).push(100); continue; }
        const acc = computeMoveAcc(m, rating, bestP);
        (isW ? wMoves : bMoves).push(acc);
    }
    function avg(arr) {
        const arith = arr.reduce((a, b) => a + b, 0) / arr.length;
        const sumP = arr.reduce((a, b) => a + Math.pow(Math.max(b, 0.5), bestP.p), 0);
        const pMean = Math.pow(sumP / arr.length, 1 / bestP.p);
        return bestP.alpha * pMean + (1 - bestP.alpha) * arith;
    }
    console.log(`\nGame 168326527358:`);
    console.log(`White: Pred = ${avg(wMoves).toFixed(1)}%, Official = ${g168.officialWhiteAcc}%`);
    console.log(`Black: Pred = ${avg(bMoves).toFixed(1)}%, Official = ${g168.officialBlackAcc}%`);
}
