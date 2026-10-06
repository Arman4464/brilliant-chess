const fs = require('fs');
const rev = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_165803154362.json', 'utf8'));

function parseScore(evalStr) {
    if (!evalStr) return 0;
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
    return Math.round(parseFloat(evalStr) * 100);
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

function winExpectancy(cp, rating = 1500) {
    if (cp >= 50000) return 1.0;
    if (cp <= -50000) return 0.0;
    const s = Math.max(0.60, Math.min(1.40, 0.65 + 0.25 * (rating / 1000)));
    return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
}

function computeMoveAcc(m, rating) {
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

const wRating = rev.players.white.rating || 248;
const bRating = rev.players.black.rating || 281;

const wAccs = [];
const bAccs = [];

for (const m of rev.moves) {
    if (m.classification === 'forced') continue;
    const isW = m.color === 'white';
    const acc = computeMoveAcc(m, isW ? wRating : bRating);
    (isW ? wAccs : bAccs).push(acc);
}

function avg(arr, p = 0.25, alpha = 0.65) {
    const arith = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sumP = arr.reduce((a, b) => a + Math.pow(Math.max(b, 0.5), p), 0);
    const pMean = Math.pow(sumP / arr.length, 1 / p);
    return alpha * pMean + (1 - alpha) * arith;
}

console.log('--- Classification Tally Aggregation ---');
console.log('White Predicted:', avg(wAccs).toFixed(1), 'Target UI:', rev.players.white.accuracy, 'Target API:', 65.46);
console.log('Black Predicted:', avg(bAccs).toFixed(1), 'Target UI:', rev.players.black.accuracy, 'Target API:', 73.54);
