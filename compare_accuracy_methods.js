const fs = require('fs');
const { ChessReviewEngine } = require('./review_pipeline.js');
const accuracyModel = JSON.parse(fs.readFileSync('caps2_accuracy_model.json', 'utf8'));

const games = [
    { id: '184653017586', wAcc: 60.3, bAcc: 70.0, path: 'review_data/move_by_move_reviews/review_184653017586.json' },
    { id: '171608609212', wAcc: 74.7, bAcc: 86.3, path: 'review_data/move_by_move_reviews/review_171608609212.json' },
    { id: '114104460147', wAcc: 70.5, bAcc: 74.5, path: 'review_data/move_by_move_reviews/review_114104460147.json' },
    { id: '172014464516', wAcc: 87.1, bAcc: 81.7, path: 'review_data/move_by_move_reviews/review_172014464516.json' },
    { id: '171853838612', wAcc: 83.9, bAcc: 76.5, path: 'review_data/move_by_move_reviews/review_171853838612.json' },
    { id: '165803154362', wAcc: 66.2, bAcc: 75.3, path: 'review_data/move_by_move_reviews/review_165803154362.json' },
    { id: '184348301442', wAcc: 63.0, bAcc: 75.3, path: 'review_data/Spy-deer-man/review_184348301442.json' }
];

(async () => {
    const engine = new ChessReviewEngine();
    let errRaw = 0;
    let errWeighted = 0;

    for (const g of games) {
        const data = JSON.parse(fs.readFileSync(g.path, 'utf8'));
        const res = await engine.analyzeGame({
            pgn: data.pgn,
            moves: data.moves,
            whiteElo: data.players?.white?.rating || 1500,
            blackElo: data.players?.black?.rating || 1500,
            depth: 18,
            multiPv: 2
        });

        const wRaw = res.accuracies.white;
        const bRaw = res.accuracies.black;

        function calcWeighted(color) {
            const pm = res.moves.filter(m => m.color === color && m.classification !== 'book' && m.classification !== 'forced');
            if (pm.length === 0) return 100;
            let sum = 0;
            for (const m of pm) {
                let cls = m.classification.toLowerCase().replace(' ', '_');
                if (cls === 'great') cls = 'great_find';
                const w = accuracyModel.weights[cls] !== undefined ? accuracyModel.weights[cls] : 100;
                sum += w;
            }
            return Number(Math.max(0, Math.min(100, sum / pm.length)).toFixed(1));
        }
        const wWeighted = calcWeighted('white');
        const bWeighted = calcWeighted('black');

        const dRawW = Math.abs(wRaw - g.wAcc);
        const dRawB = Math.abs(bRaw - g.bAcc);
        errRaw += dRawW + dRawB;

        const dWeiW = Math.abs(wWeighted - g.wAcc);
        const dWeiB = Math.abs(bWeighted - g.bAcc);
        errWeighted += dWeiW + dWeiB;

        console.log('Game ' + g.id + ':');
        console.log('  Raw Mean: W=' + wRaw + '% (diff ' + dRawW.toFixed(1) + '%), B=' + bRaw + '% (diff ' + dRawB.toFixed(1) + '%)');
        console.log('  Weighted: W=' + wWeighted + '% (diff ' + dWeiW.toFixed(1) + '%), B=' + bWeighted + '% (diff ' + dWeiB.toFixed(1) + '%)');
    }

    console.log('Total Mean Error Raw: ' + (errRaw / 14).toFixed(2) + '%');
    console.log('Total Mean Error Weighted: ' + (errWeighted / 14).toFixed(2) + '%');
})();
