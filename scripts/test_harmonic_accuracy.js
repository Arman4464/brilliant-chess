const fs = require('fs');

const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));

// Convert Chess.com eval string to winning chance percentage (0 - 100)
// Lichess formula:
// winPercent = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
function cpToWinPercent(cp) {
    if (cp >= 50000) return 100;
    if (cp <= -50000) return 0;
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

// Chess.com Expected Points Model win percent (0 - 100):
function chesscomWinPercent(cp, rating = 1500) {
    if (cp >= 50000) return 100;
    if (cp <= -50000) return 0;
    const s = Math.max(0.75, Math.min(1.25, 0.6 + (rating / 3750)));
    return (1.0 / (1.0 + Math.pow(10, -cp / (400 * s)))) * 100;
}

function lichessMoveAccuracy(beforeWinPct, afterWinPct) {
    if (afterWinPct >= beforeWinPct) return 100;
    const winDiff = beforeWinPct - afterWinPct;
    const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * winDiff) - 3.166924740191411 + 1;
    return Math.max(0, Math.min(100, raw));
}

function harmonicMean(arr) {
    // Harmonic mean with small epsilon to avoid divide by zero:
    // H = N / sum(1 / max(x, 1))
    const sumInv = arr.reduce((acc, x) => acc + (1.0 / Math.max(x, 1.0)), 0);
    return arr.length / sumInv;
}

function arithmeticMean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function powerMean(arr, p) {
    if (p === 0) {
        // Geometric mean
        const logSum = arr.reduce((a, x) => a + Math.log(Math.max(x, 1)), 0);
        return Math.exp(logSum / arr.length);
    }
    const sumP = arr.reduce((a, x) => a + Math.pow(Math.max(x, 0.1), p), 0);
    return Math.pow(sumP / arr.length, 1 / p);
}

// Convert eval strings to centipawns
function evalStringToCp(evalStr) {
    if (!evalStr) return 0;
    const s = evalStr.trim();
    if (s.startsWith('M') || s.startsWith('+M')) {
        const moves = parseInt(s.replace('+M', '').replace('M', ''), 10);
        return 100000 - moves * 100;
    }
    if (s.startsWith('-M')) {
        const moves = parseInt(s.replace('-M', ''), 10);
        return -100000 + moves * 100;
    }
    if (s === '0-1') return -100000;
    if (s === '1-0') return 100000;
    if (s === '1/2-1/2') return 0;
    const val = parseFloat(s);
    return Math.round(val * 100);
}

// Test on sample
const wMovesAcc = [];
const bMovesAcc = [];

let prevCp = 20; // +0.20 start
for (const m of sample.moves) {
    const afterCp = evalStringToCp(m.eval);
    const isWhite = m.color === 'white';
    const rating = isWhite ? sample.players.white.rating : sample.players.black.rating;
    
    const beforePlayerCp = isWhite ? prevCp : -prevCp;
    const afterPlayerCp = isWhite ? afterCp : -afterCp;
    
    // Win percents
    const beforeWinPct = chesscomWinPercent(beforePlayerCp, rating);
    const afterWinPct = chesscomWinPercent(afterPlayerCp, rating);
    
    let acc = lichessMoveAccuracy(beforeWinPct, afterWinPct);
    if (m.classification.includes('book')) acc = 100;
    
    if (isWhite) wMovesAcc.push({ m, acc, beforeWinPct, afterWinPct });
    else bMovesAcc.push({ m, acc, beforeWinPct, afterWinPct });
    
    prevCp = afterCp;
}

const wAccs = wMovesAcc.map(x => x.acc);
const bAccs = bMovesAcc.map(x => x.acc);

console.log('Sample Official: White = 66.1%, Black = 73.3%');
console.log('Arithmetic mean: White =', arithmeticMean(wAccs).toFixed(2), 'Black =', arithmeticMean(bAccs).toFixed(2));
console.log('Harmonic mean: White =', harmonicMean(wAccs).toFixed(2), 'Black =', harmonicMean(bAccs).toFixed(2));
console.log('Mean of (Arith + Harm) / 2: White =', ((arithmeticMean(wAccs) + harmonicMean(wAccs)) / 2).toFixed(2), 'Black =', ((arithmeticMean(bAccs) + harmonicMean(bAccs)) / 2).toFixed(2));

for (const p of [0.5, 0.25, 0, -0.5, -1]) {
    console.log(`Power mean (p=${p}): White = ${powerMean(wAccs, p).toFixed(2)}, Black = ${powerMean(bAccs, p).toFixed(2)}`);
}
