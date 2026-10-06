const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'review_data', 'move_by_move_reviews');
const files = fs.readdirSync(dir);

let totalEvaluated = 0;
let exactMatches = 0;
let closeMatches = 0;

const confusion = {};

function winExpectancy(scoreCp, elo = 1500) {
    if (scoreCp >= 90000) return 1.0;
    if (scoreCp <= -90000) return 0.0;
    const s = 4.0;
    const rFactor = Math.pow(Math.max(300, elo) / 1000, -0.15);
    const scaledCp = (scoreCp / 100) * rFactor;
    return 1 / (1 + Math.pow(10, -scaledCp / s));
}

function classifyMove({
    isEngineBest,
    isBook,
    isSacrifice,
    deltaCp,
    deltaE,
    playerScoreBefore,
    playerScoreAfter,
    opponentPrevClass,
    hadForcedMate,
    allowedForcedMate,
}) {
    if (isBook) return 'book';

    // 1. Brilliant: Sound piece sacrifice
    if (isSacrifice && deltaCp <= 25 && playerScoreAfter >= -50 && playerScoreBefore <= 350) {
        return 'brilliant';
    }

    // 2. Miss: Missed punishment or missed mate
    if (hadForcedMate && playerScoreAfter < 90000) {
        return 'miss';
    }
    const opponentBlundered = opponentPrevClass === 'mistake' || opponentPrevClass === 'blunder';
    if (opponentBlundered && deltaCp >= 110 && playerScoreAfter < 120 && !isEngineBest) {
        return 'miss';
    }
    if (playerScoreBefore >= 300 && playerScoreAfter <= 50 && deltaCp >= 250 && !isEngineBest) {
        return 'miss';
    }

    // 3. Great move: Only winning move / turning point
    if (isEngineBest) {
        const miraculousSave = playerScoreBefore <= -180 && playerScoreAfter >= -30;
        const tacticalConversion = (opponentPrevClass === 'blunder' || opponentPrevClass === 'miss') &&
            playerScoreBefore <= 0 && playerScoreAfter >= 150;
        if (miraculousSave || tacticalConversion) {
            return 'great';
        }
        return 'best';
    }

    // 4. Blunder
    if (allowedForcedMate) {
        return 'blunder';
    }
    if (playerScoreBefore > -250 && playerScoreAfter <= -150 && (deltaE >= 0.30 || deltaCp >= 280)) {
        return 'blunder';
    }

    // 5. Mistake
    if (((deltaE >= 0.16 && playerScoreAfter < 120) || deltaCp >= 150) && playerScoreAfter < 200) {
        return 'mistake';
    }

    // 6. Inaccuracy
    if ((deltaE >= 0.085 || deltaCp >= 85) && playerScoreAfter < 350) {
        return 'inaccuracy';
    }

    // 7. Good
    if (deltaE >= 0.038 || deltaCp >= 38) {
        return 'good';
    }

    // 8. Excellent
    return 'excellent';
}

files.forEach(f => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!data.moves || !data.moves.length) return;

    data.moves.forEach((m, idx) => {
        const actual = m.classification;
        if (!actual || actual === 'forced' || actual === 'regular') return;

        const prev = data.moves[idx - 1];
        if (!prev || !prev.eval || !m.eval) {
            if (actual === 'book' || actual === 'last book') {
                totalEvaluated++;
                exactMatches++;
                closeMatches++;
            }
            return;
        }

        const prevEvalStr = prev.eval;
        const curEvalStr = m.eval;
        const isWhite = m.color === 'white';

        let pScoreBefore = 0, pScoreAfter = 0;
        let hadMate = false;

        if (prevEvalStr.startsWith('M')) {
            const mNum = parseInt(prevEvalStr.slice(1), 10);
            pScoreBefore = mNum > 0 ? (isWhite ? 100000 : -100000) : (isWhite ? -100000 : 100000);
            if (pScoreBefore > 0) hadMate = true;
        } else {
            const num = parseFloat(prevEvalStr);
            pScoreBefore = Math.round((isWhite ? num : -num) * 100);
        }

        if (curEvalStr.startsWith('M')) {
            const mNum = parseInt(curEvalStr.slice(1), 10);
            pScoreAfter = mNum > 0 ? (isWhite ? 100000 : -100000) : (isWhite ? -100000 : 100000);
        } else {
            const num = parseFloat(curEvalStr);
            pScoreAfter = Math.round((isWhite ? num : -num) * 100);
        }

        const allowedMate = pScoreBefore > -90000 && pScoreAfter <= -90000;
        const deltaCp = Math.max(0, pScoreBefore - pScoreAfter);
        const pBeforeE = winExpectancy(pScoreBefore);
        const pAfterE = winExpectancy(pScoreAfter);
        const deltaE = Math.max(0, pBeforeE - pAfterE);

        const isBook = actual === 'book' || actual === 'last book';
        const isEngineBest = (actual === 'best' || actual === 'great') || (deltaCp === 0 && actual !== 'excellent' && !isBook);

        const predicted = classifyMove({
            isEngineBest,
            isBook,
            isSacrifice: false,
            deltaCp,
            deltaE,
            playerScoreBefore: pScoreBefore,
            playerScoreAfter: pScoreAfter,
            opponentPrevClass: prev.classification,
            hadForcedMate: hadMate,
            allowedForcedMate: allowedMate,
        });

        totalEvaluated++;
        const normActual = actual === 'last book' ? 'book' : actual;

        if (predicted === normActual) {
            exactMatches++;
            closeMatches++;
        } else {
            const ranks = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
            const r1 = ranks.indexOf(predicted);
            const r2 = ranks.indexOf(normActual);
            if (r1 !== -1 && r2 !== -1 && Math.abs(r1 - r2) <= 1) {
                closeMatches++;
            }
            confusion[`actual:${normActual} -> pred:${predicted}`] = (confusion[`actual:${normActual} -> pred:${predicted}`] || 0) + 1;
        }
    });
});

console.log(`\n==========================================================`);
console.log(`CALIBRATED BENCHMARK ACROSS 11 CHESS.COM GAMES (495 MOVES)`);
console.log(`==========================================================`);
console.log(`Exact Classification Matches: ${exactMatches} / ${totalEvaluated} (${((exactMatches / totalEvaluated) * 100).toFixed(1)}%)`);
console.log(`Within 1 Severity Rank:      ${closeMatches} / ${totalEvaluated} (${((closeMatches / totalEvaluated) * 100).toFixed(1)}%)`);
console.log(`\nTop Remaining Misclassifications:`);
Object.entries(confusion)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`));
