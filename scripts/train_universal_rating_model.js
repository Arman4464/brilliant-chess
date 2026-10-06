const fs = require('fs');
const path = require('path');

// 14 Benchmark ground truth outcomes from Chess.com
const benchmarkData = [
  { id: '184653017586_w', acc: 59.3, blund: 1, mist: 1, miss: 3, inacc: 7, elo: 603, target: 550 },
  { id: '184653017586_b', acc: 70.3, blund: 1, mist: 4, miss: 0, inacc: 4, elo: 643, target: 950 },
  { id: '171608609212_w', acc: 74.7, blund: 0, mist: 4, miss: 0, inacc: 3, elo: 575, target: 900 },
  { id: '171608609212_b', acc: 78.5, blund: 0, mist: 1, miss: 0, inacc: 1, elo: 572, target: 1300 },
  { id: '114104460147_w', acc: 68.3, blund: 1, mist: 5, miss: 0, inacc: 7, elo: 800, target: 600 },
  { id: '114104460147_b', acc: 74.3, blund: 0, mist: 4, miss: 2, inacc: 4, elo: 1271, target: 1300 },
  { id: '172014464516_w', acc: 85.9, blund: 0, mist: 1, miss: 0, inacc: 2, elo: 634, target: 1400 },
  { id: '172014464516_b', acc: 81.2, blund: 2, mist: 1, miss: 1, inacc: 3, elo: 639, target: 1300 },
  { id: '171853838612_w', acc: 88.5, blund: 1, mist: 0, miss: 1, inacc: 2, elo: 612, target: 1300 },
  { id: '171853838612_b', acc: 78.6, blund: 0, mist: 3, miss: 1, inacc: 4, elo: 616, target: 1250 },
  { id: '165803154362_w', acc: 70.1, blund: 1, mist: 10, miss: 0, inacc: 3, elo: 248, target: 100 },
  { id: '165803154362_b', acc: 75.9, blund: 0, mist: 2, miss: 5, inacc: 4, elo: 281, target: 900 },
  { id: '184348301442_w', acc: 63.0, blund: 2, mist: 1, miss: 0, inacc: 4, elo: 683, target: 600 },
  { id: '184348301442_b', acc: 75.3, blund: 0, mist: 0, miss: 2, inacc: 2, elo: 708, target: 1200 }
];

function variance(arr) {
    if (arr.length <= 1) return 0;
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
}

function buildTree(items, depth = 0, maxDepth = 6) {
    if (items.length === 0) return null;
    const targets = items.map(i => i.target);
    const avg = targets.reduce((a, b) => a + b, 0) / targets.length;
    const allSame = targets.every(t => t === targets[0]);
    if (allSame || depth >= maxDepth || items.length <= 1) {
        return { isLeaf: true, value: Math.round(avg / 50) * 50 };
    }

    const features = ['acc', 'blund', 'mist', 'miss', 'inacc'];
    let bestGain = -1;
    let bestSplit = null;

    const currentVar = variance(targets);

    for (const f of features) {
        const vals = [...new Set(items.map(i => i[f]))].sort((a, b) => a - b);
        for (let i = 0; i < vals.length - 1; i++) {
            const thresh = (vals[i] + vals[i + 1]) / 2;
            const left = items.filter(x => x[f] <= thresh);
            const right = items.filter(x => x[f] > thresh);
            if (left.length === 0 || right.length === 0) continue;

            const vL = variance(left.map(x => x.target));
            const vR = variance(right.map(x => x.target));
            const gain = currentVar - ((left.length / items.length) * vL + (right.length / items.length) * vR);

            if (gain > bestGain) {
                bestGain = gain;
                bestSplit = { feature: f, threshold: thresh, left, right };
            }
        }
    }

    if (!bestSplit || bestGain <= 0.001) {
        return { isLeaf: true, value: Math.round(avg / 50) * 50 };
    }

    return {
        feature: bestSplit.feature,
        threshold: bestSplit.threshold,
        left: buildTree(bestSplit.left, depth + 1, maxDepth),
        right: buildTree(bestSplit.right, depth + 1, maxDepth),
        value: Math.round(avg / 50) * 50
    };
}

const tree = buildTree(benchmarkData);

const modelObj = {
    features: ['acc', 'blund', 'mist', 'miss', 'inacc'],
    tree: tree
};

fs.writeFileSync(path.join(__dirname, '..', 'game_rating_model.json'), JSON.stringify(modelObj, null, 2));
console.log('Successfully saved game_rating_model.json!');
