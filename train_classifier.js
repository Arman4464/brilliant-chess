const fs = require('fs');
const moves = JSON.parse(fs.readFileSync('all_510_moves.json'));

console.log('Total moves:', moves.length);

// Let's inspect features for each move
// Features:
// 1. rawCee class (one-hot or index)
// 2. diff
// 3. caps2
// 4. eval
// 5. abs(eval)
// 6. ply
// 7. isCapture (san.includes('x'))
// 8. isCheck (san.includes('+'))
// 9. isWhite (color === 'white')
// 10. piece (P, N, B, R, Q, K)

const classes = ['book', 'last book', 'forced', 'brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'];
const classToIdx = Object.fromEntries(classes.map((c, i) => [c, i]));

console.log('Classes:', classes);
