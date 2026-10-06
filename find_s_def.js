const fs = require('fs');
const content = fs.readFileSync('chesscom_shared_eager.js', 'utf8');

const p = content.indexOf('function S(');
if (p !== -1) {
    console.log('Found function S at', p);
    console.log(content.substring(p, p + 800));
}
