const fs = require('fs');
const code = fs.readFileSync('chesscom_shared_eager.js', 'utf8');

['Threads', 'Hash', 'Skill Level', 'MultiPV', 'depth', 'movetime'].forEach(opt => {
    let idx = 0;
    while ((idx = code.indexOf(opt, idx)) !== -1) {
        console.log(`=== ${opt} at ${idx} ===`);
        console.log(code.slice(Math.max(0, idx - 60), idx + 100));
        idx += opt.length + 50;
        if (idx > 520000) break;
    }
});
