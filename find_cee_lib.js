const fs = require('fs');
const content = fs.readFileSync('chesscom_shared_eager.js', 'utf8');

const p = content.indexOf('CEE_LIB=');
if (p !== -1) {
    console.log('Found CEE_LIB= at', p);
    console.log(content.substring(p - 100, p + 1000));
} else {
    const p2 = content.indexOf('.CEE_LIB');
    console.log('Found .CEE_LIB at', p2);
    console.log(content.substring(p2 - 100, p2 + 1000));
}
