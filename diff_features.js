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

const allMoves = JSON.parse(fs.readFileSync('all_510_moves.json'));

async function checkDiff() {
    const engine = new ChessReviewEngine(4);
    const benchmarkGames = ['184653017586', '171608609212', '114104460147', '172014464516', '171853838612', '165803154362'];

    let moveIdx = 0;
    const diffs = [];

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

        res.moves.forEach((m, i) => {
            const dumped = allMoves[moveIdx];
            const official = data.moves[i].classification;

            // Check if m.classification in res matches dumped.official
            if (m.classification !== official) {
                diffs.push({
                    game: id,
                    ply: m.ply,
                    san: m.san,
                    calculated: m.classification,
                    official,
                    dumpedRaw: dumped.rawCee,
                    pipelineRaw: m.rawClassification,
                    dumpedDiff: dumped.diff,
                    pipelineDiff: m.difference,
                    dumpedCaps: dumped.caps2,
                    pipelineCaps: m.caps2,
                    dumpedEval: dumped.eval,
                    pipelineEval: m.eval
                });
            }
            moveIdx++;
        });
    }

    console.log(`Total diffs between pipeline output and official: ${diffs.length}`);
    console.log(diffs);
}

checkDiff().catch(console.error);
