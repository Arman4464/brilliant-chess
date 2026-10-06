/**
 * Chess.com Game Review Extractor
 * 
 * Usage in Browser:
 * 1. Open any Chess.com game review page (e.g. https://www.chess.com/analysis/game/live/184653017586/review)
 * 2. Open Developer Tools (F12 or Ctrl+Shift+I) -> Console tab.
 * 3. Paste this script and hit Enter.
 * 4. It will extract the full review (summary + all move classifications/evals)
 *    and automatically download `chesscom_review_<gameId>.json` and copy it to your clipboard.
 */

(async function extractChessReview() {
  console.log("♟️ [Chess.com Review Extractor] Starting extraction...");
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    // 1. Get Board & Raw Move Details from Chess.com Web Component
    const cb = document.querySelector('wc-chess-board');
    const game = cb?.game;
    const headers = game?.getHeaders?.() || {};
    const rawLines = game?.getRawLines?.()?.[0] || [];

    // 2. Extract Overview Data
    let backBtn = document.querySelector('button[aria-label="Back"]');
    if (backBtn) {
      backBtn.click();
      await wait(200);
    }

    // Accuracies
    const whiteAcc = document.querySelector('.review-rating-white span')?.innerText?.trim();
    const blackAcc = document.querySelector('.review-rating-black span')?.innerText?.trim();

    // Performance ratings
    let whitePerfRating = null;
    let blackPerfRating = null;
    const ratingRows = Array.from(document.querySelectorAll('.game-overview-row'));
    for (const row of ratingRows) {
      if (row.innerText.includes('Game Rating')) {
        whitePerfRating = row.querySelector('.review-rating-white')?.innerText?.trim();
        blackPerfRating = row.querySelector('.review-rating-black')?.innerText?.trim();
      }
    }

    // Move classification tallies (Brilliant, Great, Best, Excellent, Book, etc.)
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

    // 3. Switch to Move-by-Move View
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

    // 4. Iterate Over Every Move to Extract Individual Evaluations & Classifications
    const moveCount = rawLines.length;
    const moves = [];

    console.log(`♟️ [Chess.com Review Extractor] Stepping through ${moveCount} plies...`);

    for (let i = 0; i < moveCount; i++) {
      const nodeEl = document.querySelector(`.node[data-node="0-${i}"]`);
      if (nodeEl) {
        nodeEl.click();
        await wait(35); // Fast step

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

    // 5. Build Final Output Object
    const gameId = window.chesscom?.analysis?.gameId || window.location.pathname.split('/').filter(Boolean)[3] || "game";
    const reviewData = {
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

    console.log("✅ [Chess.com Review Extractor] Extracted successfully!", reviewData);

    // 6. Copy to Clipboard
    try {
      await navigator.clipboard.writeText(JSON.stringify(reviewData, null, 2));
      console.log("📋 Copied review JSON to clipboard!");
    } catch (_) {}

    // 7. Auto Download JSON File
    const blob = new Blob([JSON.stringify(reviewData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chesscom_review_${gameId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`💾 Downloaded chesscom_review_${gameId}.json`);

    return reviewData;
  } catch (err) {
    console.error("❌ [Chess.com Review Extractor] Error:", err);
  }
})();
