const fs = require('fs');
const content = fs.readFileSync('chesscom_shared_eager.js', 'utf8');

let pos = 0;
while (true) {
    const idx = content.indexOf('stockfish', pos);
    if (idx === -1) break;
    console.log('--- stockfish at', idx, '---');
    console.log(content.substring(idx - 100, idx + 200));
    console.log('\n');
    pos = idx + 10;
    if (pos > 1000000) break;
}
