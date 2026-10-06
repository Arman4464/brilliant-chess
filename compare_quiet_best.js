const fs = require('fs');
const moves = JSON.parse(fs.readFileSync('all_510_moves.json'));

const bDecisive = moves.filter(m => m.rawCee === 'best' && Math.abs(m.eval) >= 5.0);
console.log('Total decisive raw-best moves:', bDecisive.length);

const bToE = bDecisive.filter(m => m.official === 'excellent');
const bToB = bDecisive.filter(m => m.official === 'best');
const bToOther = bDecisive.filter(m => m.official !== 'excellent' && m.official !== 'best');

console.log(`bToE: ${bToE.length}, bToB: ${bToB.length}, bToOther: ${bToOther.length}`);

console.log('\n--- bToE moves ---');
bToE.forEach(m => console.log(`G:${m.gameId} P:${m.ply} ${m.color[0]} ${m.san.padEnd(6)} e=${m.eval} offE=${m.officialEval}`));

console.log('\n--- bToB moves that are NOT checks or captures ---');
const bToBQuiet = bToB.filter(m => !m.san.includes('+') && !m.san.includes('x') && !m.san.includes('#'));
bToBQuiet.forEach(m => console.log(`G:${m.gameId} P:${m.ply} ${m.color[0]} ${m.san.padEnd(6)} e=${m.eval} offE=${m.officialEval}`));
