const fs = require('fs');
const path = require('path');
const officialReview = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));
const cache = JSON.parse(fs.readFileSync('scripts/cache/eval_cache.json', 'utf8'));

console.log('Comparing Depth 18 evaluations vs Official Chess.com evaluations for Black:');
const blackMoves = officialReview.moves.filter(m => m.color === 'black');

for (const m of blackMoves) {
    console.log(`Ply ${m.ply} (${m.san}): Official Class=${m.classification}, Official Eval=${m.eval}`);
}
