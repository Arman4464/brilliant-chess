const fs = require('fs');

const moves = JSON.parse(fs.readFileSync('all_510_moves.json'));
const model = JSON.parse(fs.readFileSync('classification_tree.json', 'utf8'));

// Let's test the model directly on moves from all_510_moves.json
const classes = model.classes;
const classToIdx = Object.fromEntries(classes.map((c, i) => [c, i]));
const tree = model.tree;

function predictTree(node, f) {
    if (node.isLeaf) return node.prediction;
    if (f[node.feature] <= node.threshold) return predictTree(node.left, f);
    return predictTree(node.right, f);
}

let lastGame = null;
let lastEval = 0.2;
let lastSan = '';

let matches = 0;
const mismatches = [];

moves.forEach(m => {
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

    const features = [
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
    ];

    const predIdx = predictTree(tree, features);
    const pred = classes[predIdx];
    if (pred === m.official) matches++;
    else {
        mismatches.push({
            game: m.gameId,
            ply: m.ply,
            san,
            pred,
            official: m.official,
            diff: m.diff,
            eval: m.eval
        });
    }
});

console.log(`Direct test on all_510_moves.json: ${matches} / ${moves.length} (${(matches/moves.length*100).toFixed(2)}%)`);
console.log(`Mismatches: ${mismatches.length}`);
if (mismatches.length > 0) console.log(mismatches.slice(0, 10));
