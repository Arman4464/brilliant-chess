const { Evaluator } = require('./engine_evaluator');
const { Chess } = require('chess.js');

(async () => {
    const fens = [
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        'r1bqk1nr/pppp1ppp/2n5/4p3/1bB1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        'r4rk1/pp1q1pp1/2pp1b1p/4p3/3PPP2/1BP1Q2P/PP4P1/2KR2R1 w - - 0 17',
        '4r1k1/pp3p2/2p3p1/3p4/P2P4/q1P5/2B2PPP/4Q1K1 w - - 0 30'
    ];

    for (const d of [10, 12, 14, 16]) {
        const ev = new Evaluator(d, 8, 64);
        // Clear in-memory cache for fair test
        ev.cache = {};
        const t0 = Date.now();
        const results = [];
        for (const fen of fens) {
            results.push(await ev.evalFen(fen));
        }
        const ms = Date.now() - t0;
        console.log(`Depth ${d}: total time = ${ms}ms (${(ms / fens.length).toFixed(1)}ms per pos)`);
        for (let i = 0; i < fens.length; i++) {
            console.log(`  Pos ${i+1}: best=${results[i].bestMove}, score=${results[i].score?.join(' ')}`);
        }
        ev.terminate();
    }
})().catch(console.error);
