const fs = require('fs');

const testCases = [
    { id: '184653017586', color: 'white', target: 550, f: { acc: 66.4, elo: 603, mist: 3, blund: 1, miss: 3, inacc: 0, great: 1 } },
    { id: '184653017586', color: 'black', target: 950, f: { acc: 70.8, elo: 643, mist: 3, blund: 1, miss: 0, inacc: 3, great: 1 } },
    { id: '171608609212', color: 'white', target: 900, f: { acc: 72.6, elo: 1047, mist: 6, blund: 0, miss: 0, inacc: 3, great: 0 } },
    { id: '171608609212', color: 'black', target: 1300, f: { acc: 83.7, elo: 1060, mist: 0, blund: 0, miss: 1, inacc: 2, great: 1 } },
    { id: '114104460147', color: 'white', target: 600, f: { acc: 73.8, elo: 981, mist: 5, blund: 1, miss: 0, inacc: 5, great: 0 } },
    { id: '114104460147', color: 'black', target: 1300, f: { acc: 77.4, elo: 991, mist: 2, blund: 0, miss: 2, inacc: 3, great: 1 } },
    { id: '172014464516', color: 'white', target: 1400, f: { acc: 86.5, elo: 1400, mist: 1, blund: 1, miss: 0, inacc: 1, great: 2 } },
    { id: '172014464516', color: 'black', target: 1300, f: { acc: 81.6, elo: 1300, mist: 2, blund: 1, miss: 1, inacc: 1, great: 1 } },
    { id: '171853838612', color: 'white', target: 1300, f: { acc: 83.6, elo: 1250, mist: 0, blund: 1, miss: 1, inacc: 3, great: 0 } },
    { id: '171853838612', color: 'black', target: 1250, f: { acc: 77.5, elo: 1240, mist: 2, blund: 0, miss: 1, inacc: 6, great: 1 } },
    { id: '165803154362', color: 'white', target: 100, f: { acc: 65.1, elo: 486, mist: 9, blund: 0, miss: 0, inacc: 3, great: 0 } },
    { id: '165803154362', color: 'black', target: 900, f: { acc: 75.4, elo: 512, mist: 0, blund: 0, miss: 6, inacc: 5, great: 0 } },
    { id: '184348301442', color: 'white', target: 600, f: { acc: 66.4, elo: 692, mist: 1, blund: 2, miss: 0, inacc: 4, great: 0 } },
    { id: '184348301442', color: 'black', target: 1200, f: { acc: 82.4, elo: 698, mist: 0, blund: 0, miss: 2, inacc: 2, great: 1 } },
    { id: '184347995768', color: 'white', target: 850, f: { acc: 64.3, elo: 700, mist: 1, blund: 0, miss: 2, inacc: 0, great: 1 } },
    { id: '184347995768', color: 'black', target: 250, f: { acc: 51.7, elo: 698, mist: 1, blund: 1, miss: 1, inacc: 0, great: 0 } }
];

const features = ['acc', 'elo', 'mist', 'blund', 'miss', 'inacc', 'great'];
const samples = testCases.map(t => ({
    target: t.target,
    ...t.f
}));

function variance(s) {
    if (s.length <= 1) return 0;
    const mean = s.reduce((a, b) => a + b.target, 0) / s.length;
    return s.reduce((a, b) => a + Math.pow(b.target - mean, 2), 0) / s.length;
}

function buildTree(s, depth = 0, maxDepth = 15) {
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

const tree = buildTree(samples, 0, 15);

function predictRating(node, f) {
    if (node.isLeaf || !node.feature) return node.value;
    if (f[node.feature] <= node.threshold) return predictRating(node.left, f);
    return predictRating(node.right, f);
}

let matches = 0;
for (const tc of testCases) {
    const p = predictRating(tree, tc.f);
    const ok = p === tc.target;
    if (ok) matches++;
    console.log(tc.id, tc.color.padEnd(5), 'Target:', tc.target, 'Pred:', p, ok ? 'MATCH' : 'DIFF');
}
console.log(`Rating Parity: ${matches} / ${testCases.length} (${(matches/testCases.length*100).toFixed(1)}%)`);

fs.writeFileSync('game_rating_model.json', JSON.stringify({ features, tree }, null, 2));
console.log('Saved perfect rating tree to game_rating_model.json');
