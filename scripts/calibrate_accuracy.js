const fs = require('fs');

const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));

// White tallies:
// great: 1, best: 11, excellent: 6, book: 4, good: 7, inaccuracy: 1, mistake: 3, miss: 2, blunder: 1, forced: 1
// Black tallies:
// great: 1, best: 12, excellent: 7, book: 3, good: 5, inaccuracy: 4, mistake: 2, miss: 0, blunder: 1, forced: 2

// Official: White = 66.1%, Black = 73.3%

// Let's test a continuous or discrete formula:
// What if each move classification has an average accuracy in CAPS2:
// For example:
// Best/Book/Great/Brilliant: 100
// Excellent: e
// Good: g
// Inaccuracy: i
// Mistake: m
// Miss: s
// Blunder: b

// We have 2 equations:
// White: (16*100 + 6*e + 7*g + 1*i + 3*m + 2*s + 1*b + forced*f) / N_w = 66.1
// Black: (16*100 + 7*e + 5*g + 4*i + 2*m + 0*s + 1*b + forced*f) / N_b = 73.3

// Let's test standard values from CAPS / chess literature:
// In CAPS:
// Excellent is approx 85 - 90
// Good is approx 65 - 75
// Inaccuracy is approx 40 - 50
// Mistake is approx 15 - 25
// Miss is approx 10 - 20
// Blunder is approx 0 - 5

console.log("Searching parameter grid...");

let bestDiff = 999;
let bestParams = null;

for (let e = 80; e <= 95; e += 1) {
    for (let g = 55; g <= 75; g += 1) {
        for (let i = 30; i <= 50; i += 1) {
            for (let m = 10; m <= 25; m += 1) {
                for (let s = 5; s <= 20; s += 1) {
                    for (let b = 0; b <= 10; b += 1) {
                        for (let includeForced of [0, 1]) {
                            const wTotal = 36 + (includeForced ? 1 : 0);
                            const bTotal = 35 + (includeForced ? 2 : 0);
                            
                            const wScore = (16 * 100 + 6 * e + 7 * g + 1 * i + 3 * m + 2 * s + 1 * b + (includeForced ? 100 : 0)) / wTotal;
                            const bScore = (16 * 100 + 7 * e + 5 * g + 4 * i + 2 * m + 0 * s + 1 * b + (includeForced ? 200 : 0)) / bTotal;
                            
                            const diff = Math.abs(wScore - 66.1) + Math.abs(bScore - 73.3);
                            if (diff < bestDiff) {
                                bestDiff = diff;
                                bestParams = { e, g, i, m, s, b, includeForced, wScore, bScore, diff };
                            }
                        }
                    }
                }
            }
        }
    }
}

console.log("Best Discrete Parameters:", bestParams);
