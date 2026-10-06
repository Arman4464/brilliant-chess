const fs = require('fs');

const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));

console.log('Target White Accuracy:', sample.players.white.accuracy);
console.log('Target Black Accuracy:', sample.players.black.accuracy);

// Let's inspect each move, its classification, and see what move accuracies produce 66.1 and 73.3
const whiteMoves = sample.moves.filter(m => m.color === 'white');
const blackMoves = sample.moves.filter(m => m.color === 'black');

console.log(`White moves count: ${whiteMoves.length}, Black moves count: ${blackMoves.length}`);
console.log('White move classifications:');
const wCount = {};
for (const m of whiteMoves) {
    wCount[m.classification] = (wCount[m.classification] || 0) + 1;
}
console.log(wCount);

console.log('Black move classifications:');
const bCount = {};
for (const m of blackMoves) {
    bCount[m.classification] = (bCount[m.classification] || 0) + 1;
}
console.log(bCount);
