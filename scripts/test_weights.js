const fs = require('fs');

const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));

// Classification counts:
// White:
// book: 4, best: 11, excellent: 6, great: 1, good: 7, inaccuracy: 1, mistake: 3, miss: 2, blunder: 1, forced: 1
// Black:
// book: 3, best: 12, excellent: 7, great: 1, good: 5, inaccuracy: 4, mistake: 2, miss: 0, blunder: 1, forced: 2

// Target: White = 66.1, Black = 73.3

// Let's test standard Chess.com classification weightings:
// E.g.: Best/Brilliant/Great/Book = 100
// Excellent = ?
// Good = ?
// Inaccuracy = ?
// Mistake = ?
// Miss = ?
// Blunder = ?

// Let's run an optimization to find if there are fixed classification weights:
console.log('Testing optimization for fixed category weights...');
