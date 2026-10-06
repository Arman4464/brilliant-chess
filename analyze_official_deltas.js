const fs = require('fs');
const path = require('path');

const benchmarkGames = ['184653017586', '171608609212', '114104460147', '172014464516', '171853838612', '165803154362'];

const allPlies = [];

function parseEval(eStr) {
    if (!eStr) return 0;
    if (eStr.startsWith('M')) return 300 - parseInt(eStr.slice(1), 10);
    if (eStr.startsWith('-M')) return -300 + parseInt(eStr.slice(2), 10);
    return parseFloat(eStr);
}

for (const id of benchmarkGames) {
    const data = JSON.parse(fs.readFileSync(`review_data/move_by_move_reviews/review_${id}.json`, 'utf8'));
    let prevEval = 0.2; // approx start pos eval
    data.moves.forEach((m, idx) => {
        const curEval = parseEval(m.eval);
        const isWhite = m.color === 'white';
        // Eval loss:
        let loss = isWhite ? (prevEval - curEval) : (curEval - prevEval);
        if (Math.abs(prevEval) > 200 || Math.abs(curEval) > 200) {
            loss = 0; // mate territory
        }
        allPlies.push({
            gameId: id,
            ply: m.ply,
            san: m.san,
            color: m.color,
            classification: m.classification,
            eval: curEval,
            prevEval,
            loss: Math.max(0, Number(loss.toFixed(2)))
        });
        prevEval = curEval;
    });
}

console.log('Total plies analyzed:', allPlies.length);

// Group by classification and look at loss statistics!
const stats = {};
allPlies.forEach(p => {
    if (p.classification === 'book' || p.classification === 'last book' || p.classification === 'forced') return;
    if (!stats[p.classification]) stats[p.classification] = [];
    stats[p.classification].push(p.loss);
});

for (const [cls, losses] of Object.entries(stats)) {
    const avg = losses.reduce((a,b)=>a+b,0)/losses.length;
    const sorted = [...losses].sort((a,b)=>a-b);
    const median = sorted[Math.floor(losses.length / 2)];
    console.log(`${cls.padEnd(12)} count: ${String(losses.length).padStart(3)} min: ${sorted[0].toFixed(2)} median: ${median.toFixed(2)} avg: ${avg.toFixed(2)} max: ${sorted[sorted.length-1].toFixed(2)}`);
}
