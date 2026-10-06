const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'review_data', 'move_by_move_reviews');
const files = [
    'review_114104460147.json',
    'review_165803154362.json',
    'review_171608609212.json',
    'review_171853838612.json',
    'review_172014464516.json',
    'review_184653017586.json'
];

const games = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f))));

function parseScore(evalStr) {
    if (!evalStr) return null;
    if (evalStr === '0-1') return -100000;
    if (evalStr === '1-0') return 100000;
    if (evalStr.startsWith('M')) {
        const moves = parseInt(evalStr.slice(1), 10);
        return 100000 - moves * 100;
    }
    if (evalStr.startsWith('-M')) {
        const moves = parseInt(evalStr.slice(2), 10);
        return -100000 + moves * 100;
    }
    const val = parseFloat(evalStr);
    return isNaN(val) ? null : Math.round(val * 100);
}

function normalizeCp(score) {
    if (score >= 50000) {
        const moves = Math.max(1, Math.round((100000 - score) / 100));
        return 2000 + Math.max(0, 500 - moves * 20);
    }
    if (score <= -50000) {
        const moves = Math.max(1, Math.round((100000 - Math.abs(score)) / 100));
        return -2000 - Math.max(0, 500 - moves * 20);
    }
    return score;
}

function winExpectancy(cp, rating = 1000) {
    if (cp >= 50000) return 1.0;
    if (cp <= -50000) return 0.0;
    const s = Math.max(0.60, Math.min(1.40, 0.65 + 0.25 * (rating / 1000)));
    return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
}

// Compute move accuracy based on continuous win expectancy delta
function computeContinuousMoveAcc(deltaE, deltaCp, rating, isBest, isBook, isMissedMate, isAllowedMate) {
    if (isBest || isBook) return 100;
    if (isMissedMate) return 18.0;
    if (isAllowedMate) return 5.0;

    const rFactor = Math.pow(rating / 1000, -0.2);
    const totalLoss = (deltaE * 100) + (Math.max(0, deltaCp - 10) / 100) * 1.5;
    const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.048 * totalLoss * rFactor) - 3.1668));
    return acc;
}

console.log('Inspecting move-level deltas and classifications...');
let totalMoves = 0;
const classificationDeltas = {};

for (const g of games) {
    const wRating = g.players.white.rating || 1000;
    const bRating = g.players.black.rating || 1000;

    let prevScore = 25; // initial position approx +0.25

    for (const m of g.moves) {
        totalMoves++;
        const isWhite = m.color === 'white';
        const rating = isWhite ? wRating : bRating;
        const currentScore = parseScore(m.eval);

        if (currentScore !== null) {
            // Player score before = prevScore (from White perspective)
            // If black to move, negate
            const playerBefore = isWhite ? prevScore : -prevScore;
            const playerAfter = isWhite ? currentScore : -currentScore;

            const beforeNorm = normalizeCp(playerBefore);
            const afterNorm = normalizeCp(playerAfter);
            const dCp = Math.max(0, beforeNorm - afterNorm);

            const beforeE = winExpectancy(playerBefore, rating);
            const afterE = winExpectancy(playerAfter, rating);
            const dE = Math.max(0, beforeE - afterE);

            const cls = m.classification;
            if (!classificationDeltas[cls]) {
                classificationDeltas[cls] = { count: 0, sumDE: 0, sumDCp: 0, minDE: 99, maxDE: 0 };
            }
            const stat = classificationDeltas[cls];
            stat.count++;
            stat.sumDE += dE;
            stat.sumDCp += dCp;
            if (dE < stat.minDE) stat.minDE = dE;
            if (dE > stat.maxDE) stat.maxDE = dE;

            prevScore = currentScore;
        }
    }
}

console.log('--- OFFICIAL CLASSIFICATION DISTRIBUTION & EMPIRICAL DELTA E RANGES ---');
for (const [cls, stat] of Object.entries(classificationDeltas)) {
    const avgDE = (stat.sumDE / stat.count).toFixed(3);
    const avgDCp = (stat.sumDCp / stat.count).toFixed(0);
    console.log(
        `${cls.padEnd(12)} | Count: ${String(stat.count).padStart(3)} | Avg ΔE: ${avgDE} (min: ${stat.minDE.toFixed(3)}, max: ${stat.maxDE.toFixed(3)}) | Avg Δcp: ${avgDCp} cp`
    );
}
