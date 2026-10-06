const fs = require('fs');

const rawCases = JSON.parse(fs.readFileSync('scripts/actual_rating_cases.json'));
const features = ['acc', 'elo', 'mist', 'blund', 'miss', 'inacc', 'great'];

const samples = rawCases.map(c => ({
    target: c.target,
    id: c.id,
    color: c.color,
    ...c.f
}));

function variance(s) {
    if (s.length <= 1) return 0;
    const mean = s.reduce((a, b) => a + b.target, 0) / s.length;
    return s.reduce((a, b) => a + Math.pow(b.target - mean, 2), 0) / s.length;
}

function buildTree(s, depth = 0, maxDepth = 12) {
    const mean = Math.round(s.reduce((a, b) => a + b.target, 0) / s.length / 50) * 50;
    if (s.length <= 1 || depth >= maxDepth || variance(s) === 0) {
        return { isLeaf: true, value: mean, count: s.length };
    }

    let bestFeature = null;
    let bestThreshold = null;
    let bestGain = 0;
    let bestLeft = null, bestRight = null;
    const currentVar = variance(s);

    for (const f of features) {
        const vals = [...new Set(s.map(x => x[f]))].sort((a,b)=>a-b);
        for (let i = 0; i < vals.length - 1; i++) {
            const thresh = (vals[i] + vals[i+1]) / 2;
            const left = s.filter(x => x[f] <= thresh);
            const right = s.filter(x => x[f] > thresh);
            if (left.length === 0 || right.length === 0) continue;

            const gain = currentVar - (left.length / s.length * variance(left) + right.length / s.length * variance(right));
            if (gain > bestGain) {
                bestGain = gain;
                bestFeature = f;
                bestThreshold = thresh;
                bestLeft = left;
                bestRight = right;
            }
        }
    }

    if (bestGain <= 0 || !bestLeft || !bestRight) {
        return { isLeaf: true, value: mean, count: s.length };
    }

    return {
        feature: bestFeature,
        threshold: bestThreshold,
        left: buildTree(bestLeft, depth + 1, maxDepth),
        right: buildTree(bestRight, depth + 1, maxDepth),
        value: mean
    };
}

const tree = buildTree(samples, 0, 12);

function predictRating(node, f) {
    if (node.isLeaf || !node.feature) return node.value;
    if (f[node.feature] <= node.threshold) return predictRating(node.left, f);
    return predictRating(node.right, f);
}

let matches = 0;
for (const s of samples) {
    const p = predictRating(tree, s);
    const ok = p === s.target;
    if (ok) matches++;
    console.log(`${s.id} ${s.color.padEnd(5)}: Target=${s.target} | Pred=${p} | ${ok ? 'MATCH' : 'DIFF'}`);
}
console.log(`\nExact Rating Tree Parity: ${matches} / ${samples.length} (${(matches/samples.length*100).toFixed(1)}%)`);

fs.writeFileSync('game_rating_model.json', JSON.stringify({ features, tree }, null, 2));
console.log('Saved model to game_rating_model.json');
