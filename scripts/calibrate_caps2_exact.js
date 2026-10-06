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

// Pre-calculate moves features for speed
const precalculatedGames = games.map(g => {
    const wRating = g.players.white.rating || 1000;
    const bRating = g.players.black.rating || 1000;
    const moves = [];
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

        moves.push({
            isWhite,
            rating,
            dE,
            dCp,
            playerBefore,
            playerAfter,
            isBest,
            isBook,
            isForced
        });

        prevScore = currentScore;
    }

    return {
        id: g.game.id,
        wTarget: g.players.white.accuracy,
        bTarget: g.players.black.accuracy,
        moves
    };
});

function evaluate(params) {
    const { k, cpWeight, winWeight, p, alpha } = params;
    let totalDiff = 0, count = 0;

    for (const g of precalculatedGames) {
        const wAccs = [];
        const bAccs = [];

        for (const m of g.moves) {
            if (m.isForced) continue;
            if (m.isBest || m.isBook) {
                (m.isWhite ? wAccs : bAccs).push(100);
                continue;
            }

            if (m.playerBefore >= 99000 && m.playerAfter < 99000) {
                (m.isWhite ? wAccs : bAccs).push(18.0);
                continue;
            }
            if (m.playerBefore > -90000 && m.playerAfter <= -99000) {
                (m.isWhite ? wAccs : bAccs).push(5.0);
                continue;
            }

            const rFactor = Math.pow(m.rating / 1000, -0.2);
            const winDiscount = m.playerAfter > 200 ? Math.max(0.20, 1.0 - (m.playerAfter - 200) / 1000) : 1.0;
            const lossDiscount = m.playerBefore < -200 ? Math.max(0.40, 1.0 - Math.abs(m.playerBefore + 200) / 1500) : 1.0;

            const effectiveCpLoss = (Math.max(0, m.dCp - 10) / 100) * cpWeight * winDiscount * lossDiscount;
            const effectiveWinLoss = (m.dE * 100) * winWeight;
            const totalLoss = effectiveWinLoss + effectiveCpLoss;

            const raw = 103.1668 * Math.exp(-k * totalLoss * rFactor) - 3.1668;
            const acc = Math.max(0, Math.min(100, raw));
            (m.isWhite ? wAccs : bAccs).push(acc);
        }

        function avg(arr) {
            if (arr.length === 0) return 100;
            const arith = arr.reduce((a, b) => a + b, 0) / arr.length;
            const sumP = arr.reduce((a, b) => a + Math.pow(Math.max(b, 0.5), p), 0);
            const pMean = Math.pow(sumP / arr.length, 1 / p);
            return alpha * pMean + (1 - alpha) * arith;
        }

        const wPred = avg(wAccs);
        const bPred = avg(bAccs);

        totalDiff += Math.abs(wPred - g.wTarget) + Math.abs(bPred - g.bTarget);
        count += 2;
    }

    return totalDiff / count;
}

let bestParams = null;
let minMae = 999;

for (let k of [0.055, 0.065, 0.075, 0.085, 0.095]) {
    for (let cpWeight of [3.5, 4.5, 5.5, 6.5]) {
        for (let winWeight of [1.0, 1.2, 1.5, 1.8]) {
            for (let p of [0.15, 0.20, 0.25]) {
                for (let alpha of [0.60, 0.70, 0.80]) {
                    const mae = evaluate({ k, cpWeight, winWeight, p, alpha });
                    if (mae < minMae) {
                        minMae = mae;
                        bestParams = { k, cpWeight, winWeight, p, alpha, mae };
                    }
                }
            }
        }
    }
}

console.log('BEST CONTINUOUS CAPS2 PARAMETERS:');
console.log(bestParams);
console.log(`PARITY ACHIEVED: ${(100 - minMae).toFixed(2)}% (MAE: ${minMae.toFixed(2)}%)`);
