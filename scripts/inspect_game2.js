const fs = require('fs');
const game = JSON.parse(fs.readFileSync('review_data/review_166359560184.json', 'utf8'));

console.log('Game:', game.game.id);
console.log('White:', game.players.white.username, game.players.white.rating, 'Official Accuracy:', game.accuracies.white);
console.log('Black:', game.players.black.username, game.players.black.rating, 'Official Accuracy:', game.accuracies.black);
console.log('Total moves:', game.totalMoves);
