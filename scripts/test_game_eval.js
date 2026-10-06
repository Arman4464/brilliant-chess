const fs = require('fs');
const { Evaluator } = require('./engine_evaluator');

(async () => {
    const ev = new Evaluator(15, 8, 128);
    const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));
    console.log(`Evaluating game ${sample.game.id}...`);
    const t0 = Date.now();
    const moves = await ev.evaluateGame(sample);
    const elapsed = Date.now() - t0;
    console.log(`Evaluated ${moves.length} moves in ${(elapsed / 1000).toFixed(2)}s!`);
    console.log('First 5 moves:');
    console.log(moves.slice(0, 5));
    ev.terminate();
})().catch(console.error);
