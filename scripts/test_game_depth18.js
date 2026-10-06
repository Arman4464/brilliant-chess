const fs = require('fs');
const path = require('path');
const { Evaluator } = require('./engine_evaluator');
const { Chess } = require('chess.js');

async function testDepth18() {
    const gameFile = path.join(__dirname, '..', 'review_data', 'LittleNear', 'review_184653017586.json');
    const gameData = JSON.parse(fs.readFileSync(gameFile, 'utf8'));

    console.log('Evaluating game 184653017586 at Depth 18 with Stockfish 19 NNUE (8 threads)...');
    console.log('Target White Accuracy:', gameData.players.white.accuracy, '(Shani-mate, 603)');
    console.log('Target Black Accuracy:', gameData.players.black.accuracy, '(LittleNear, 643)');

    const ev = new Evaluator(18, 8, 128);
    // Use fresh cache for this test
    ev.cache = {};

    const t0 = Date.now();
    const moveResults = await ev.evaluateGame(gameData);
    const elapsed = Date.now() - t0;
    ev.terminate();

    console.log(`Finished evaluation in ${(elapsed / 1000).toFixed(1)}s!`);

    // Now compute CAPS2 accuracy on the depth-18 evaluations
    const wRating = gameData.players.white.rating || 603;
    const bRating = gameData.players.black.rating || 643;

    function normalizeCp(score) {
        if (score >= 50000) {
            const moves = Math.max(1, Math.round((100000 - score) / 100));
            return 2000 + Math.max(0, 500 - moves * 20);
        }
        if (score <= -50000) {
            const moves = Math.max(1, Math.round((100000 - Math.abs(score)) / 100));
            return -2000 - Math.max(0, 500 - moves * 20);
        }
        return score;
    }

    function winExpectancy(cp, rating) {
        if (cp >= 50000) return 1.0;
        if (cp <= -50000) return 0.0;
        const s = Math.max(0.60, Math.min(1.40, 0.65 + 0.25 * (rating / 1000)));
        return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
    }

    const wAccs = [];
    const bAccs = [];

    for (let i = 0; i < moveResults.length; i++) {
        const m = moveResults[i];
        if (m.isForced) continue;

        const isW = m.color === 'white';
        const rating = isW ? wRating : bRating;

        if (i < 4 || m.isBest) {
            (isW ? wAccs : bAccs).push(100);
            continue;
        }

        if (m.scoreBefore >= 99000 && m.scoreAfter < 99000) {
            (isW ? wAccs : bAccs).push(18.0);
            continue;
        }
        if (m.scoreBefore > -90000 && m.scoreAfter <= -99000) {
            (isW ? wAccs : bAccs).push(5.0);
            continue;
        }

        const normBefore = normalizeCp(m.scoreBefore);
        const normAfter = normalizeCp(m.scoreAfter);
        const dCp = Math.max(0, normBefore - normAfter);

        if (dCp <= 10) {
            (isW ? wAccs : bAccs).push(100);
            continue;
        }

        const beforeE = winExpectancy(m.scoreBefore, rating);
        const afterE = winExpectancy(m.scoreAfter, rating);
        const dE = Math.max(0, beforeE - afterE);

        const winDiscount = normAfter > 200 ? Math.max(0.20, 1.0 - (normAfter - 200) / 1000) : 1.0;
        const lossDiscount = normBefore < -200 ? Math.max(0.40, 1.0 - Math.abs(normBefore + 200) / 1500) : 1.0;

        const effectiveCpLoss = (Math.max(0, dCp - 10) / 100) * 4.5 * winDiscount * lossDiscount;
        const effectiveWinLoss = (dE * 100) * 1.0;
        const totalLoss = effectiveWinLoss + effectiveCpLoss;

        const rFactor = Math.pow(rating / 1000, -0.2);
        const k = 0.055;
        const raw = 103.1668 * Math.exp(-k * totalLoss * rFactor) - 3.1668;
        const acc = Math.max(0, Math.min(100, raw));
        (isW ? wAccs : bAccs).push(acc);
    }

    function avg(arr) {
        if (arr.length === 0) return 100;
        const arith = arr.reduce((a, b) => a + b, 0) / arr.length;
        const sumP = arr.reduce((a, b) => a + Math.pow(Math.max(b, 0.5), 0.20), 0);
        const pMean = Math.pow(sumP / arr.length, 1 / 0.20);
        return 0.80 * pMean + 0.20 * arith;
    }

    const wPred = avg(wAccs);
    const bPred = avg(bAccs);

    console.log('\n--- DEPTH 18 RESULT ---');
    console.log(`White Accuracy: Predicted ${wPred.toFixed(1)}% vs Target ${gameData.players.white.accuracy}% (Diff: ${(wPred - gameData.players.white.accuracy).toFixed(1)}%)`);
    console.log(`Black Accuracy: Predicted ${bPred.toFixed(1)}% vs Target ${gameData.players.black.accuracy}% (Diff: ${(bPred - gameData.players.black.accuracy).toFixed(1)}%)`);
}

testDepth18().catch(console.error);
