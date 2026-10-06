const fs = require('fs');
const moves = JSON.parse(fs.readFileSync('all_510_moves.json'));

const classes = ['book', 'last book', 'forced', 'brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'];
const classToIdx = Object.fromEntries(classes.map((c, i) => [c, i]));

let lastGame = null;
let lastEval = 0.2;
let lastSan = '';

const enriched = moves.map(m => {
    if (m.gameId !== lastGame) {
        lastGame = m.gameId;
        lastEval = 0.2;
        lastSan = '';
    }
    const curE = m.eval;
    const isW = m.color === 'white' ? 1 : 0;
    const evalLoss = isW ? (lastEval - curE) : (curE - lastEval);
    const wasInCheck = lastSan.includes('+') ? 1 : 0;
    lastEval = curE;
    lastSan = m.san || '';

    let raw = m.rawCee === 'greatFind' ? 'great' : m.rawCee;
    const rawIdx = classToIdx[raw] ?? 5;
    const san = m.san || '';
    const absE = Math.abs(curE);
    const isCap = san.includes('x') ? 1 : 0;
    const isChk = san.includes('+') ? 1 : 0;
    const isMateMove = san.includes('#') ? 1 : 0;
    const isP = /^[a-h]/.test(san) ? 1 : 0;
    const isK = san.startsWith('K') ? 1 : 0;
    const isQ = san.startsWith('Q') ? 1 : 0;
    const isR = san.startsWith('R') ? 1 : 0;
    const isN = san.startsWith('N') ? 1 : 0;
    const isB = san.startsWith('B') ? 1 : 0;
    const isCastle = san.startsWith('O-O') ? 1 : 0;
    const isMate = absE >= 300 ? 1 : 0;
    const targetIdx = classToIdx[m.official] ?? 5;

    return {
        features: [
            rawIdx,
            m.diff,
            m.caps2,
            curE,
            absE,
            evalLoss,
            isCap,
            isChk,
            isMateMove,
            isP,
            isK,
            isQ,
            isR,
            isN,
            isB,
            isCastle,
            isMate,
            m.ply,
            isW,
            wasInCheck
        ],
        target: targetIdx,
        targetName: m.official,
        rawName: raw,
        gameId: m.gameId,
        san
    };
});

function gini(samples) {
    if (samples.length === 0) return 0;
    const counts = {};
    for (const s of samples) counts[s.target] = (counts[s.target] || 0) + 1;
    let sum = 0;
    for (const c of Object.values(counts)) {
        const p = c / samples.length;
        sum += p * p;
    }
    return 1 - sum;
}

function majority(samples) {
    const counts = {};
    for (const s of samples) counts[s.target] = (counts[s.target] || 0) + 1;
    let bestC = null, maxC = -1;
    for (const [c, cnt] of Object.entries(counts)) {
        if (cnt > maxC) { maxC = cnt; bestC = Number(c); }
    }
    return bestC;
}

function buildTree(samples, depth = 0, maxDepth = 9, minSamples = 3) {
    if (samples.length <= minSamples || depth >= maxDepth) {
        return { isLeaf: true, prediction: majority(samples), count: samples.length };
    }

    const currentGini = gini(samples);
    if (currentGini === 0) {
        return { isLeaf: true, prediction: samples[0].target, count: samples.length };
    }

    let bestFeature = -1;
    let bestThreshold = 0;
    let bestGain = 0;
    let bestLeft = null, bestRight = null;

    const numFeatures = samples[0].features.length;

    for (let f = 0; f < numFeatures; f++) {
        const vals = [...new Set(samples.map(s => s.features[f]))].sort((a,b)=>a-b);
        for (let i = 0; i < vals.length - 1; i++) {
            const thresh = (vals[i] + vals[i+1]) / 2;
            const left = [];
            const right = [];
            for (const s of samples) {
                if (s.features[f] <= thresh) left.push(s);
                else right.push(s);
            }
            if (left.length === 0 || right.length === 0) continue;

            const gLeft = gini(left);
            const gRight = gini(right);
            const gain = currentGini - (left.length / samples.length * gLeft + right.length / samples.length * gRight);

            if (gain > bestGain) {
                bestGain = gain;
                bestFeature = f;
                bestThreshold = thresh;
                bestLeft = left;
                bestRight = right;
            }
        }
    }

    if (bestGain <= 0.0001 || !bestLeft || !bestRight) {
        return { isLeaf: true, prediction: majority(samples), count: samples.length };
    }

    return {
        isLeaf: false,
        feature: bestFeature,
        threshold: bestThreshold,
        left: buildTree(bestLeft, depth + 1, maxDepth, minSamples),
        right: buildTree(bestRight, depth + 1, maxDepth, minSamples)
    };
}

function predictTree(tree, f) {
    if (tree.isLeaf) return tree.prediction;
    if (f[tree.feature] <= tree.threshold) return predictTree(tree.left, f);
    return predictTree(tree.right, f);
}

// Leave-One-Game-Out Cross Validation
const gameIds = [...new Set(enriched.map(d => d.gameId))];
console.log('Running Leave-One-Game-Out Cross Validation across all 6 games...');

let totalTestPlies = 0;
let totalTestMatches = 0;

for (const testGameId of gameIds) {
    const trainData = enriched.filter(d => d.gameId !== testGameId);
    const testData = enriched.filter(d => d.gameId === testGameId);

    const tree = buildTree(trainData, 0, 8, 3);

    let testMatches = 0;
    for (const d of testData) {
        const p = predictTree(tree, d.features);
        if (p === d.target) testMatches++;
    }

    const pct = (testMatches / testData.length * 100).toFixed(1);
    console.log(`Test Game ${testGameId}: ${testMatches} / ${testData.length} (${pct}%)`);
    totalTestPlies += testData.length;
    totalTestMatches += testMatches;
}

const overallCvPct = (totalTestMatches / totalTestPlies * 100).toFixed(2);
console.log(`\nOverall Cross-Validation Parity: ${totalTestMatches} / ${totalTestPlies} (${overallCvPct}%)`);
