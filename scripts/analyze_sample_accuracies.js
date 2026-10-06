const fs = require('fs');

const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));

// Convert Chess.com eval string (from White perspective) to centipawns
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

// Chess.com Expected Points Model
function winExpectancy(cp, rating = 1500) {
    if (cp >= 50000) return 1.0;
    if (cp <= -50000) return 0.0;
    const s = Math.max(0.75, Math.min(1.25, 0.6 + (rating / 3750)));
    return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
}

function caps2MoveAccuracy(deltaE, rating = 1500) {
    if (deltaE <= 0.001) return 100;
    const ratingFactor = Math.max(0.85, Math.min(1.15, rating / 1500));
    const acc = 103.1668 * Math.exp(-1.85 * deltaE * ratingFactor * 2.2) - 3.1668;
    return Math.max(0, Math.min(100, Math.round(acc * 10) / 10));
}

console.log('Sample White rating:', sample.players.white.rating);
console.log('Sample Black rating:', sample.players.black.rating);
console.log('Sample Official White Accuracy:', sample.players.white.accuracy);
console.log('Sample Official Black Accuracy:', sample.players.black.accuracy);

let prevWhiteCp = 20; // initial position approx +0.20
const analyzedMoves = [];

for (let i = 0; i < sample.moves.length; i++) {
    const m = sample.moves[i];
    const whiteCpAfter = evalStringToCp(m.eval);
    const isWhite = m.color === 'white';
    const playerRating = isWhite ? sample.players.white.rating : sample.players.black.rating;
    
    // Player's perspective score before and after
    const playerBeforeCp = isWhite ? prevWhiteCp : -prevWhiteCp;
    const playerAfterCp = isWhite ? whiteCpAfter : -whiteCpAfter;
    
    const beforeE = winExpectancy(playerBeforeCp, playerRating);
    const afterE = winExpectancy(playerAfterCp, playerRating);
    
    // In Chess.com, if a move is best or book, deltaE is 0
    let deltaE = Math.max(0, beforeE - afterE);
    if (m.classification === 'best' || m.classification === 'book' || m.classification === 'last book' || m.classification === 'forced') {
        deltaE = 0;
    }
    
    const acc = (m.classification.includes('book') || m.classification === 'forced') ? 100 : caps2MoveAccuracy(deltaE, playerRating);
    
    analyzedMoves.push({
        ply: m.ply,
        color: m.color,
        san: m.san,
        classification: m.classification,
        eval: m.eval,
        beforeCp: playerBeforeCp,
        afterCp: playerAfterCp,
        beforeE: beforeE.toFixed(3),
        afterE: afterE.toFixed(3),
        deltaE: deltaE.toFixed(3),
        acc
    });
    
    prevWhiteCp = whiteCpAfter;
}

const wAccs = analyzedMoves.filter(m => m.color === 'white');
const bAccs = analyzedMoves.filter(m => m.color === 'black');

const wAvg = wAccs.reduce((s, m) => s + m.acc, 0) / wAccs.length;
const bAvg = bAccs.reduce((s, m) => s + m.acc, 0) / bAccs.length;

console.log('\n--- COMPUTED AVERAGE ACCURACIES ---');
console.log(`White: computed = ${wAvg.toFixed(2)}%, official = ${sample.players.white.accuracy}% (diff: ${(wAvg - sample.players.white.accuracy).toFixed(2)}%)`);
console.log(`Black: computed = ${bAvg.toFixed(2)}%, official = ${sample.players.black.accuracy}% (diff: ${(bAvg - sample.players.black.accuracy).toFixed(2)}%)`);

console.log('\n--- MOVES DETAIL ---');
for (const m of analyzedMoves) {
    console.log(`Ply ${String(m.ply).padStart(2)} [${m.color.padEnd(5)} ${m.san.padEnd(7)}] ${m.classification.padEnd(11)}: eval=${m.eval.padEnd(7)} bCp=${String(m.beforeCp).padStart(6)} aCp=${String(m.afterCp).padStart(6)} dE=${m.deltaE} acc=${m.acc}`);
}
