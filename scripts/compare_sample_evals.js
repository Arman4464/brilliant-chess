const fs = require('fs');
const { Evaluator } = require('./engine_evaluator');

(async () => {
    const ev = new Evaluator(15, 8, 128);
    const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));
    const computedMoves = await ev.evaluateGame(sample);
    ev.terminate();

    console.log('--- COMPARING COMPUTED VS GROUND TRUTH FOR 74 MOVES ---');
    console.log('Ply | SAN   | Ground Cls   | SF Best | ScoreB | ScoreA | DeltaCp | Ground Eval');
    console.log('----+-------+--------------+---------+--------+--------+---------+------------');
    for (let i = 0; i < computedMoves.length; i++) {
        const c = computedMoves[i];
        const g = sample.moves[i];
        console.log(
            `${String(c.ply).padStart(3)} | ` +
            `${c.san.padEnd(5)} | ` +
            `${g.classification.padEnd(12)} | ` +
            `${c.bestMoveSan.padEnd(7)} | ` +
            `${String(c.scoreBefore).padStart(6)} | ` +
            `${String(c.scoreAfter).padStart(6)} | ` +
            `${String(c.deltaCp).padStart(7)} | ` +
            `${g.eval.padStart(10)}`
        );
    }
})().catch(console.error);
