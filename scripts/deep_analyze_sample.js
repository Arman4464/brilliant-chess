const fs = require('fs');

const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));

console.log('=== OFFICIAL SAMPLE STATS ===');
console.log('White Rating:', sample.players.white.rating);
console.log('Black Rating:', sample.players.black.rating);
console.log('White Accuracy:', sample.players.white.accuracy);
console.log('Black Accuracy:', sample.players.black.accuracy);
console.log('White Tallies:', sample.tallies);

// Check total moves per player in moves array
const wMoves = sample.moves.filter(m => m.color === 'white');
const bMoves = sample.moves.filter(m => m.color === 'black');

console.log(`White moves array count: ${wMoves.length}`);
console.log(`Black moves array count: ${bMoves.length}`);

// Count classifications in moves array
const wClasses = {};
const bClasses = {};
for (const m of wMoves) wClasses[m.classification] = (wClasses[m.classification] || 0) + 1;
for (const m of bMoves) bClasses[m.classification] = (bClasses[m.classification] || 0) + 1;

console.log('White classifications in moves array:', wClasses);
console.log('Black classifications in moves array:', bClasses);

// Notice:
// White: { book: 4, best: 11, excellent: 6, blunder: 1, forced: 1, good: 7, miss: 2, mistake: 3, great: 1, inaccuracy: 1 } -> sum = 37
// Black: { book: 3, best: 12, excellent: 7, good: 5, forced: 2, inaccuracy: 4, great: 1, blunder: 1, mistake: 2 } -> sum = 37
// Note that in sample.tallies, forced is NOT listed, and the sum is 36 for white, 35 for black!

// Now let's test if there is a discrete assignment or continuous function:
// Suppose each classification has an exact average weight:
// W_acc = (sum of weights) / N
// Let's test with N = 37 vs N = 36 for white, and N = 37 vs N = 35 for black!

// Using Linear Regression / Least Squares across both players:
// Let weights be [w_best, w_excellent, w_good, w_inaccuracy, w_mistake, w_miss, w_blunder]
// We know best=100, great=100, book=100.
// If forced is 100:
// White: 4*100 + 11*100 + 1*100 + 1*w_forced + 6*w_exc + 7*w_good + 1*w_inac + 3*w_mist + 2*w_miss + 1*w_blun = 37 * 66.1 = 2445.7
// Black: 3*100 + 12*100 + 1*100 + 2*w_forced + 7*w_exc + 5*w_good + 4*w_inac + 2*w_mist + 0*w_miss + 1*w_blun = 37 * 73.3 = 2712.1

// Now let's test the continuous CAPS2 formula on the actual evals:
// Convert eval string to centipawns
function evalStringToCp(evalStr) {
    if (!evalStr) return 0;
    const s = evalStr.trim();
    if (s.startsWith('M') || s.startsWith('+M')) {
        const moves = parseInt(s.replace('+M', '').replace('M', ''), 10);
        return 100000 - moves * 100;
    }
    if (s.startsWith('-M')) {
        const moves = parseInt(s.replace('-M', ''), 10);
        return -100000 + moves * 100;
    }
    if (s === '0-1') return -100000;
    if (s === '1-0') return 100000;
    if (s === '1/2-1/2') return 0;
    return Math.round(parseFloat(s) * 100);
}

// Win expectancy
function winExp(cp, rating, sScale = 1.0) {
    if (cp >= 50000) return 1.0;
    if (cp <= -50000) return 0.0;
    const s = Math.max(0.75, Math.min(1.25, 0.6 + (rating / 3750))) * sScale;
    return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
}

// Test grid of (k, power_p, blend)
console.log('\n--- TESTING CONTINUOUS WIN EXPECTANCY & POWER MEAN ON SAMPLE EVALS ---');
let bestErr = 999;
let bestC = null;

let prevWhiteCp = 20;
const evalsData = [];
for (let i = 0; i < sample.moves.length; i++) {
    const m = sample.moves[i];
    const cpAfter = evalStringToCp(m.eval);
    evalsData.push({
        color: m.color,
        san: m.san,
        classification: m.classification,
        beforeWhiteCp: prevWhiteCp,
        afterWhiteCp: cpAfter
    });
    prevWhiteCp = cpAfter;
}

for (let k = 0.01; k <= 0.08; k += 0.005) {
    for (let p of [0.1, 0.2, 0.25, 0.33, 0.5, 0.75, 1.0]) {
        for (let includeForced of [false, true]) {
            const wAccs = [];
            const bAccs = [];

            for (const item of evalsData) {
                const isW = item.color === 'white';
                const rating = isW ? sample.players.white.rating : sample.players.black.rating;
                const beforeCp = isW ? item.beforeWhiteCp : -item.beforeWhiteCp;
                const afterCp = isW ? item.afterWhiteCp : -item.afterWhiteCp;

                if (item.classification === 'forced') {
                    if (includeForced) {
                        (isW ? wAccs : bAccs).push(100);
                    }
                    continue;
                }

                let deltaE = Math.max(0, winExp(beforeCp, rating) - winExp(afterCp, rating));
                if (item.classification === 'book' || item.classification === 'best' || item.classification === 'great') {
                    deltaE = 0;
                }

                const winDiff = deltaE * 100;
                const moveAcc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-k * winDiff) - 3.1668));
                (isW ? wAccs : bAccs).push(moveAcc);
            }

            function calcAvg(arr) {
                if (p === 1.0) return arr.reduce((a, b) => a + b, 0) / arr.length;
                const sum = arr.reduce((a, b) => a + Math.pow(Math.max(b, 0.5), p), 0);
                return Math.pow(sum / arr.length, 1 / p);
            }

            const wRes = calcAvg(wAccs);
            const bRes = calcAvg(bAccs);
            const err = Math.abs(wRes - 66.1) + Math.abs(bRes - 73.3);

            if (err < bestErr) {
                bestErr = err;
                bestC = { k, p, includeForced, wRes, bRes, err };
            }
        }
    }
}

console.log('Best Continuous Fit on Sample:', bestC);
