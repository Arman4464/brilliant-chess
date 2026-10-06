const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'review_data', 'move_by_move_reviews');
const files = [
    'review_114104460147.json',
    'review_165803154362.json',
    'review_171608609212.json',
    'review_171853838612.json',
    'review_172014464516.json',
    'review_184653017586.json'
];

const games = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f))));

console.log('Testing Linear Tallies Model across all 12 players:');

// Grid search for weights: wBest, wExc, wGood, wInacc, wMist, wMiss, wBlund
let bestWeights = null;
let minMae = 999;

for (let wExc = 93; wExc <= 98; wExc += 1) {
    for (let wGood = 80; wGood <= 90; wGood += 1) {
        for (let wInacc = 50; wInacc <= 65; wInacc += 2) {
            for (let wMist = 20; wMist <= 35; wMist += 2) {
                for (let wMiss = 15; wMiss <= 30; wMiss += 2) {
                    for (let wBlund of [0, 5, 10]) {
                        let totalDiff = 0;
                        let count = 0;

                        for (const g of games) {
                            for (const color of ['white', 'black']) {
                                const moves = g.moves.filter(m => m.color === color && m.classification !== 'forced');
                                if (moves.length === 0) continue;

                                let sum = 0;
                                for (const m of moves) {
                                    const c = m.classification;
                                    if (c === 'best' || c === 'book' || c === 'last book' || c === 'great' || c === 'brilliant') sum += 100;
                                    else if (c === 'excellent') sum += wExc;
                                    else if (c === 'good') sum += wGood;
                                    else if (c === 'inaccuracy') sum += wInacc;
                                    else if (c === 'mistake') sum += wMist;
                                    else if (c === 'miss') sum += wMiss;
                                    else if (c === 'blunder') sum += wBlund;
                                    else sum += wGood;
                                }

                                const pred = sum / moves.length;
                                const target = g.players[color].accuracy;
                                totalDiff += Math.abs(pred - target);
                                count++;
                            }
                        }

                        const mae = totalDiff / count;
                        if (mae < minMae) {
                            minMae = mae;
                            bestWeights = { wExc, wGood, wInacc, wMist, wMiss, wBlund, mae };
                        }
                    }
                }
            }
        }
    }
}

console.log('OPTIMAL LINEAR WEIGHTS:');
console.log(bestWeights);
console.log(`PARITY: ${(100 - minMae).toFixed(2)}% (MAE: ${minMae.toFixed(2)}%)`);
