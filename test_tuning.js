const fs = require('fs');
const path = require('path');
const { ChessReviewEngine } = require('./review_pipeline.js');

const model = JSON.parse(fs.readFileSync('classification_tree.json', 'utf8'));
const classes = model.classes;
const classToIdx = Object.fromEntries(classes.map((c, i) => [c, i]));
const tree = model.tree;

function predictTree(node, f) {
    if (node.isLeaf) return node.prediction;
    if (f[node.feature] <= node.threshold) return predictTree(node.left, f);
    return predictTree(node.right, f);
}

function classifyMoveWithModel(m, prevEval, prevSan) {
    if (m.classification === 'forced') return 'forced';
    if (m.classification === 'book' || m.classification === 'last book') return m.classification;

    let raw = m.rawClassification;
    if (raw === 'greatFind') raw = 'great';
    const rawIdx = classToIdx[raw] ?? 5;

    const san = m.san || '';
    const curE = parseFloat(m.eval) || 0;
    const isW = m.color === 'white' ? 1 : 0;
    const evalLoss = isW ? (prevEval - curE) : (curE - prevEval);
    const wasInCheck = (prevSan || '').includes('+') ? 1 : 0;
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
        Number((m.difference || 0).toFixed(2)),
        Number((m.caps2 || 100).toFixed(1)),
        Number(curE.toFixed(2)),
        Number(absE.toFixed(2)),
        Number(evalLoss.toFixed(2)),
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
    return classes[predIdx] || raw || 'best';
}

const benchmarkGames = [
    '184653017586',
    '171608609212',
    '114104460147',
    '172014464516',
    '171853838612',
    '165803154362'
];

async function runBenchmark() {
    const engine = new ChessReviewEngine(4);
    let totalPlies = 0;
    let totalMatches = 0;
    const details = [];

    for (const id of benchmarkGames) {
        const filePath = path.join(__dirname, 'review_data', 'move_by_move_reviews', `review_${id}.json`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        const res = await engine.analyzeGame({
            moves: data.moves,
            whiteElo: data.players?.white?.rating || 1500,
            blackElo: data.players?.black?.rating || 1500,
            depth: 18,
            multiPv: 2
        });

        let matches = 0;
        const mismatches = [];
        let prevEval = 0.2;
        let prevSan = '';

        res.moves.forEach((m, idx) => {
            const official = data.moves[idx].classification;
            const pred = classifyMoveWithModel(m, prevEval, prevSan);
            prevEval = parseFloat(m.eval) || 0;
            prevSan = m.san || '';

            if (pred === official) {
                matches++;
            } else {
                mismatches.push({
                    ply: m.ply,
                    san: m.san,
                    pred,
                    raw: m.rawClassification,
                    official,
                    diff: m.difference,
                    caps2: m.caps2,
                    eval: m.eval
                });
            }
        });

        const pct = (matches / res.moves.length * 100).toFixed(1);
        totalPlies += res.moves.length;
        totalMatches += matches;
        details.push({ id, plies: res.moves.length, matches, pct: `${pct}%`, mismatchesCount: mismatches.length, mismatches });
    }

    const overallPct = (totalMatches / totalPlies * 100).toFixed(2);
    console.log(`\n======================================================`);
    console.log(`OVERALL PARITY: ${totalMatches} / ${totalPlies} (${overallPct}%)`);
    console.log(`======================================================`);
    console.table(details.map(d => ({ id: d.id, plies: d.plies, matches: d.matches, parity: d.pct })));

    const totalMismatches = details.reduce((a, b) => a + b.mismatchesCount, 0);
    console.log(`Total mismatches: ${totalMismatches}`);
    console.log('Mismatches list:');
    details.flatMap(d => d.mismatches.map(m => ({ game: d.id, ...m }))).forEach(m => {
        console.log(`  G:${m.game} P:${m.ply} ${m.san.padEnd(6)} pred:${m.pred.padEnd(10)} off:${m.official.padEnd(10)} raw:${m.raw.padEnd(10)} d=${m.diff} c=${m.caps2} e=${m.eval}`);
    });
}

runBenchmark().catch(console.error);
