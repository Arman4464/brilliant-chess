const fs = require('fs');
const path = require('path');

const g = JSON.parse(fs.readFileSync('scripts/cache/game_166359560184.json', 'utf8'));
console.log('Game 166359560184:');
console.log('White Rating:', g.whiteRating, 'Official Acc:', g.officialWhiteAcc);
console.log('Black Rating:', g.blackRating, 'Official Acc:', g.officialBlackAcc);
console.log('Total moves:', g.moves.length);

for (let i = 0; i < g.moves.length; i++) {
    const m = g.moves[i];
    if (m.deltaCp > 100 || Math.abs(m.scoreBefore) > 1000) {
        console.log(`Ply ${m.ply} (${m.color} ${m.san}): dCp=${m.deltaCp}, scoreB=${m.scoreBefore}, scoreA=${m.scoreAfter}, isBest=${m.isBest}`);
    }
}
