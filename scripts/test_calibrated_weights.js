const fs = require('fs');

const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));

// Ground truth classifications
const groundTruthClasses = sample.moves.map(m => ({
    ply: m.ply,
    color: m.color,
    san: m.san,
    classification: m.classification,
    eval: m.eval
}));

// In sample_extracted_review.json, what are the accuracy scores if we use
// standard Chess.com classification accuracy values?
// Brilliant: 100
// Great: 100
// Best: 100
// Book / Last Book: 100
// Forced: Excluded (or 100)
// Excellent: 84
// Good: 68
// Inaccuracy: 45
// Mistake: 20
// Miss: 15
// Blunder: 0

function getClassificationAccuracy(cls) {
    switch (cls) {
        case 'brilliant':
        case 'great':
        case 'best':
        case 'book':
        case 'last book':
            return 100;
        case 'excellent':
            return 84;
        case 'good':
            return 66;
        case 'inaccuracy':
            return 45;
        case 'mistake':
            return 20;
        case 'miss':
            return 12;
        case 'blunder':
            return 0;
        default:
            return 70;
    }
}

// Compute White and Black game accuracy from ground truth move classifications
const wMoves = groundTruthClasses.filter(m => m.color === 'white' && m.classification !== 'forced');
const bMoves = groundTruthClasses.filter(m => m.color === 'black' && m.classification !== 'forced');

const wAcc = wMoves.reduce((s, m) => s + getClassificationAccuracy(m.classification), 0) / wMoves.length;
const bAcc = bMoves.reduce((s, m) => s + getClassificationAccuracy(m.classification), 0) / bMoves.length;

console.log(`With calibrated classification weights (forced excluded):`);
console.log(`White: computed = ${wAcc.toFixed(1)}%, official = ${sample.players.white.accuracy}% (diff = ${(wAcc - sample.players.white.accuracy).toFixed(2)}%)`);
console.log(`Black: computed = ${bAcc.toFixed(1)}%, official = ${sample.players.black.accuracy}% (diff = ${(bAcc - sample.players.black.accuracy).toFixed(2)}%)`);

// What if forced is included as 100%?
const wMovesForced = groundTruthClasses.filter(m => m.color === 'white');
const bMovesForced = groundTruthClasses.filter(m => m.color === 'black');
const wAccF = wMovesForced.reduce((s, m) => s + (m.classification === 'forced' ? 100 : getClassificationAccuracy(m.classification)), 0) / wMovesForced.length;
const bAccF = bMovesForced.reduce((s, m) => s + (m.classification === 'forced' ? 100 : getClassificationAccuracy(m.classification)), 0) / bMovesForced.length;
console.log(`\nWith forced included as 100%:`);
console.log(`White: computed = ${wAccF.toFixed(1)}%, official = ${sample.players.white.accuracy}% (diff = ${(wAccF - sample.players.white.accuracy).toFixed(2)}%)`);
console.log(`Black: computed = ${bAccF.toFixed(1)}%, official = ${sample.players.black.accuracy}% (diff = ${(bAccF - sample.players.black.accuracy).toFixed(2)}%)`);
