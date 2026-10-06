const fs = require('fs');
const file = 'review_data/Spy-deer-man/review_184348301442.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
data.game.eco = 'Modern-Defense-with-1-d4-2.Nc3';
data.pgn = data.pgn
  .replace(/\[ECO "[^"]*"\]/, '[ECO "A40"]')
  .replace(/\[ECOUrl "[^"]*"\]/, '[ECOUrl "https://www.chess.com/openings/Modern-Defense-with-1-d4-2.Nc3"]');
fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('Updated 184348301442 ECO to A40 Modern Defense with 1.d4 2.Nc3');
