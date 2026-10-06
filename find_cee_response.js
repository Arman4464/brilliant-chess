const fs = require('fs');
const content = fs.readFileSync('chesscom_shared_eager.js', 'utf8');

const idx = 2580643;
// Find where p is defined before idx
const sub = content.substring(idx - 1500, idx + 500);
console.log(sub);
