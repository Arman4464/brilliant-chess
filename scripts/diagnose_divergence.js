const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, 'cache');
const files = fs.readdirSync(CACHE_DIR).filter(f => f.startsWith('game_') && f.endsWith('.json'));

// Production winExpectancy from src/engine/stockfish.ts
function winExpectancy(centipawns, rating = 1500) {
    if (centipawns >= 50000) return 1.0;
    if (centipawns <= -50000) return 0.0;
    const s = Math.max(0.60, Math.min(1.40, 0.65 + 0.25 * (rating / 1000)));
    return 1.0 / (1.0 + Math.pow(10, -centipawns / (400 * s)));
}

function caps2MoveAccuracy(deltaE, rating = 1500, deltaCp = 0, playerScoreAfter = 0) {
    if (deltaE <= 0.001 && deltaCp <= 10) return 100;
    const rFactor = Math.pow(rating / 1000, -0.2);
    const clampedAfter = Math.max(-1000, Math.min(1000, playerScoreAfter));
    const winScale = clampedAfter > 200 ? Math.max(0.15, 1.0 - (clampedAfter - 200) / 800) : 1.0;
    const cpPenalty = (Math.max(0, deltaCp - 8) / 100) * 3.0 * winScale;
    const effectiveLoss = (deltaE * 100) + cpPenalty;
    const k = 0.065;
    const raw = 103.1668 * Math.exp(-k * effectiveLoss * rFactor) - 3.1668;
    return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

function avg(arr) {
    if (arr.length === 0) return 100;
    const p = 0.30;
    const sumP = arr.reduce((acc, cur) => acc + Math.pow(Math.max(cur, 0.5), p), 0);
    const powerMeanVal = Math.pow(sumP / arr.length, 1 / p);
    const arithMeanVal = arr.reduce((acc, cur) => acc + cur, 0) / arr.length;
    return 0.75 * powerMeanVal + 0.25 * arithMeanVal;
}

const report = [];

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

        const clampedBefore = Math.max(-1000, Math.min(1000, m.scoreBefore));
        const clampedAfter = Math.max(-1000, Math.min(1000, m.scoreAfter));
        const deltaCp = Math.max(0, clampedBefore - clampedAfter);

        const beforeE = winExpectancy(m.scoreBefore, rating);
        const afterE = winExpectancy(m.scoreAfter, rating);
        const deltaE = Math.max(0, beforeE - afterE);

        const moveAcc = caps2MoveAccuracy(deltaE, rating, deltaCp, m.scoreAfter);
        (isWhite ? wMoves : bMoves).push(moveAcc);
    }

    const predW = avg(wMoves);
    const predB = avg(bMoves);
    const errW = Math.abs(predW - g.officialWhiteAcc);
    const errB = Math.abs(predB - g.officialBlackAcc);
    const maxErr = Math.max(errW, errB);

    report.push({
        id: g.id,
        movesCount: g.moves.length,
        wRating,
        bRating,
        predW, realW: g.officialWhiteAcc, errW,
        predB, realB: g.officialBlackAcc, errB,
        maxErr
    });
}

report.sort((a, b) => b.maxErr - a.maxErr);

console.log('--- TOP 5 DIVERGENT GAMES (HIGHEST ERROR) ---');
for (let i = 0; i < 5; i++) {
    const r = report[i];
    console.log(`Game ${r.id} (${r.movesCount} plies): White err=${r.errW.toFixed(1)}%, Black err=${r.errB.toFixed(1)}% | White: ${r.predW.toFixed(1)}% vs ${r.realW}%, Black: ${r.predB.toFixed(1)}% vs ${r.realB}%`);
}

console.log('\n--- TOP 5 BEST GAMES (LOWEST ERROR) ---');
for (let i = report.length - 1; i >= report.length - 5; i--) {
    const r = report[i];
    console.log(`Game ${r.id} (${r.movesCount} plies): White err=${r.errW.toFixed(1)}%, Black err=${r.errB.toFixed(1)}% | White: ${r.predW.toFixed(1)}% vs ${r.realW}%, Black: ${r.predB.toFixed(1)}% vs ${r.realB}%`);
}
