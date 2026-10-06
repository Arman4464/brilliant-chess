const fs = require('fs');

// In sample_extracted_review.json:
// White official accuracy: 66.1%
// Black official accuracy: 73.3%

// Let's test standard Chess.com / CAPS2 discrete values or bounds:
// On Chess.com, move classifications are:
// Brilliant: 100%
// Great: 100%
// Best: 100%
// Book: 100%
// Forced: Excluded from accuracy OR 100%? Let's test both!

// Let's test:
// Best/Great/Book: 100
// What values for (Excellent, Good, Inaccuracy, Mistake, Miss, Blunder) fit best?

// White tallies:
// { great: 1, best: 11, excellent: 6, book: 4, good: 7, inaccuracy: 1, mistake: 3, miss: 2, blunder: 1 }
// Black tallies:
// { great: 1, best: 12, excellent: 7, book: 3, good: 5, inaccuracy: 4, mistake: 2, miss: 0, blunder: 1 }

const testConfigs = [
    { name: "Option A (standard school scale)", excellent: 90, good: 75, inaccuracy: 50, mistake: 25, miss: 15, blunder: 0 },
    { name: "Option B (standard CAPS values)", excellent: 95, good: 80, inaccuracy: 55, mistake: 30, miss: 20, blunder: 5 },
    { name: "Option C", excellent: 92, good: 70, inaccuracy: 45, mistake: 20, miss: 15, blunder: 0 },
    { name: "Option D", excellent: 88, good: 70, inaccuracy: 50, mistake: 25, miss: 20, blunder: 0 },
    { name: "Option E", excellent: 91, good: 72, inaccuracy: 50, mistake: 30, miss: 20, blunder: 10 },
];

function evalTally(tallies, weights, includeForced = 0) {
    const totalMoves = tallies.best + tallies.book + tallies.great + tallies.excellent +
                       tallies.good + tallies.inaccuracy + tallies.mistake + tallies.miss + tallies.blunder + includeForced;
    const score = (tallies.best + tallies.book + tallies.great) * 100 +
                  tallies.excellent * weights.excellent +
                  tallies.good * weights.good +
                  tallies.inaccuracy * weights.inaccuracy +
                  tallies.mistake * weights.mistake +
                  tallies.miss * weights.miss +
                  tallies.blunder * weights.blunder +
                  includeForced * 100;
    return score / totalMoves;
}

const wTallies = { great: 1, best: 11, excellent: 6, book: 4, good: 7, inaccuracy: 1, mistake: 3, miss: 2, blunder: 1 };
const bTallies = { great: 1, best: 12, excellent: 7, book: 3, good: 5, inaccuracy: 4, mistake: 2, miss: 0, blunder: 1 };

console.log("Testing with forced excluded (36 white moves, 35 black moves):");
for (const cfg of testConfigs) {
    const wScore = evalTally(wTallies, cfg, 0);
    const bScore = evalTally(bTallies, cfg, 0);
    console.log(`${cfg.name}: White = ${wScore.toFixed(2)}% (target: 66.1), Black = ${bScore.toFixed(2)}% (target: 73.3)`);
}

console.log("\nTesting with forced included as 100% (37 white moves, 37 black moves):");
for (const cfg of testConfigs) {
    const wScore = evalTally(wTallies, cfg, 1);
    const bScore = evalTally(bTallies, cfg, 2);
    console.log(`${cfg.name}: White = ${wScore.toFixed(2)}% (target: 66.1), Black = ${bScore.toFixed(2)}% (target: 73.3)`);
}
