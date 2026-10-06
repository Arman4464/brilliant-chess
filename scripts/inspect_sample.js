const fs = require('fs');

const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));

console.log('Game ID:', sample.game.id);
console.log('Players:', JSON.stringify(sample.players, null, 2));
console.log('Tallies:', JSON.stringify(sample.tallies, null, 2));
console.log('Total moves:', sample.moves.length);

console.log('\n--- MOVES BREAKDOWN ---');
for (const m of sample.moves) {
    console.log(`[Ply ${String(m.ply).padStart(2)}] ${m.color.padEnd(5)} ${m.san.padEnd(7)} | class: ${m.classification.padEnd(11)} | eval: ${(m.eval || '').padEnd(8)}`);
}
