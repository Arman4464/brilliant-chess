const fs = require('fs');
const content = fs.readFileSync('chesscom_shared_eager.js', 'utf8');

const p = content.indexOf('gameFingerprints=S');
console.log(content.substring(p - 800, p));
