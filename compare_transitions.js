const fs = require('fs');
const moves = JSON.parse(fs.readFileSync('all_510_moves.json'));

console.log('=== EXAMINING TRANSITIONS ===');

// 1. When does raw 'best' become 'excellent'?
const bToE = moves.filter(m => m.rawCee === 'best' && m.official === 'excellent');
const bToB = moves.filter(m => m.rawCee === 'best' && m.official === 'best');
console.log(`best -> excellent (${bToE.length}) vs best -> best (${bToB.length})`);

// 2. When does raw 'excellent' become 'best'?
const eToB = moves.filter(m => m.rawCee === 'excellent' && m.official === 'best');
const eToE = moves.filter(m => m.rawCee === 'excellent' && m.official === 'excellent');
console.log(`excellent -> best (${eToB.length}) vs excellent -> excellent (${eToE.length})`);

// 3. When does raw 'excellent' become 'good'?
const eToG = moves.filter(m => m.rawCee === 'excellent' && m.official === 'good');
console.log(`excellent -> good (${eToG.length}) vs excellent -> excellent (${eToE.length})`);

// 4. When does raw 'good' become 'excellent'?
const gToE = moves.filter(m => m.rawCee === 'good' && m.official === 'excellent');
const gToG = moves.filter(m => m.rawCee === 'good' && m.official === 'good');
console.log(`good -> excellent (${gToE.length}) vs good -> good (${gToG.length})`);

// 5. When does raw 'mistake' become 'inaccuracy'?
const mToI = moves.filter(m => m.rawCee === 'mistake' && m.official === 'inaccuracy');
const mToM = moves.filter(m => m.rawCee === 'mistake' && m.official === 'mistake');
console.log(`mistake -> inaccuracy (${mToI.length}) vs mistake -> mistake (${mToM.length})`);

// 6. When does raw 'inaccuracy' become 'good'?
const iToG = moves.filter(m => m.rawCee === 'inaccuracy' && m.official === 'good');
const iToI = moves.filter(m => m.rawCee === 'inaccuracy' && m.official === 'inaccuracy');
console.log(`inaccuracy -> good (${iToG.length}) vs inaccuracy -> inaccuracy (${iToI.length})`);
