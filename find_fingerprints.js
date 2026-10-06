const fs = require('fs');
const content = fs.readFileSync('chesscom_shared_eager.js', 'utf8');

const p = content.indexOf('gameFingerprints:');
if (p !== -1) {
    console.log('Found gameFingerprints at', p);
    console.log(content.substring(p, p + 1000));
} else {
    const p2 = content.indexOf('gameFingerprints=');
    console.log('Found gameFingerprints= at', p2);
    console.log(content.substring(p2, p2 + 1000));
}
