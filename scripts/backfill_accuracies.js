const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'review_data', 'move_by_move_reviews');
const idx911 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'review_data', '911Samsung', 'index.json'), 'utf8'));

const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

for (const file of files) {
  const filePath = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const gameId = data.game?.id;
  const match = idx911.games.find(g => g.gameId === gameId);

  let updated = false;
  if (match && match.accuracies) {
    if (!data.players.white.accuracy) {
      data.players.white.accuracy = match.accuracies.white;
      updated = true;
    }
    if (!data.players.black.accuracy) {
      data.players.black.accuracy = match.accuracies.black;
      updated = true;
    }
  }

  if (updated) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Updated accuracies for ${file} from index: White=${data.players.white.accuracy}, Black=${data.players.black.accuracy}`);
  } else {
    console.log(`${file}: White=${data.players.white.accuracy}, Black=${data.players.black.accuracy}, Total moves=${data.totalMoves}`);
  }
}
