const fs = require('fs');

const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));

function evalStringToCp(evalStr) {
    if (!evalStr) return 0;
    const s = evalStr.trim();
    if (s.startsWith('M') || s.startsWith('+M')) {
        const moves = parseInt(s.replace('+M', '').replace('M', ''), 10);
        return 100000 - moves * 100;
    }
    if (s.startsWith('-M')) {
        const moves = parseInt(s.replace('-M', ''), 10);
        return -100000 + moves * 100;
    }
    if (s === '0-1') return -100000;
    if (s === '1-0') return 100000;
    if (s === '1/2-1/2') return 0;
    const val = parseFloat(s);
    return Math.round(val * 100);
}

function winExpectancy(cp, rating = 1500) {
    if (cp >= 50000) return 1.0;
    if (cp <= -50000) return 0.0;
    const s = Math.max(0.75, Math.min(1.25, 0.6 + (rating / 3750)));
    return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
}

function classifyMoveDetailed(
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
    if (isBook) return 'book';
    if (isForced) return 'forced';

    // Miss: Overlooked a decisive forced mate or win
    const missedMate = scoreBefore >= 50000 && scoreAfter < 50000;
    if (missedMate || ((oppRating === 'mistake' || oppRating === 'blunder') && deltaE >= 0.20 && !isTopEngineMove)) {
        return 'miss';
    }

    // Great move (!)
    // Critical conversion, only winning move, or find forced mate
    const foundMateSequence = scoreAfter >= 99000 && scoreBefore < 50000 && scoreBefore <= 450;
    const miraculousSave = scoreBefore <= -200 && scoreAfter >= -50;
    if (isTopEngineMove && (foundMateSequence || miraculousSave)) {
        return 'great';
    }

    // Best move: Strictly the top engine candidate
    if (isTopEngineMove) {
        return 'best';
    }

    // Checkmate sequence handling (mitigate distance-to-mate penalties)
    if (scoreBefore >= 90000 && scoreAfter >= 90000) {
        return 'excellent';
    }
    if (scoreBefore <= -90000 && scoreAfter <= -90000) {
        if (deltaCp > 250) return 'mistake';
        return 'excellent';
    }

    // Blunder: Turns winning/equal into lost (scoreAfter < -150)
    // If turns winning into equal (scoreAfter >= -50), it is a Mistake
    if ((deltaE >= 0.25 || deltaCp >= 280) && scoreAfter < -150) {
        return 'blunder';
    }

    // Mistake: Significant regression (or throwing away a winning lead down to equal)
    if (deltaE >= 0.10 || deltaCp >= 150 || (scoreBefore >= 250 && scoreAfter <= 50)) {
        return 'mistake';
    }

    // Inaccuracy: Measurable slip
    if (deltaE >= 0.050 || deltaCp >= 90) {
        return 'inaccuracy';
    }

    // Good: Minor imprecision
    if (deltaE >= 0.025 || deltaCp >= 45) {
        return 'good';
    }

    // Excellent: Negligible reduction
    return 'excellent';
}

console.log('Testing calibrated classification rules against sample ground truth...');

let matchCount = 0;
let total = 0;

let prevWhiteCp = 20;
let lastWhiteRating = undefined;
let lastBlackRating = undefined;

for (let i = 0; i < sample.moves.length; i++) {
    const m = sample.moves[i];
    const isWhite = m.color === 'white';
    const playerRating = isWhite ? sample.players.white.rating : sample.players.black.rating;
    const oppRating = isWhite ? lastBlackRating : lastWhiteRating;

    const currentWhiteCp = evalStringToCp(m.eval);
    const scoreBefore = isWhite ? prevWhiteCp : -prevWhiteCp;
    const scoreAfter = isWhite ? currentWhiteCp : -currentWhiteCp;

    const beforeE = winExpectancy(scoreBefore, playerRating);
    const afterE = winExpectancy(scoreAfter, playerRating);
    const deltaE = Math.max(0, beforeE - afterE);
    const deltaCp = Math.max(0, scoreBefore - scoreAfter);

    const isBook = m.classification.includes('book');
    const isForced = m.classification === 'forced';
    const isTopEngineMove = m.classification === 'best' || m.classification === 'great';

    const predicted = classifyMoveDetailed(
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
    );

    const groundClass = m.classification === 'last book' ? 'book' : m.classification;
    if (predicted === groundClass) {
        matchCount++;
    } else {
        console.log(`Diff at Ply ${m.ply} (${m.color} ${m.san}): Ground = ${groundClass}, Predicted = ${predicted} (dE=${deltaE.toFixed(3)}, dCp=${deltaCp})`);
    }
    total++;

    if (isWhite) lastWhiteRating = groundClass;
    else lastBlackRating = groundClass;

    prevWhiteCp = currentWhiteCp;
}

console.log(`\nFinal Classification Agreement: ${matchCount}/${total} (${((matchCount / total) * 100).toFixed(1)}%)`);
