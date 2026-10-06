const fs = require('fs');
const content = fs.readFileSync('chesscom_shared_eager.js', 'utf8');

// In d():
// let s = [];
// i && (s.push('setoption name CoachAssetsV2 value true'), _mt(s, i, a));
// FH() && s.push('setoption name UserColor value ' + FH());
// window.chesscom.features.includes('opposing_coach_speech') ...

const p = content.indexOf('function _mt(');
if (p !== -1) {
    console.log('Found function _mt at', p);
    console.log(content.substring(p, p + 800));
} else {
    console.log('_mt not found');
}
