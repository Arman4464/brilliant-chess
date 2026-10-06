const fs = require('fs');
const content = fs.readFileSync('chesscom_shared_eager.js', 'utf8');

const p = content.indexOf('function Gz(');
if (p !== -1) {
    console.log('Found function Gz at', p);
    console.log(content.substring(p, p + 1500));
} else {
    console.log('Not found');
}
