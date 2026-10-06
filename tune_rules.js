const fs = require('fs');
const moves = JSON.parse(fs.readFileSync('all_510_moves.json'));

function classify(m) {
    if (m.rawCee === 'forced') return 'forced';
    if (m.rawCee === 'book' || m.rawCee === 'last book') return m.rawCee;

    let c = m.rawCee;
    if (c === 'greatFind') c = 'great';

    const absE = Math.abs(m.eval);
    const diff = m.diff;
    const caps = m.caps2;
    const san = m.san || '';

    // Let's test rules here!

    return c;
}

let matches = 0;
const perGame = {};
for (const m of moves) {
    if (!perGame[m.gameId]) perGame[m.gameId] = { total: 0, matches: 0 };
    perGame[m.gameId].total++;
    const pred = classify(m);
    if (pred === m.official) {
        matches++;
        perGame[m.gameId].matches++;
    }
}

const pct = (matches / moves.length * 100).toFixed(2);
console.log(`TOTAL: ${matches} / ${moves.length} (${pct}%)`);
for (const [gid, st] of Object.entries(perGame)) {
    console.log(`  ${gid}: ${st.matches}/${st.total} (${(st.matches/st.total*100).toFixed(1)}%)`);
}
