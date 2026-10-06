const fs = require('fs');
const moves = JSON.parse(fs.readFileSync('all_510_moves.json'));

// Build feature vectors
// Features:
// 0: rawCee index
// 1: diff
// 2: caps2
// 3: eval
// 4: absE
// 5: isCapture (san contains x)
// 6: isCheck (san contains +)
// 7: isPawn (san matches /^[a-h]/)
// 8: ply

const classes = ['book', 'last book', 'forced', 'brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'];
const classToIdx = Object.fromEntries(classes.map((c, i) => [c, i]));

const data = moves.map(m => {
    let raw = m.rawCee === 'greatFind' ? 'great' : m.rawCee;
    const rawIdx = classToIdx[raw] ?? 5;
    const san = m.san || '';
    const absE = Math.abs(m.eval);
    const isCap = san.includes('x') ? 1 : 0;
    const isChk = san.includes('+') ? 1 : 0;
    const isP = /^[a-h]/.test(san) ? 1 : 0;
    const targetIdx = classToIdx[m.official] ?? 5;

    return {
        features: [rawIdx, m.diff, m.caps2, m.eval, absE, isCap, isChk, isP, m.ply],
        target: targetIdx,
        targetName: m.official,
        rawName: raw,
        gameId: m.gameId,
        san
    };
});

// Simple Decision Tree Trainer
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

function buildTree(samples, depth = 0, maxDepth = 7, minSamples = 3) {
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

// Evaluate across depths
for (const md of [4, 5, 6, 7, 8, 9, 10]) {
    const tree = buildTree(data, 0, md, 2);
    let correct = 0;
    const perGame = {};
    for (const d of data) {
        if (!perGame[d.gameId]) perGame[d.gameId] = { total: 0, matches: 0 };
        perGame[d.gameId].total++;
        const p = predictTree(tree, d.features);
        if (p === d.target) {
            correct++;
            perGame[d.gameId].matches++;
        }
    }
    const pct = (correct / data.length * 100).toFixed(2);
    console.log(`MaxDepth ${md}: ${correct} / ${data.length} (${pct}%)`);
}
