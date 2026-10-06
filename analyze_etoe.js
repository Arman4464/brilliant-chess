const fs = require('fs');
const moves = JSON.parse(fs.readFileSync('all_510_moves.json'));

const eToE = moves.filter(m => m.rawCee === 'excellent' && m.official === 'excellent');
console.log('Count eToE:', eToE.length);
const diffs = eToE.map(m => m.diff);
console.log('eToE diffs min/max/avg:', Math.min(...diffs), Math.max(...diffs), (diffs.reduce((a,b)=>a+b,0)/eToE.length).toFixed(2));
console.log('eToE diffs distribution:');
const buckets = { '<=0.1': 0, '0.1-0.2': 0, '0.2-0.3': 0, '0.3-0.4': 0, '0.4-0.5': 0, '>0.5': 0 };
eToE.forEach(m => {
    if (m.diff <= 0.1) buckets['<=0.1']++;
    else if (m.diff <= 0.2) buckets['0.1-0.2']++;
    else if (m.diff <= 0.3) buckets['0.2-0.3']++;
    else if (m.diff <= 0.4) buckets['0.3-0.4']++;
    else if (m.diff <= 0.5) buckets['0.4-0.5']++;
    else buckets['>0.5']++;
});
console.log(buckets);
