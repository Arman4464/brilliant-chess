const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'review_data', 'move_by_move_reviews');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

function computeMoveAcc(m) {
    if (m.classification === 'best' || m.classification === 'book' || m.classification === 'great' || m.classification === 'brilliant') {
        return 100;
    }
    if (m.classification === 'excellent') {
        return 95.0;
    }
    if (m.classification === 'good') {
        return 80.0;
    }
    if (m.classification === 'inaccuracy') {
        return 50.0;
    }
    if (m.classification === 'mistake') {
        return 20.0;
    }
    if (m.classification === 'miss') {
        return 15.0;
    }
    if (m.classification === 'blunder') {
        return 5.0;
    }
    return 80;
}

function avg(arr, p = 0.25, alpha = 0.65) {
    if (arr.length === 0) return 100;
    const arith = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sumP = arr.reduce((a, b) => a + Math.pow(Math.max(b, 0.5), p), 0);
    const pMean = Math.pow(sumP / arr.length, 1 / p);
    return alpha * pMean + (1 - alpha) * arith;
}

console.log('========================================================================================');
console.log('BENCHMARK ON OFFICIAL MOVE-BY-MOVE GROUND TRUTH REVIEWS (11 GAMES / 22 PLAYERS)');
console.log('========================================================================================');

let totalDiff = 0;
let playerCount = 0;
let exactMatches = 0; // within 2%

for (const file of files) {
    const rev = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (!rev.players?.white?.accuracy || !rev.players?.black?.accuracy) continue;

    const wMoves = [];
    const bMoves = [];

    for (const m of rev.moves) {
        if (m.classification === 'forced') continue;
        const isW = m.color === 'white';
        const acc = computeMoveAcc(m);
        (isW ? wMoves : bMoves).push(acc);
    }

    const wPred = avg(wMoves);
    const bPred = avg(bMoves);

    const wTarget = rev.players.white.accuracy;
    const bTarget = rev.players.black.accuracy;

    const wDiff = Math.abs(wPred - wTarget);
    const bDiff = Math.abs(bPred - bTarget);

    totalDiff += wDiff + bDiff;
    playerCount += 2;

    if (wDiff <= 2.0) exactMatches++;
    if (bDiff <= 2.0) exactMatches++;

    console.log(
        `${rev.game.id.padEnd(14)} | White (${rev.players.white.username?.padEnd(12)}): Pred ${wPred.toFixed(1).padStart(5)}% vs Target ${wTarget.toFixed(1).padStart(5)}% (Diff ${(wPred - wTarget).toFixed(1).padStart(5)}%) | Black (${rev.players.black.username?.padEnd(12)}): Pred ${bPred.toFixed(1).padStart(5)}% vs Target ${bTarget.toFixed(1).padStart(5)}% (Diff ${(bPred - bTarget).toFixed(1).padStart(5)}%)`
    );
}

const mae = totalDiff / playerCount;
const parity = 100 - mae;
console.log('========================================================================================');
console.log(`TOTAL PLAYERS EVALUATED : ${playerCount}`);
console.log(`MEAN ABSOLUTE ERROR     : ${mae.toFixed(2)}%`);
console.log(`PARITY WITH CHESS.COM   : ${parity.toFixed(2)}%`);
console.log(`WITHIN ±2% ACCURACY     : ${((exactMatches / playerCount) * 100).toFixed(1)}%`);
console.log('========================================================================================');
