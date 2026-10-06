const fs = require('fs');
const path = require('path');
const { ChessReviewEngine } = require('./review_pipeline.js');

async function benchmarkUnreviewedGames() {
    const unreviewedGames = [
        '171608609212',
        '184653017586',
        '171567202616',
        '171097463416'
    ];

    const engine = new ChessReviewEngine(3);
    console.log(`=== RUNNING MULTI-GAME BENCHMARK ON NEW UNREVIEWED GAMES ===\n`);
    console.log(`Pipeline Configuration:`);
    console.log(` - Stockfish 19 Deep Pool (Depth 18, MultiPV 3 + Targeted Searchmoves)`);
    console.log(` - Official ECO Opening Book (53,970 positions) + 'last book' Transition`);
    console.log(` - Authentic Chess.com CEE WASM (CoachAssetsV2, DefaultNumVariations 4)\n`);

    const summaryResults = [];

    for (const id of unreviewedGames) {
        const file = `review_data/move_by_move_reviews/review_${id}.json`;
        if (!fs.existsSync(file)) {
            console.warn(`File not found: ${file}`);
            continue;
        }

        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const whiteUser = data.players?.white?.username || 'White';
        const blackUser = data.players?.black?.username || 'Black';
        const whiteElo = data.players?.white?.rating || 1500;
        const blackElo = data.players?.black?.rating || 1500;
        const officialWhiteAcc = Number((data.accuracies?.white ?? data.players?.white?.accuracy ?? 0).toFixed(1));
        const officialBlackAcc = Number((data.accuracies?.black ?? data.players?.black?.accuracy ?? 0).toFixed(1));

        console.log(`--------------------------------------------------------------------------------`);
        console.log(`Analyzing New Game #${id} (${data.moves.length} plies)`);
        console.log(`Players: ${whiteUser} (${whiteElo}) vs ${blackUser} (${blackElo})`);
        console.log(`Official Scores: White ${officialWhiteAcc}%, Black ${officialBlackAcc}%\n`);

        const t0 = Date.now();
        const r = await engine.analyzeGame({
            moves: data.moves,
            whiteElo,
            blackElo,
            depth: 18,
            multiPv: 3
        });
        const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

        let matches = 0;
        const diffs = [];
        r.moves.forEach((m, idx) => {
            const off = data.moves[idx].classification;
            if (m.classification === off) {
                matches++;
            } else {
                diffs.push({
                    ply: m.ply,
                    san: m.san,
                    calculated: m.classification,
                    official: off,
                    diff: m.difference,
                    caps2: m.caps2
                });
            }
        });

        const totalPlies = r.moves.length;
        const parityPct = (matches / totalPlies * 100).toFixed(1);
        const whiteDiff = Math.abs(r.accuracies.white - officialWhiteAcc).toFixed(1);
        const blackDiff = Math.abs(r.accuracies.black - officialBlackAcc).toFixed(1);

        console.log(`✓ Completed in ${elapsed}s (Stockfish: ${r.executionTime.stockfish}s, CEE: ${r.executionTime.cee}s)`);
        console.log(`  White Accuracy: ${r.accuracies.white}% (Official: ${officialWhiteAcc}%) -> Delta: ${whiteDiff}%`);
        console.log(`  Black Accuracy: ${r.accuracies.black}% (Official: ${officialBlackAcc}%) -> Delta: ${blackDiff}%`);
        console.log(`  Exact Classification Parity: ${matches}/${totalPlies} (${parityPct}%)\n`);

        summaryResults.push({
            id,
            plies: totalPlies,
            whiteUser,
            blackUser,
            ourWhite: r.accuracies.white,
            offWhite: officialWhiteAcc,
            whiteDelta: whiteDiff,
            ourBlack: r.accuracies.black,
            offBlack: officialBlackAcc,
            blackDelta: blackDiff,
            parity: `${matches}/${totalPlies} (${parityPct}%)`,
            time: `${elapsed}s`
        });
    }

    console.log(`========================= FINAL BENCHMARK SUMMARY =========================`);
    console.table(summaryResults);
}

benchmarkUnreviewedGames().catch(console.error);
