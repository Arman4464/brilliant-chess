/**
 * Batch Chess.com Review Extractor (Node.js + Puppeteer)
 * 
 * Usage:
 *   1. Install puppeteer:
 *      npm install puppeteer
 * 
 *   2. Run with one or more game review URLs or game IDs:
 *      node batch_extract_reviews.js 184653017586
 *      node batch_extract_reviews.js https://www.chess.com/analysis/game/live/184653017586/review
 * 
 *   3. It will save the extracted JSON files into a `reviews/` directory.
 */

const fs = require('fs');
const path = require('path');

async function extractReviewForUrl(page, url) {
  console.log(`\n⏳ Navigating to: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await page.waitForSelector('wc-chess-board', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  const reviewData = await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const cb = document.querySelector('wc-chess-board');
    const game = cb?.game;
    const headers = game?.getHeaders?.() || {};
    const rawLines = game?.getRawLines?.()?.[0] || [];

    // Return to overview if on move view
    let backBtn = document.querySelector('button[aria-label="Back"]');
    if (backBtn) {
      backBtn.click();
      await wait(300);
    }

    const whiteAcc = document.querySelector('.review-rating-white span')?.innerText?.trim();
    const blackAcc = document.querySelector('.review-rating-black span')?.innerText?.trim();

    let whitePerfRating = null;
    let blackPerfRating = null;
    const ratingRows = Array.from(document.querySelectorAll('.game-overview-row'));
    for (const row of ratingRows) {
      if (row.innerText.includes('Game Rating')) {
        whitePerfRating = row.querySelector('.review-rating-white')?.innerText?.trim();
        blackPerfRating = row.querySelector('.review-rating-black')?.innerText?.trim();
      }
    }

    const tallies = {};
    const tallyRows = Array.from(document.querySelectorAll('.tally-row-row'));
    for (const r of tallyRows) {
      const title = r.querySelector('.tally-row-rowTitle')?.innerText?.trim()?.toLowerCase();
      const values = Array.from(r.querySelectorAll('.tally-row-value')).map((v) =>
        parseInt(v.innerText?.trim(), 10)
      );
      if (title && values.length >= 2) {
        tallies[title] = { white: values[0], black: values[1] };
      }
    }

    // Switch to move view
    let startBtn =
      document.querySelector('.tab-review-start-review-button') ||
      Array.from(document.querySelectorAll('button')).find((b) =>
        b.innerText.includes('Start Review')
      );
    if (startBtn) {
      startBtn.click();
      for (let t = 0; t < 25; t++) {
        await wait(100);
        if (document.querySelector('.node[data-node]')) break;
      }
    }

    const moveCount = rawLines.length;
    const moves = [];

    for (let i = 0; i < moveCount; i++) {
      const nodeEl = document.querySelector(`.node[data-node="0-${i}"]`);
      if (nodeEl) {
        nodeEl.click();
        await wait(35);

        const container = document.querySelector('.move-by-move-container');
        const lines = container ? container.innerText.split('\n') : [];

        const raw = rawLines[i] || {};
        const rawClass = lines[1] || '';
        const cleanClassification = rawClass
          .replace(/^is (the |an? )?/i, '')
          .replace(/ move$/i, '')
          .trim();

        moves.push({
          ply: i + 1,
          moveNumber: raw.wholeMoveNumber || Math.floor(i / 2) + 1,
          color: raw.color === 1 ? 'white' : 'black',
          san: raw.san || lines[0]?.trim(),
          classification: cleanClassification || 'regular',
          eval: lines[2] || null,
          clock: raw.commands?.clk || null,
          timeSpent: raw.time ? (raw.time / 1000).toFixed(1) + 's' : null,
          fen: raw.fen || null
        });
      }
    }

    const gameId = window.chesscom?.analysis?.gameId || window.location.pathname.split('/').filter(Boolean)[3] || "game";
    return {
      game: {
        id: gameId,
        url: window.location.origin + window.location.pathname,
        date: headers.Date,
        timeControl: headers.TimeControl ? `${parseInt(headers.TimeControl, 10) / 60} min` : "10 min",
        eco: headers.ECO,
        opening: headers.ECOUrl ? headers.ECOUrl.split('/').pop().replace(/-/g, ' ') : "Unknown",
        result: headers.Result,
        termination: headers.Termination
      },
      players: {
        white: {
          username: headers.White,
          rating: headers.WhiteElo ? parseInt(headers.WhiteElo, 10) : null,
          accuracy: whiteAcc ? parseFloat(whiteAcc) : null,
          performanceRating: whitePerfRating ? parseInt(whitePerfRating, 10) : null
        },
        black: {
          username: headers.Black,
          rating: headers.BlackElo ? parseInt(headers.BlackElo, 10) : null,
          accuracy: blackAcc ? parseFloat(blackAcc) : null,
          performanceRating: blackPerfRating ? parseInt(blackPerfRating, 10) : null
        }
      },
      tallies: tallies,
      totalMoves: moves.length,
      moves: moves
    };
  });

  return reviewData;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: node batch_extract_reviews.js <gameId_or_url_1> [gameId_or_url_2 ...]");
    process.exit(1);
  }

  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    console.error("Puppeteer is not installed. Please run: npm install puppeteer");
    process.exit(1);
  }

  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  const systemChrome = chromePaths.find(p => fs.existsSync(p));

  const launchOptions = {
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 }
  };
  if (systemChrome) {
    launchOptions.executablePath = systemChrome;
  }

  const browser = await puppeteer.launch(launchOptions);

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  const outDir = path.join(__dirname, 'review_data', 'move_by_move_reviews');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const item of args) {
    const url = item.startsWith('http')
      ? item
      : `https://www.chess.com/analysis/game/live/${item}/review`;

    try {
      const data = await extractReviewForUrl(page, url);
      const filename = path.join(outDir, `review_${data.game.id}.json`);
      fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
      console.log(`✅ Saved review to: ${filename}`);
    } catch (err) {
      console.error(`❌ Failed extracting ${url}:`, err.message);
    }
  }

  await browser.close();
  console.log("\n🎉 Finished extracting all game reviews!");
}

main().catch(console.error);
