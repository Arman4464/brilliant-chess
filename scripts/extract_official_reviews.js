const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getSanMoves(pgn) {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    return chess.history().join(' ');
  } catch (e) {
    return '';
  }
}

function parsePgnHeaders(pgnText) {
  const headers = {};
  const regex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match;
  while ((match = regex.exec(pgnText)) !== null) {
    headers[match[1]] = match[2];
  }
  return headers;
}

function generateMovesList(pgn) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });

  const testChess = new Chess();
  const moves = [];

  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    const fenBefore = testChess.fen();
    testChess.move(m.san);
    const fenAfter = testChess.fen();

    moves.push({
      ply: i + 1,
      moveNumber: Math.floor(i / 2) + 1,
      color: m.color === 'w' ? 'white' : 'black',
      san: m.san,
      from: m.from,
      to: m.to,
      piece: m.piece,
      captured: m.captured || null,
      promotion: m.promotion || null,
      clock: null,
      fenBefore,
      fenAfter
    });
  }

  return moves;
}

async function extractUserReviews(username, targetDir, pgnFilename) {
  console.log(`\n==================================================`);
  console.log(`Starting extraction for ${username}...`);
  console.log(`Directory: ${targetDir}`);
  console.log(`==================================================`);

  const pgnPath = path.join(targetDir, pgnFilename);
  if (!fs.existsSync(pgnPath)) {
    throw new Error(`PGN file not found: ${pgnPath}`);
  }

  // 1. Fetch all archive games from Chess.com API
  console.log(`Fetching archives from Chess.com API...`);
  const archivesRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`, {
    headers: { 'User-Agent': 'ChessReviewExtractor/1.0' }
  });
  if (!archivesRes.ok) {
    throw new Error(`Failed to fetch archives: HTTP ${archivesRes.status}`);
  }
  const { archives } = await archivesRes.json();
  console.log(`Found ${archives.length} monthly archive URLs.`);

  const apiGames = [];
  for (const url of archives) {
    console.log(`  Downloading ${url}...`);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ChessReviewExtractor/1.0' }
    });
    if (!res.ok) {
      console.warn(`  Warning: Failed to fetch ${url} (HTTP ${res.status})`);
      continue;
    }
    const data = await res.json();
    for (const g of data.games || []) {
      const san = getSanMoves(g.pgn);
      apiGames.push({
        game: g,
        san,
        white: g.white.username.toLowerCase(),
        black: g.black.username.toLowerCase(),
        date: g.pgn.match(/\[Date "([^"]+)"\]/)?.[1] || ''
      });
    }
    await wait(150);
  }
  console.log(`Total API games indexed: ${apiGames.length}`);

  // 2. Read local PGN collection
  const rawPgnText = fs.readFileSync(pgnPath, 'utf8').replace(/\r\n/g, '\n');
  const rawGames = rawPgnText
    .split(/\n(?=\[Event )/)
    .map(g => g.trim())
    .filter(g => g.length > 0);

  console.log(`Total games in local PGN: ${rawGames.length}`);

  const indexList = [];
  let reviewedWithAccCount = 0;
  let nonLiveCount = 0;

  for (let idx = 0; idx < rawGames.length; idx++) {
    const rawPgn = rawGames[idx];
    const headers = parsePgnHeaders(rawPgn);
    const indexInCollection = idx + 1;

    const event = headers.Event || 'Unknown';
    const isLive = event === 'Live Chess';
    const whiteName = headers.White || '';
    const blackName = headers.Black || '';
    const date = headers.Date || headers.EndDate || '';
    const result = headers.Result || '*';
    const termination = headers.Termination || '';
    const timeControl = headers.TimeControl || '?';

    let gameData = null;
    let filename = '';
    let gameId = '';
    let hasAccuracies = false;
    let accuracies = null;
    let url = null;

    if (isLive) {
      const whiteLower = whiteName.toLowerCase();
      const blackLower = blackName.toLowerCase();
      const san = getSanMoves(rawPgn);

      // Find match in apiGames
      const match = apiGames.find(ag => {
        if (ag.white !== whiteLower || ag.black !== blackLower) return false;
        if (san && ag.san && san === ag.san) return true;
        if (ag.date === date && san && ag.san && ag.san.startsWith(san.slice(0, 30))) return true;
        return false;
      });

      if (!match) {
        console.warn(`⚠️ Warning: Live game #${indexInCollection} (${whiteName} vs ${blackName}, ${date}) not matched in API!`);
      }

      const apiG = match ? match.game : null;
      gameId = apiG ? apiG.url.split('/').pop() : `live_${indexInCollection}`;
      filename = `review_${gameId}.json`;
      url = apiG ? apiG.url : `https://www.chess.com/game/live/${gameId}`;
      const reviewUrl = `https://www.chess.com/analysis/game/live/${gameId}/review`;

      const eco = apiG?.eco ? apiG.eco.split('/').pop() : (headers.ECOUrl ? headers.ECOUrl.split('/').pop() : (headers.ECO || null));
      const timeClass = apiG?.time_class || (timeControl === '300' ? 'blitz' : timeControl === '600' ? 'rapid' : 'rapid');
      const rated = apiG?.rated !== undefined ? apiG.rated : true;

      accuracies = apiG?.accuracies || null;
      hasAccuracies = !!accuracies;
      if (hasAccuracies) reviewedWithAccCount++;

      const pgnToUse = apiG?.pgn || rawPgn;
      const moves = generateMovesList(pgnToUse);

      gameData = {
        game: {
          id: gameId,
          indexInCollection,
          url,
          reviewUrl,
          event,
          date,
          timeControl,
          timeClass,
          eco,
          result,
          termination,
          rated
        },
        players: {
          white: {
            username: apiG?.white?.username || whiteName,
            rating: apiG?.white?.rating ?? (parseInt(headers.WhiteElo, 10) || null),
            accuracy: accuracies?.white ?? null,
            result: apiG?.white?.result || (result === '1-0' ? 'win' : result === '0-1' ? 'checkmated' : 'draw')
          },
          black: {
            username: apiG?.black?.username || blackName,
            rating: apiG?.black?.rating ?? (parseInt(headers.BlackElo, 10) || null),
            accuracy: accuracies?.black ?? null,
            result: apiG?.black?.result || (result === '0-1' ? 'win' : result === '1-0' ? 'checkmated' : 'draw')
          }
        },
        accuracies,
        tcn: apiG?.tcn || null,
        totalMoves: moves.length,
        moves,
        pgn: pgnToUse
      };
    } else {
      // Non-live (Bot or Coach)
      nonLiveCount++;
      const isWhiteUser = whiteName.toLowerCase() === username.toLowerCase();
      const opponent = isWhiteUser ? blackName : whiteName;
      const opponentSlug = opponent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const padIndex = String(indexInCollection).padStart(2, '0');
      const prefix = event.toLowerCase().includes('bot') ? 'bot' : 'coach';

      gameId = `${prefix}_${indexInCollection}`;
      filename = `game_${prefix}_${padIndex}_${opponentSlug}.json`;
      url = null;
      hasAccuracies = false;
      accuracies = null;

      const moves = generateMovesList(rawPgn);

      gameData = {
        game: {
          id: gameId,
          indexInCollection,
          url: null,
          reviewUrl: null,
          event,
          date,
          timeControl: timeControl === '-' ? '?' : timeControl,
          timeClass: 'rapid',
          eco: headers.ECOUrl ? headers.ECOUrl.split('/').pop() : (headers.ECO || null),
          result,
          termination,
          rated: false
        },
        players: {
          white: {
            username: whiteName,
            rating: parseInt(headers.WhiteElo, 10) || 800,
            accuracy: null,
            result: null
          },
          black: {
            username: blackName,
            rating: parseInt(headers.BlackElo, 10) || 800,
            accuracy: null,
            result: null
          }
        },
        accuracies: null,
        tcn: null,
        totalMoves: moves.length,
        moves,
        pgn: rawPgn
      };
    }

    // Write individual game review JSON
    const filePath = path.join(targetDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(gameData, null, 2), 'utf8');

    // Add to index
    indexList.push({
      index: indexInCollection,
      filename,
      gameId,
      date,
      event,
      white: whiteName,
      black: blackName,
      result,
      hasAccuracies,
      accuracies,
      totalMoves: gameData.totalMoves,
      url
    });

    if (indexInCollection % 20 === 0 || indexInCollection === rawGames.length) {
      console.log(`  Processed ${indexInCollection}/${rawGames.length} games...`);
    }
  }

  // 3. Write index.json
  const indexData = {
    totalGames: rawGames.length,
    reviewedGamesWithAccuracies: reviewedWithAccCount,
    botGames: nonLiveCount,
    exportedAt: new Date().toISOString(),
    games: indexList
  };

  const indexPath = path.join(targetDir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf8');
  console.log(`✅ Finished ${username}: ${rawGames.length} games written to ${targetDir}`);
  console.log(`   Reviewed games with accuracies: ${reviewedWithAccCount}`);
  console.log(`   Bot/Coach games: ${nonLiveCount}`);
  console.log(`   Index file: ${indexPath}`);
}

(async () => {
  try {
    await extractUserReviews(
      '911samsung',
      path.join(__dirname, '../review_data/911Samsung'),
      'chess_com_games_2026-10-03.pgn'
    );

    await extractUserReviews(
      'spy-deer-man',
      path.join(__dirname, '../review_data/Spy-deer-man'),
      'chess_com_games_2026-10-03.pgn'
    );

    console.log('\n🎉 ALL EXTRACTIONS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('Extraction failed:', err);
    process.exit(1);
  }
})();
