const fs = require('fs');
const content = fs.readFileSync('chesscom_shared_eager.js', 'utf8');
const mIdx = 1731644;
const q2 = content.indexOf('`', mIdx + 6);
const b64 = content.slice(mIdx + 5, q2);
const buf = Buffer.from(b64, 'base64');
let str = '';
for (let b of buf) {
    if (b >= 32 && b <= 126) str += String.fromCharCode(b);
    else if (b === 10) str += '\n';
    else str += '.';
}
console.log(str);
