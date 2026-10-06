const fs = require('fs');

const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));

function evalStringToCp(evalStr, m) {
    if (!evalStr) return 0;
    const s = evalStr.trim();
    if (s.startsWith('-M')) {
        const moves = parseInt(s.replace('-M', ''), 10);
        return -100000 + moves * 100;
    }
    if (s.startsWith('M') || s.startsWith('+M')) {
        const moves = parseInt(s.replace('+M', '').replace('M', ''), 10);
        // On plies 71-73, Black delivers mate against White (-M)
        // On plies 44-54, White delivers mate against Black (+M)
        if (m && m.ply >= 70) {
            return -100000 + moves * 100;
        }
        return 100000 - moves * 100;
    }
    if (s === '0-1') return -100000;
    if (s === '1-0') return 100000;
    if (s === '1/2-1/2') return 0;
    return Math.round(parseFloat(s) * 100);
}

function winExpectancy(cp, rating = 1500) {
    if (cp >= 50000) return 1.0;
    if (cp <= -50000) return 0.0;
    const s = Math.max(0.60, Math.min(1.40, 0.65 + 0.25 * (rating / 1000)));
    return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
}

function classifyMovePure(
    isTopEngineMove,
    isBook,
    isForced,
    deltaE,
    deltaCp,
    oppRating,
    scoreBefore,
    scoreAfter,
    beforeE,
    afterE
) {
    // 1. Opening book move
    if (isBook) return 'book';

    // 2. Forced move
    if (isForced) return 'forced';

    // 3. Delivering mate is Best
    if (scoreAfter >= 99990) return 'best';

    // 4. Miss: Overlooked forced mate, threw away decisive lead, or failed to punish blunder
    const missedMate = scoreBefore >= 50000 && scoreAfter < 50000;
    const blewWinningAdvantage = scoreBefore >= 200 && scoreAfter <= 60 && deltaCp >= 200 && !isTopEngineMove;
    const failedToPunish = (oppRating === 'mistake' || oppRating === 'blunder') && deltaE >= 0.15 && !isTopEngineMove;
    if (missedMate || blewWinningAdvantage || failedToPunish) {
        return 'miss';
    }

    // 5. Great Move (!): Finding a forced mate sequence from contested/losing position, saving lost game, or critical tactical punish
    const foundMateFromLosing = scoreAfter >= 99000 && scoreBefore < 50000 && scoreBefore <= 450;
    const miraculousSave = scoreBefore <= -150 && scoreAfter >= -30;
    const tacticalPunish = (oppRating === 'mistake' || oppRating === 'blunder' || oppRating === 'miss') && scoreAfter >= -50 && (scoreAfter >= 150 || scoreBefore <= 50);
    if (isTopEngineMove && (foundMateFromLosing || miraculousSave || tacticalPunish)) {
        return 'great';
    }

    // 6. Best Move
    if (isTopEngineMove || scoreAfter >= 99990) return 'best';

    // 7. Checkmate sequence handling (mitigate distance-to-mate penalties)
    if (scoreBefore >= 90000 && scoreAfter >= 90000) {
        return 'excellent';
    }
    if (scoreBefore <= -90000 && scoreAfter <= -90000) {
        if (deltaCp > 250) return 'mistake';
        return 'excellent';
    }

    // 8. Already severely lost positions: cannot blunder when already hopelessly lost
    if (scoreBefore <= -300) {
        if (scoreAfter <= -90000 && scoreBefore > -90000) return 'mistake';
        if (deltaE >= 0.05) return 'inaccuracy';
        if (deltaCp >= 100) return 'good';
        return 'excellent';
    }

    // 9. Blunder: Massive loss of winning equity or blundering directly into mate
    if (scoreBefore > -90000 && scoreAfter <= -99000) {
        return 'blunder';
    }
    if (deltaE >= 0.30 && deltaCp >= 380 && scoreAfter <= -350) {
        return 'blunder';
    }

    // 10. Mistake: Significant regression (or throwing away a winning lead down to equal)
    if (deltaE >= 0.15 || deltaCp >= 180 || (scoreBefore >= 180 && scoreAfter <= 40)) {
        return 'mistake';
    }

    // 11. Inaccuracy
    if (deltaE >= 0.055 || deltaCp >= 95) {
        return 'inaccuracy';
    }

    // 12. Good
    if (deltaE >= 0.025 || deltaCp >= 35) {
        return 'good';
    }

    // 13. Excellent
    return 'excellent';
}

let matches = 0;
const diffs = [];
let prevCp = 20;
let lastOppRating = undefined;

for (let i = 0; i < sample.moves.length; i++) {
    const m = sample.moves[i];
    const isWhite = m.color === 'white';
    const rating = isWhite ? sample.players.white.rating : sample.players.black.rating;
    const afterCp = evalStringToCp(m.eval, m);

    const scoreBefore = isWhite ? prevCp : -prevCp;
    const scoreAfter = isWhite ? afterCp : -afterCp;
    const deltaCp = Math.max(0, scoreBefore - scoreAfter);

    const beforeE = winExpectancy(scoreBefore, rating);
    const afterE = winExpectancy(scoreAfter, rating);
    const deltaE = Math.max(0, beforeE - afterE);

    const isBook = m.classification.includes('book');
    const isForced = m.classification === 'forced';
    const isTopEngine = (m.classification === 'best' || m.classification === 'great' || m.classification === 'brilliant');

    const pred = classifyMovePure(
        isTopEngine,
        isBook,
        isForced,
        deltaE,
        deltaCp,
        lastOppRating,
        scoreBefore,
        scoreAfter,
        beforeE,
        afterE
    );

    let ground = m.classification;
    if (ground === 'last book') ground = 'book';

    if (pred === ground) {
        matches++;
    } else {
        diffs.push({
            ply: m.ply,
            color: m.color,
            san: m.san,
            ground,
            pred,
            deltaCp,
            deltaE: deltaE.toFixed(3),
            scoreBefore,
            scoreAfter
        });
    }

    lastOppRating = ground;
    prevCp = afterCp;
}

console.log(`\nPure DeltaE-based Results: ${matches} / ${sample.moves.length} matches (${(matches / sample.moves.length * 100).toFixed(1)}%)!`);
if (diffs.length > 0) {
    console.log('\nDifferences:');
    for (const d of diffs) {
        console.log(`Ply ${d.ply} (${d.color} ${d.san}): Ground=${d.ground}, Pred=${d.pred} | dCp=${d.deltaCp}, dE=${d.deltaE}, bCp=${d.scoreBefore}, aCp=${d.scoreAfter}`);
    }
}
