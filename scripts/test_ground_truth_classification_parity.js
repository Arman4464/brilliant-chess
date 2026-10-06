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
    if (evalStr.startsWith('M')) {
        const moves = parseInt(evalStr.slice(1), 10);
        return 100000 - moves * 100;
    }
    if (evalStr.startsWith('-M')) {
        const moves = parseInt(evalStr.slice(2), 10);
        return -100000 + moves * 100;
    }
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

function classifyMove(deltaE, deltaCp, playerScoreBefore, playerScoreAfter, isBest, isBook, isForced, isSacrifice, opponentPrevClass, th) {
    if (isBook) return 'book';
    if (isForced) return 'forced';
    if (isSacrifice && deltaE <= 0.025 && playerScoreBefore <= 350) return 'brilliant';

    const missedMate = playerScoreBefore >= 50000 && playerScoreAfter < 50000;
    if (missedMate || ((opponentPrevClass === 'mistake' || opponentPrevClass === 'blunder') && deltaE >= 0.20 && !isBest)) {
        return 'miss';
    }

    if (isBest || deltaCp <= 10) return 'best';

    // Mate sequences
    if (playerScoreBefore >= 90000 && playerScoreAfter >= 90000) return 'excellent';

    // Blunder
    if ((deltaE >= th.blunderDE || deltaCp >= th.blunderCp) && playerScoreAfter < -150) {
        return 'blunder';
    }

    // Mistake
    if (deltaE >= th.mistakeDE || deltaCp >= th.mistakeCp || (playerScoreBefore >= 180 && playerScoreAfter <= 40)) {
        return 'mistake';
    }

    // Inaccuracy
    if (deltaE >= th.inaccDE || deltaCp >= th.inaccCp) {
        return 'inaccuracy';
    }

    // Good
    if (deltaE >= th.goodDE || deltaCp >= th.goodCp) {
        return 'good';
    }

    // Excellent
    return 'excellent';
}

function testThresholds(th) {
    let matches = 0;
    let total = 0;

    for (const g of games) {
        const wRating = g.players.white.rating || 1000;
        const bRating = g.players.black.rating || 1000;
        let prevScore = 25;
        let prevClass = undefined;

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

            const actualClass = m.classification === 'last book' ? 'book' : m.classification;
            const isBest = actualClass === 'best' || actualClass === 'great';
            const isBook = actualClass === 'book';
            const isForced = actualClass === 'forced';
            const isSacrifice = actualClass === 'brilliant';

            const predictedClass = classifyMove(dE, dCp, playerBefore, playerAfter, isBest, isBook, isForced, isSacrifice, prevClass, th);

            if (predictedClass === actualClass) {
                matches++;
            }
            total++;
            prevScore = currentScore;
            prevClass = actualClass;
        }
    }

    return { matches, total, rate: (matches / total) * 100 };
}

// Current baseline thresholds
const currentTh = {
    blunderDE: 0.20, blunderCp: 250,
    mistakeDE: 0.10, mistakeCp: 140,
    inaccDE: 0.040, inaccCp: 75,
    goodDE: 0.025, goodCp: 40
};

console.log('Current thresholds accuracy:');
console.log(testThresholds(currentTh));

// Search for optimal classification thresholds
let bestTh = null;
let bestRate = 0;

for (let inaccDE of [0.045, 0.050, 0.055, 0.060]) {
    for (let inaccCp of [60, 75, 85, 100]) {
        for (let goodDE of [0.020, 0.025, 0.030]) {
            for (let goodCp of [30, 35, 40, 45]) {
                for (let mistakeDE of [0.09, 0.10, 0.12]) {
                    for (let mistakeCp of [130, 140, 160]) {
                        const th = {
                            blunderDE: 0.22, blunderCp: 250,
                            mistakeDE, mistakeCp,
                            inaccDE, inaccCp,
                            goodDE, goodCp
                        };
                        const res = testThresholds(th);
                        if (res.rate > bestRate) {
                            bestRate = res.rate;
                            bestTh = th;
                        }
                    }
                }
            }
        }
    }
}

console.log(`\nOptimal thresholds found (Exact match rate: ${bestRate.toFixed(2)}%):`);
console.log(bestTh);
