const fs = require('fs');
const moves = JSON.parse(fs.readFileSync('all_510_moves.json'));

function testRuleSet(name, fn) {
    let matches = 0;
    const perGame = {};
    const mismatches = [];

    for (const m of moves) {
        if (!perGame[m.gameId]) perGame[m.gameId] = { total: 0, matches: 0 };
        perGame[m.gameId].total++;

        const pred = fn(m);
        if (pred === m.official) {
            matches++;
            perGame[m.gameId].matches++;
        } else {
            mismatches.push({
                gameId: m.gameId,
                ply: m.ply,
                san: m.san,
                raw: m.rawCee,
                pred,
                official: m.official,
                diff: m.diff,
                caps2: m.caps2,
                eval: m.eval,
                officialEval: m.officialEval
            });
        }
    }

    const pct = (matches / moves.length * 100).toFixed(2);
    console.log(`\n=== ${name}: ${matches} / ${moves.length} (${pct}%) ===`);
    for (const [gid, st] of Object.entries(perGame)) {
        console.log(`  Game ${gid}: ${st.matches}/${st.total} (${(st.matches/st.total*100).toFixed(1)}%)`);
    }
    return { matches, pct, mismatches };
}

// Baseline
testRuleSet('Raw CEE Baseline', m => {
    let c = m.rawCee;
    if (c === 'greatFind') c = 'great';
    return c;
});

// Candidate 1: The Core Refinements
testRuleSet('Candidate 1', m => {
    let c = m.rawCee;
    if (c === 'forced') return 'forced';
    if (c === 'book' || c === 'last book') return c;
    if (c === 'greatFind') c = 'great';

    const absE = Math.abs(m.eval);
    const diff = m.diff;
    const caps = m.caps2;
    const san = m.san || '';

    // Rule A: Near-best (diff <= 0.04) or clinical check/capture in decisive position
    if (c === 'excellent') {
        if (diff <= 0.05 && caps >= 96.0) {
            return 'best';
        }
        if (absE >= 4.0 && (san.includes('+') || san.includes('x')) && caps >= 85.0 && diff <= 0.50) {
            return 'best';
        }
        // In decisive positions (|eval| >= 5.0 and not mate), non-optimal moves with diff >= 0.35 are 'good'
        if (absE >= 5.0 && absE < 300 && diff >= 0.35 && diff < 10.0) {
            return 'good';
        }
    }

    // Rule B: Best moves in decisive positions that are quiet consolidating moves are 'excellent'
    if (c === 'best') {
        if (absE >= 5.0 && !san.includes('+') && !san.includes('x') && !san.includes('#')) {
            return 'excellent';
        }
    }

    // Rule C: High-accuracy good moves are excellent
    if (c === 'good') {
        if (caps >= 85.0 && diff <= 0.50) {
            return 'excellent';
        }
        if (absE >= 5.0 && caps >= 55.0 && diff <= 1.50) {
            return 'excellent';
        }
        if (diff >= 1.50 && caps <= 45.0) {
            return 'inaccuracy';
        }
    }

    // Rule D: Mistakes with diff < 3.5 in winning/losing positions
    if (c === 'mistake') {
        if (diff <= 3.5 && caps >= 10.0) {
            return 'inaccuracy';
        }
    }

    // Rule E: Inaccuracies with diff <= 0.85
    if (c === 'inaccuracy') {
        if (diff <= 0.85 && caps >= 55.0) {
            return 'good';
        }
    }

    // Rule F: Misses
    if (c === 'miss') {
        if (diff <= 2.2 && caps >= 15.0) {
            return 'inaccuracy';
        }
    }

    return c;
});
