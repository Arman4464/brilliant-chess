const fs = require('fs');
const moves = JSON.parse(fs.readFileSync('all_510_moves.json'));

const bToE = moves.filter(m => m.rawCee === 'best' && m.official === 'excellent');
const bToB = moves.filter(m => m.rawCee === 'best' && m.official === 'best');

console.log('bToE evals:', bToE.map(m => m.eval));
console.log('bToB evals:', bToB.map(m => m.eval));

console.log('\nbToE SANS:');
console.log(bToE.map(m => `${m.san} (e=${m.eval}, p=${m.ply})`).join(', '));

console.log('\nbToB SANS with |eval| >= 5.0:');
const bToBDecisive = bToB.filter(m => Math.abs(m.eval) >= 5.0);
console.log(bToBDecisive.map(m => `${m.san} (e=${m.eval}, p=${m.ply})`).join(', '));
