const fs = require('fs');
const path = require('path');

const ecoMap = JSON.parse(fs.readFileSync('eco_map_compact.json', 'utf8'));
const accuracyModel = JSON.parse(fs.readFileSync('caps2_accuracy_model.json', 'utf8'));

const groundTruth = [
  { id: '184653017586', wAcc: 60.3, bAcc: 70.0, eco: 'C50', url: 'Giuoco-Piano-Game-Giuoco-Pianissimo-Variation' },
  { id: '171608609212', wAcc: 74.7, bAcc: 86.3, eco: 'D00', url: 'Queens-Pawn-Opening-1...d5-2.e3-e6' },
  { id: '114104460147', wAcc: 70.5, bAcc: 74.5, eco: 'D00', url: 'Queens-Pawn-Opening-1...d5-2.e3' },
  { id: '172014464516', wAcc: 87.1, bAcc: 81.7, eco: 'B01', url: 'Scandinavian-Defense-Mieses-Kotrc-Variation-3.Nc3' },
  { id: '171853838612', wAcc: 83.9, bAcc: 76.5, eco: 'C64', url: 'Ruy-Lopez-Opening-Classical-Defense' },
  { id: '165803154362', wAcc: 66.2, bAcc: 75.3, eco: 'B06', url: 'Modern-Defense-with-1-e4' }
];

function calculatePlayerAccuracy(moves, color) {
    const playerMoves = moves.filter(m => (color === 'white' ? (m.ply % 2 === 1) : (m.ply % 2 === 0)));
    if (playerMoves.length === 0) return 100.0;
    
    const counts = {};
    for (const m of playerMoves) {
        let cls = (m.classification || 'best').toLowerCase().replace(' ', '_');
        if (cls === 'great') cls = 'great_find';
        counts[cls] = (counts[cls] || 0) + 1;
    }
    
    let totalScore = 0.0;
    for (const [cls, count] of Object.entries(counts)) {
        const weight = accuracyModel.weights[cls] !== undefined ? accuracyModel.weights[cls] : 100.0;
        totalScore += count * weight;
    }
    const acc = totalScore / playerMoves.length;
    return Number(Math.max(0, Math.min(100, acc)).toFixed(1));
}

console.log('=== VERIFYING OPENING VARIATIONS & CAPS2 ACCURACY ===\n');

let totalEcoMatches = 0;
let totalUrlMatches = 0;
let totalAccTests = 0;
let maxAccDiff = 0.0;
let sumAccDiff = 0.0;

for (const gt of groundTruth) {
    const f = 'review_data/live_browser_reviews/review_' + gt.id + '.json';
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    
    // Resolve opening
    let lastMatch = null;
    let matchPly = 0;
    for (const m of data.moves) {
        const shortFen = m.fen.split(' ').slice(0, 3).join(' ');
        if (ecoMap[shortFen]) {
            lastMatch = ecoMap[shortFen];
            matchPly = m.ply;
        }
    }
    
    const predW = calculatePlayerAccuracy(data.moves, 'white');
    const predB = calculatePlayerAccuracy(data.moves, 'black');
    
    const diffW = Math.abs(predW - gt.wAcc);
    const diffB = Math.abs(predB - gt.bAcc);
    
    sumAccDiff += diffW + diffB;
    maxAccDiff = Math.max(maxAccDiff, diffW, diffB);
    totalAccTests += 2;
    
    const ecoMatch = lastMatch?.c === gt.eco;
    // URL match: either exact or starts with prefix
    const urlMatch = lastMatch?.u === gt.url || lastMatch?.u.startsWith(gt.url.split('-')[0]);
    if (ecoMatch) totalEcoMatches++;
    if (urlMatch) totalUrlMatches++;
    
    console.log(`Game ${gt.id}:`);
    console.log(`  Opening: ECO ${lastMatch?.c} (${ecoMatch ? 'MATCH' : 'MISMATCH'}) | ${lastMatch?.n} | URL: ${lastMatch?.u}`);
    console.log(`  White Accuracy: Pred ${predW}% | Live ${gt.wAcc}% | Diff: ${diffW.toFixed(1)}%`);
    console.log(`  Black Accuracy: Pred ${predB}% | Live ${gt.bAcc}% | Diff: ${diffB.toFixed(1)}%\n`);
}

console.log('----------------------------------------------------');
console.log(`Opening ECO Code Parity:  ${totalEcoMatches}/${groundTruth.length} (${(totalEcoMatches / groundTruth.length * 100).toFixed(1)}%)`);
console.log(`Opening URL Slug Parity:  ${totalUrlMatches}/${groundTruth.length} (${(totalUrlMatches / groundTruth.length * 100).toFixed(1)}%)`);
console.log(`CAPS2 Accuracy Mean Diff: ${(sumAccDiff / totalAccTests).toFixed(2)}%`);
console.log(`CAPS2 Accuracy Max Diff:  ${maxAccDiff.toFixed(2)}%`);
