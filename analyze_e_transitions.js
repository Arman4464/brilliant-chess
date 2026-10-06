const fs = require('fs');
const moves = JSON.parse(fs.readFileSync('all_510_moves.json'));

const eToB = moves.filter(m => m.rawCee === 'excellent' && m.official === 'best');
const eToE = moves.filter(m => m.rawCee === 'excellent' && m.official === 'excellent');
const eToG = moves.filter(m => m.rawCee === 'excellent' && m.official === 'good');

console.log('=== eToB (22) ===');
console.log(eToB.map(m => `${m.san} (d=${m.diff}, c=${m.caps2}, e=${m.eval})`).join(', '));

console.log('\n=== eToG (28) ===');
console.log(eToG.map(m => `${m.san} (d=${m.diff}, c=${m.caps2}, e=${m.eval})`).join(', '));
