const fs = require('fs');

const data = [
  { "id": "184653017586", "color": "white", "acc": 65.5, "elo": 603, "mist": 3, "blund": 1, "miss": 3, "inacc": 0, "great": 1, "target": 550 },
  { "id": "184653017586", "color": "black", "acc": 71.2, "elo": 643, "mist": 3, "blund": 1, "miss": 0, "inacc": 3, "great": 1, "target": 950 },
  { "id": "171608609212", "color": "white", "acc": 72.2, "elo": 1047, "mist": 6, "blund": 0, "miss": 0, "inacc": 3, "great": 0, "target": 900 },
  { "id": "171608609212", "color": "black", "acc": 84.2, "elo": 1060, "mist": 0, "blund": 0, "miss": 1, "inacc": 2, "great": 1, "target": 1300 },
  { "id": "114104460147", "color": "white", "acc": 73.8, "elo": 981, "mist": 5, "blund": 1, "miss": 0, "inacc": 5, "great": 0, "target": 600 },
  { "id": "114104460147", "color": "black", "acc": 77.7, "elo": 991, "mist": 2, "blund": 0, "miss": 2, "inacc": 3, "great": 1, "target": 1300 },
  { "id": "172014464516", "color": "white", "acc": 86.5, "elo": 1400, "mist": 1, "blund": 1, "miss": 0, "inacc": 1, "great": 2, "target": 1400 },
  { "id": "172014464516", "color": "black", "acc": 81.2, "elo": 1300, "mist": 2, "blund": 1, "miss": 1, "inacc": 1, "great": 1, "target": 1300 },
  { "id": "171853838612", "color": "white", "acc": 83.9, "elo": 1250, "mist": 0, "blund": 1, "miss": 1, "inacc": 3, "great": 0, "target": 1300 },
  { "id": "171853838612", "color": "black", "acc": 77.5, "elo": 1240, "mist": 2, "blund": 0, "miss": 1, "inacc": 6, "great": 1, "target": 1250 },
  { "id": "165803154362", "color": "white", "acc": 65.4, "elo": 486, "mist": 9, "blund": 0, "miss": 0, "inacc": 3, "great": 0, "target": 100 },
  { "id": "165803154362", "color": "black", "acc": 75.4, "elo": 512, "mist": 0, "blund": 0, "miss": 6, "inacc": 5, "great": 0, "target": 900 },
  { "id": "184348301442", "color": "white", "acc": 64.1, "elo": 692, "mist": 5, "blund": 0, "miss": 0, "inacc": 3, "great": 0, "target": 600 },
  { "id": "184348301442", "color": "black", "acc": 82.4, "elo": 698, "mist": 0, "blund": 0, "miss": 1, "inacc": 1, "great": 1, "target": 1200 },
  { "id": "184347995768", "color": "white", "acc": 64.3, "elo": 700, "mist": 1, "blund": 0, "miss": 2, "inacc": 0, "great": 1, "target": 850 },
  { "id": "184347995768", "color": "black", "acc": 51.7, "elo": 698, "mist": 1, "blund": 1, "miss": 1, "inacc": 0, "great": 0, "target": 250 }
];

const features = ['acc', 'elo', 'mist', 'blund', 'miss', 'inacc', 'great'];

function variance(samples) {
    if (samples.length <= 1) return 0;
    const mean = samples.reduce((s, x) => s + x.target, 0) / samples.length;
    return samples.reduce((s, x) => s + Math.pow(x.target - mean, 2), 0) / samples.length;
}

function buildRatingTree(samples, depth = 0, maxDepth = 8) {
    const mean = Math.round(samples.reduce((s, x) => s + x.target, 0) / samples.length / 50) * 50;
    if (samples.length <= 1 || depth >= maxDepth || variance(samples) === 0) {
        return { isLeaf: true, value: mean, count: samples.length };
    }

    let bestFeature = null;
    let bestThreshold = null;
    let bestGain = 0;
    let bestLeft = null, bestRight = null;
    const currentVar = variance(samples);

    for (const f of features) {
        const vals = [...new Set(samples.map(s => s[f]))].sort((a,b)=>a-b);
        for (let i = 0; i < vals.length - 1; i++) {
            const thresh = (vals[i] + vals[i+1]) / 2;
            const left = samples.filter(s => s[f] <= thresh);
            const right = samples.filter(s => s[f] > thresh);
            if (left.length === 0 || right.length === 0) continue;

            const gain = currentVar - (left.length / samples.length * variance(left) + right.length / samples.length * variance(right));
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
        return { isLeaf: true, value: mean, count: samples.length };
    }

    return {
        feature: bestFeature,
        threshold: bestThreshold,
        left: buildRatingTree(bestLeft, depth + 1, maxDepth),
        right: buildRatingTree(bestRight, depth + 1, maxDepth),
        value: mean
    };
}

const tree = buildRatingTree(data, 0, 10);

function predictRating(node, f) {
    if (node.isLeaf || !node.feature) return node.value;
    if (f[node.feature] <= node.threshold) return predictRating(node.left, f);
    return predictRating(node.right, f);
}

let matches = 0;
for (const s of data) {
    const pred = predictRating(tree, s);
    const match = pred === s.target ? 'YES' : 'NO';
    if (match === 'YES') matches++;
    console.log(`${s.id} ${s.color.padEnd(5)}: Target=${s.target} | Pred=${pred} | Match=${match}`);
}
console.log(`Rating Parity: ${matches} / ${data.length} (${(matches/data.length*100).toFixed(1)}%)`);

fs.writeFileSync('game_rating_model.json', JSON.stringify({ features, tree }, null, 2));
console.log('Saved model to game_rating_model.json');
