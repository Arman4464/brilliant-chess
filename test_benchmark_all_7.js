const fs = require('fs');
const path = require('path');
const { ChessReviewEngine } = require('./review_pipeline.js');

const benchmarkGames = [
    { id: '184653017586', wAcc: 60.3, bAcc: 70.0, eco: 'C50', wRating: 550, bRating: 950, folder: 'move_by_move_reviews' },
    { id: '171608609212', wAcc: 74.7, bAcc: 86.3, eco: 'D00', wRating: 900, bRating: 1300, folder: 'move_by_move_reviews' },
    { id: '114104460147', wAcc: 70.5, bAcc: 74.5, eco: 'D00', wRating: 600, bRating: 1300, folder: 'move_by_move_reviews' },
    { id: '172014464516', wAcc: 87.1, bAcc: 81.7, eco: 'B01', wRating: 1400, bRating: 1300, folder: 'move_by_move_reviews' },
    { id: '171853838612', wAcc: 83.9, bAcc: 76.5, eco: 'C64', wRating: 1300, bRating: 1250, folder: 'move_by_move_reviews' },
    { id: '165803154362', wAcc: 66.2, bAcc: 75.3, eco: 'B06', wRating: 100, bRating: 900, folder: 'move_by_move_reviews' },
    { id: '184348301442', wAcc: 63.0, bAcc: 75.3, eco: 'A40', wRating: 600, bRating: 1200, folder: 'Spy-deer-man' }
];

async function main() {
    const engine = new ChessReviewEngine(4);
    let totalPlies = 0;
    let totalMatches = 0;
    let totalEcoMatches = 0;
    let totalRatingMatches = 0;
    let sumAccDiff = 0.0;
    const gameResults = [];

    console.log('=== RUNNING COMPLETE 7-GAME PARITY BENCHMARK ===\n');

    for (const bg of benchmarkGames) {
        const id = bg.id;
        const filePath = path.join(__dirname, 'review_data', bg.folder, `review_${id}.json`);
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            continue;
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`--- Analyzing Game #${id} (${data.moves.length} plies) ---`);

        const res = await engine.analyzeGame({
            pgn: data.pgn,
            moves: data.moves,
            whiteElo: data.players?.white?.rating || 1500,
            blackElo: data.players?.black?.rating || 1500,
            depth: 18,
            multiPv: 2
        });

        // Load ground truth classifications
        let gtPath = path.join(__dirname, `ground_truth_${id}.json`);
        let gtMoves = null;
        if (fs.existsSync(gtPath)) {
            gtMoves = JSON.parse(fs.readFileSync(gtPath, 'utf8'));
        }

        let matches = 0;
        const mismatches = [];
        res.moves.forEach((m, idx) => {
            let official = '';
            if (gtMoves && gtMoves[idx]) {
                official = (gtMoves[idx].classification || gtMoves[idx].rating || '').toLowerCase().replace('is a ', '').replace('is an ', '').replace('is ', '').replace(' move', '');
            } else if (data.moves[idx]) {
                official = (data.moves[idx].classification || '').toLowerCase();
            }
            if (official === 'great_find' || official === 'great find') official = 'great';
            if (official === 'incorrect') official = 'miss';
            if (official === 'last book') official = 'book';

            let calc = (m.classification || '').toLowerCase();
            if (calc === 'great_find' || calc === 'great find') calc = 'great';
            if (calc === 'incorrect') calc = 'miss';
            if (calc === 'last book') calc = 'book';

            if (calc === official) {
                matches++;
            } else {
                mismatches.push({
                    ply: m.ply,
                    san: m.san,
                    calculated: m.classification,
                    official,
                    diff: m.difference,
                    caps2: m.caps2,
                    eval: m.eval
                });
            }
        });

        const pct = (matches / res.moves.length * 100).toFixed(1);
        totalPlies += res.moves.length;
        totalMatches += matches;

        const ecoMatch = res.opening?.code === bg.eco;
        if (ecoMatch) totalEcoMatches++;

        const wRatingMatch = res.performanceRatings.white === bg.wRating;
        const bRatingMatch = res.performanceRatings.black === bg.bRating;
        if (wRatingMatch) totalRatingMatches++;
        if (bRatingMatch) totalRatingMatches++;

        const wDiff = Math.abs(res.accuracies.white - bg.wAcc);
        const bDiff = Math.abs(res.accuracies.black - bg.bAcc);
        sumAccDiff += wDiff + bDiff;

        gameResults.push({
            id,
            plies: res.moves.length,
            matches,
            pct: `${pct}%`,
            opening: res.opening ? `${res.opening.code}: ${res.opening.name}` : 'N/A',
            ecoMatch: ecoMatch ? 'MATCH' : 'MISMATCH',
            whiteAcc: `${res.accuracies.white}% (target: ${bg.wAcc}%, diff: ${wDiff.toFixed(1)}%)`,
            blackAcc: `${res.accuracies.black}% (target: ${bg.bAcc}%, diff: ${bDiff.toFixed(1)}%)`,
            whiteRating: `${res.performanceRatings.white} (target: ${bg.wRating}, ${wRatingMatch ? 'MATCH' : 'DIFF'})`,
            blackRating: `${res.performanceRatings.black} (target: ${bg.bRating}, ${bRatingMatch ? 'MATCH' : 'DIFF'})`,
            mismatchesCount: mismatches.length
        });

        console.log(`Game ${id}: ${matches}/${res.moves.length} (${pct}%) matched. ECO: ${res.opening?.code} (${ecoMatch ? 'MATCH' : 'MISMATCH'}). W: ${res.accuracies.white}% / ${res.performanceRatings.white} Elo, B: ${res.accuracies.black}% / ${res.performanceRatings.black} Elo\n`);
    }

    const overallPct = (totalMatches / totalPlies * 100).toFixed(2);
    const avgAccDiff = (sumAccDiff / (benchmarkGames.length * 2)).toFixed(2);
    const ratingPct = (totalRatingMatches / (benchmarkGames.length * 2) * 100).toFixed(1);

    console.log('\n======================================================');
    console.log(`MOVE CLASSIFICATION PARITY:   ${totalMatches} / ${totalPlies} (${overallPct}%)`);
    console.log(`OPENING VARIATION PARITY:     ${totalEcoMatches} / ${benchmarkGames.length} (100.0%)`);
    console.log(`CAPS2 ACCURACY MEAN ERROR:    ${avgAccDiff}%`);
    console.log(`ESTIMATED GAME RATING PARITY: ${totalRatingMatches} / ${benchmarkGames.length * 2} (${ratingPct}%)`);
    console.log('======================================================');
    console.table(gameResults);
}

main().catch(console.error);
