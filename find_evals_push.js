const fs = require('fs');
const content = fs.readFileSync('chesscom_shared_eager.js', 'utf8');

// Search for where analysis engine evaluates positions
let pos = 0;
while (true) {
    const idx = content.indexOf('evals.push', pos);
    if (idx === -1) break;
    console.log('--- evals.push at', idx, '---');
    console.log(content.substring(idx - 200, idx + 400));
    console.log('\n');
    pos = idx + 10;
}
