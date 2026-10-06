const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'review_data', 'move_by_move_reviews');
const files = ['review_114104460147.json', 'review_165803154362.json', 'review_171608609212.json', 'review_171853838612.json', 'review_172014464516.json', 'review_184653017586.json'];

const loadedGames = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f))));

function solveWeights() {
    let bestWeights = null;
    let minMae = 999;

    // Grid search over classification score values
    for (let wExc = 93; wExc <= 97; wExc += 1) {
        for (let wGood = 75; wGood <= 85; wGood += 2) {
            for (let wInacc = 45; wInacc <= 55; wInacc += 2) {
                for (let wMist = 15; wMist <= 25; wMist += 2) {
                    for (let wMiss = 10; wMiss <= 20; wMiss += 2) {
                        for (let p = 0.20; p <= 0.35; p += 0.05) {
                            for (let alpha = 0.50; alpha <= 0.80; alpha += 0.10) {
                                let totalDiff = 0, count = 0;
                                for (const rev of loadedGames) {
                                    function getAcc(m) {
                                        const c = m.classification;
                                        if (c === 'best' || c === 'book' || c === 'last book' || c === 'great' || c === 'brilliant') return 100;
                                        if (c === 'excellent') return wExc;
                                        if (c === 'good') return wGood;
                                        if (c === 'inaccuracy') return wInacc;
                                        if (c === 'mistake') return wMist;
                                        if (c === 'miss') return wMiss;
                                        if (c === 'blunder') return 4.0;
                                        return wGood;
                                    }

                                    function avgArr(arr) {
                                        if (arr.length === 0) return 100;
                                        const arith = arr.reduce((a, b) => a + b, 0) / arr.length;
                                        const sumP = arr.reduce((a, b) => a + Math.pow(Math.max(b, 0.5), p), 0);
                                        const pMean = Math.pow(sumP / arr.length, 1 / p);
                                        return alpha * pMean + (1 - alpha) * arith;
                                    }

                                    const wMoves = rev.moves.filter(m => m.color === 'white' && m.classification !== 'forced').map(getAcc);
                                    const bMoves = rev.moves.filter(m => m.color === 'black' && m.classification !== 'forced').map(getAcc);

                                    const wPred = avgArr(wMoves), bPred = avgArr(bMoves);
                                    totalDiff += Math.abs(wPred - rev.players.white.accuracy) + Math.abs(bPred - rev.players.black.accuracy);
                                    count += 2;
                                }

                                const mae = totalDiff / count;
                                if (mae < minMae) {
                                    minMae = mae;
                                    bestWeights = { wExc, wGood, wInacc, wMist, wMiss, p, alpha, mae };
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    console.log('Best weights found:', bestWeights);
    console.log('Best Parity:', (100 - minMae).toFixed(2) + '%');
}

solveWeights();
