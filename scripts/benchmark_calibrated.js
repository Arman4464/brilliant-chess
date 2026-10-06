const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, 'cache');
const files = fs.readdirSync(CACHE_DIR).filter(f => f.startsWith('game_') && f.endsWith('.json'));

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

function winExpectancy(centipawns, rating = 1500) {
    if (centipawns >= 50000) return 1.0;
    if (centipawns <= -50000) return 0.0;
    const s = Math.max(0.60, Math.min(1.40, 0.65 + 0.25 * (rating / 1000)));
    return 1.0 / (1.0 + Math.pow(10, -centipawns / (400 * s)));
}

function caps2MoveAccuracy(deltaE, rating = 1500, deltaCp = 0, playerScoreBefore = 0, playerScoreAfter = 0) {
    if (deltaE <= 0.001 && deltaCp <= 10) return 100;

    // 1. Missed forced mate: player had forced mate and let it slip
    if (playerScoreBefore >= 99000 && playerScoreAfter < 99000) {
        return 18.0;
    }

    // 2. Allowed forced checkmate from non-mate position
    if (playerScoreBefore > -90000 && playerScoreAfter <= -99000) {
        return 5.0;
    }

    const rFactor = Math.pow(rating / 1000, -0.2);
    const normBefore = normalizeCp(playerScoreBefore);
    const normAfter = normalizeCp(playerScoreAfter);
    const dCp = Math.max(0, normBefore - normAfter);

    const winDiscount = normAfter > 200 ? Math.max(0.20, 1.0 - (normAfter - 200) / 1000) : 1.0;
    const lossDiscount = normBefore < -200 ? Math.max(0.40, 1.0 - Math.abs(normBefore + 200) / 1500) : 1.0;

    const effectiveCpLoss = (Math.max(0, dCp - 10) / 100) * 4.5 * winDiscount * lossDiscount;
    const effectiveWinLoss = (deltaE * 100) * 0.8;
    const totalLoss = effectiveWinLoss + effectiveCpLoss;

    const k = 0.055;
    const raw = 103.1668 * Math.exp(-k * totalLoss * rFactor) - 3.1668;
    return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

function avg(arr) {
    if (arr.length === 0) return 100;
    const p = 0.25;
    const sumP = arr.reduce((acc, cur) => acc + Math.pow(Math.max(cur, 0.5), p), 0);
    const powerMeanVal = Math.pow(sumP / arr.length, 1 / p);
    const arithMeanVal = arr.reduce((acc, cur) => acc + cur, 0) / arr.length;
    return 0.65 * powerMeanVal + 0.35 * arithMeanVal;
}

console.log(`=== RUNNING BENCHMARK WITH TACTICAL AWARENESS ON 33 GAMES (66 PLAYERS) ===\n`);

let totalAbsErr = 0;
let totalPlayers = 0;
let within3 = 0;
let within5 = 0;

for (const f of files) {
    const g = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
    const wRating = g.whiteRating || 1500;
    const bRating = g.blackRating || 1500;

    const wMoves = [];
    const bMoves = [];

    for (let i = 0; i < g.moves.length; i++) {
        const m = g.moves[i];
        const isWhite = m.color === 'white';
        const rating = isWhite ? wRating : bRating;

        if (m.isForced) continue;

        if (i < 4 || m.isBest) {
            (isWhite ? wMoves : bMoves).push(100);
            continue;
        }

        const beforeE = winExpectancy(m.scoreBefore, rating);
        const afterE = winExpectancy(m.scoreAfter, rating);
        const deltaE = Math.max(0, beforeE - afterE);

        const moveAcc = caps2MoveAccuracy(deltaE, rating, m.deltaCp, m.scoreBefore, m.scoreAfter);
        (isWhite ? wMoves : bMoves).push(moveAcc);
    }

    const predW = avg(wMoves);
    const predB = avg(bMoves);
    const realW = g.officialWhiteAcc;
    const realB = g.officialBlackAcc;

    const errW = Math.abs(predW - realW);
    const errB = Math.abs(predB - realB);

    totalAbsErr += errW + errB;
    totalPlayers += 2;

    if (errW <= 3.0) within3++;
    if (errB <= 3.0) within3++;
    if (errW <= 5.0) within5++;
    if (errB <= 5.0) within5++;

    const signW = predW >= realW ? '+' : '';
    const signB = predB >= realB ? '+' : '';

    console.log(
        `${g.id.padEnd(12)} | ` +
        `${String(wRating).padStart(5)} | ` +
        `${predW.toFixed(1).padStart(5)}% / ${realW.toFixed(1).padStart(5)}% (${(signW + (predW - realW).toFixed(1)).padStart(6)}) | ` +
        `${String(bRating).padStart(5)} | ` +
        `${predB.toFixed(1).padStart(5)}% / ${realB.toFixed(1).padStart(5)}% (${(signB + (predB - realB).toFixed(1)).padStart(6)})`
    );
}

const mae = totalAbsErr / totalPlayers;
const parity = 100 - mae;

console.log('\n--- BENCHMARK RESULTS ---');
console.log(`Mean Absolute Error (MAE): ${mae.toFixed(2)}%`);
console.log(`Overall Accuracy Parity: ${parity.toFixed(2)}%`);
console.log(`Predictions within ±3%: ${within3} / ${totalPlayers} (${(within3 / totalPlayers * 100).toFixed(1)}%)`);
console.log(`Predictions within ±5%: ${within5} / ${totalPlayers} (${(within5 / totalPlayers * 100).toFixed(1)}%)`);
