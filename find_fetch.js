const fs = require('fs');
const content = fs.readFileSync('chesscom_shared_eager.js', 'utf8');

let pos = 0;
while (true) {
    const idx = content.indexOf('action', pos);
    if (idx === -1) break;
    const sub = content.substring(idx - 20, idx + 80);
    if (sub.includes('analysis')) {
        console.log('--- At index', idx, '---');
        console.log(content.substring(idx - 100, idx + 400));
        console.log('\n');
    }
    pos = idx + 6;
}
