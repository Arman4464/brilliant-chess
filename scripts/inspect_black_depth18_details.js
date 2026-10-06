const fs = require('fs');
const path = require('path');
const officialReview = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));

// Run our test with move logging
const { Evaluator } = require('./engine_evaluator');
const ev = new Evaluator(18, 8, 128);

(async () => {
    const moveResults = await ev.evaluateGame(officialReview);
    ev.terminate();

    const wRating = 603;
    const bRating = 643;

    function normalizeCp(score) {
        if (score >= 50000) return 2000;
        if (score <= -50000) return -2000;
        return score;
    }
    function winExpectancy(cp, rating) {
        if (cp >= 50000) return 1.0;
        if (cp <= -50000) return 0.0;
        const s = Math.max(0.60, Math.min(1.40, 0.65 + 0.25 * (rating / 1000)));
        return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
    }

    console.log('--- DETAILED BLACK PLIES AT DEPTH 18 ---');
    const bAccs = [];
    for (let i = 0; i < moveResults.length; i++) {
        const m = moveResults[i];
        if (m.color !== 'black') continue;
        if (m.isForced) {
            console.log(`Ply ${m.ply} (${m.san}): FORCED (skipped)`);
            continue;
        }

        let acc;
        if (i < 4 || m.isBest) {
            acc = 100;
        } else if (m.scoreBefore >= 99000 && m.scoreAfter < 99000) {
            acc = 18.0;
        } else if (m.scoreBefore > -90000 && m.scoreAfter <= -99000) {
            acc = 5.0;
        } else {
            const normBefore = normalizeCp(m.scoreBefore);
            const normAfter = normalizeCp(m.scoreAfter);
            const dCp = Math.max(0, normBefore - normAfter);
            if (dCp <= 10) {
                acc = 100;
            } else {
                const beforeE = winExpectancy(m.scoreBefore, bRating);
                const afterE = winExpectancy(m.scoreAfter, bRating);
                const dE = Math.max(0, beforeE - afterE);
                const winDiscount = normAfter > 200 ? Math.max(0.20, 1.0 - (normAfter - 200) / 1000) : 1.0;
                const lossDiscount = normBefore < -200 ? Math.max(0.40, 1.0 - Math.abs(normBefore + 200) / 1500) : 1.0;
                const effectiveCpLoss = (Math.max(0, dCp - 10) / 100) * 4.5 * winDiscount * lossDiscount;
                const effectiveWinLoss = (dE * 100) * 1.0;
                const totalLoss = effectiveWinLoss + effectiveCpLoss;
                const rFactor = Math.pow(bRating / 1000, -0.2);
                acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.055 * totalLoss * rFactor) - 3.1668));
            }
        }
        bAccs.push(acc);
        console.log(`Ply ${m.ply} (${m.san}): isBest=${m.isBest}, scoreBefore=${m.scoreBefore}, scoreAfter=${m.scoreAfter}, Acc=${acc.toFixed(1)}%`);
    }

    const p = 0.20;
    const arith = bAccs.reduce((a, b) => a + b, 0) / bAccs.length;
    const sumP = bAccs.reduce((a, b) => a + Math.pow(Math.max(b, 0.5), p), 0);
    const pMean = Math.pow(sumP / bAccs.length, 1 / p);
    const finalPred = 0.80 * pMean + 0.20 * arith;
    console.log(`\nFinal Black Predicted: ${finalPred.toFixed(1)}% vs Target: 73.4%`);
})();
