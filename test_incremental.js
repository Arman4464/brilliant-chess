const fs = require('fs');
const moves = JSON.parse(fs.readFileSync('all_510_moves.json'));

console.log('Testing threshold calibrations...');

function evalClassifier(fn) {
    let matches = 0;
    const perGame = {};
    for (const m of moves) {
        if (!perGame[m.gameId]) perGame[m.gameId] = { total: 0, matches: 0 };
        perGame[m.gameId].total++;
        const pred = fn(m);
        if (pred === m.official) {
            matches++;
            perGame[m.gameId].matches++;
        }
    }
    return { matches, pct: (matches / moves.length * 100).toFixed(2), perGame };
}

// Let's test individual rule additions to see their impact!
let currentBest = 0;

function tryRule(desc, fn) {
    const res = evalClassifier(fn);
    console.log(`${desc}: ${res.matches} / 510 (${res.pct}%) [delta: ${res.matches - 356 > 0 ? '+' : ''}${res.matches - 356}]`);
    return res.matches;
}

// Base
tryRule('Base', m => {
    let c = m.rawCee;
    if (c === 'greatFind') c = 'great';
    return c;
});

// Test 1: Near-best (diff <= 0.04 in excellent -> best)
tryRule('Test 1: excellent -> best if diff <= 0.04', m => {
    let c = m.rawCee;
    if (c === 'greatFind') c = 'great';
    if (c === 'excellent' && m.diff <= 0.04) return 'best';
    return c;
});

// Test 2: In decisive positions (|eval| >= 5.0 and not mate), excellent with diff >= 0.50 -> good
tryRule('Test 2: excellent -> good if absE >= 5.0 and diff >= 0.50 and absE < 300', m => {
    let c = m.rawCee;
    if (c === 'greatFind') c = 'great';
    if (c === 'excellent' && m.diff <= 0.04) return 'best';
    const absE = Math.abs(m.eval);
    if (c === 'excellent' && absE >= 5.0 && absE < 300 && m.diff >= 0.50) return 'good';
    return c;
});

// Test 3: good -> excellent if caps2 >= 86.0 and diff <= 0.40
tryRule('Test 3: good -> excellent if caps2 >= 86.0 and diff <= 0.40', m => {
    let c = m.rawCee;
    if (c === 'greatFind') c = 'great';
    if (c === 'excellent' && m.diff <= 0.04) return 'best';
    const absE = Math.abs(m.eval);
    if (c === 'excellent' && absE >= 5.0 && absE < 300 && m.diff >= 0.50) return 'good';
    if (c === 'good' && m.caps2 >= 86.0 && m.diff <= 0.40) return 'excellent';
    return c;
});
