const fs = require('fs');
const moves = JSON.parse(fs.readFileSync('all_510_moves.json'));

function inspectGroup(from, to) {
    const list = moves.filter(m => {
        let raw = m.rawCee === 'greatFind' ? 'great' : m.rawCee;
        return raw === from && m.official === to;
    });
    console.log(`=== ${from} -> ${to} (${list.length}) ===`);
    list.forEach(m => {
        console.log(`  G:${m.gameId} P:${String(m.ply).padStart(2)} ${m.color[0].toUpperCase()} ${m.san.padEnd(6)} d=${m.diff.toFixed(2)} c=${m.caps2.toFixed(1)} e=${m.eval} offE=${m.officialEval}`);
    });
}

inspectGroup('best', 'excellent');
inspectGroup('excellent', 'good');
inspectGroup('excellent', 'best');
inspectGroup('good', 'excellent');
