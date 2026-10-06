const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');

async function testParallelSF() {
    const gameData = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_172014464516.json', 'utf8'));
    const chess = new Chess();
    const allFens = [chess.fen()];

    for (let i = 0; i < gameData.moves.length; i++) {
        const m = gameData.moves[i];
        const legal = chess.moves({ verbose: true });
        let matched = legal.find(lm => (lm.from + lm.to + (lm.promotion || '')) === m.lan);
        if (!matched && m.fen) {
            const target = m.fen.split(' ')[0];
            matched = legal.find(lm => {
                const c = new Chess(chess.fen());
                c.move(lm);
                return c.fen().split(' ')[0] === target;
            });
        }
        if (!matched && m.san) matched = legal.find(lm => lm.san === m.san || lm.san.replace(/[+#x]/g, '') === m.san.replace(/[+#x]/g, ''));
        chess.move(matched);
        allFens.push(chess.fen());
    }

    console.log(`Testing Parallel Stockfish Pool across ${allFens.length} positions at depth 16...`);
    const sfPath = path.join(__dirname, 'stockfish', 'stockfish-windows-x86-64-universal.exe');

    // Worker pool of 3 workers
    const NUM_WORKERS = 3;
    const workers = [];

    for (let w = 0; w < NUM_WORKERS; w++) {
        const proc = spawn(sfPath);
        proc.stdin.write('uci\n');
        proc.stdin.write('setoption name Threads value 2\n');
        proc.stdin.write('setoption name Hash value 64\n');
        proc.stdin.write('setoption name Skill Level value 20\n');
        proc.stdin.write('setoption name MultiPV value 2\n');
        proc.stdin.write('isready\n');
        workers.push({ proc, busy: false });
    }

    // Wait for ready
    await new Promise(r => setTimeout(r, 300));

    const t0 = Date.now();
    const queue = allFens.map((fen, idx) => ({ fen, idx }));
    const results = new Array(allFens.length);

    await new Promise((resolve) => {
        let completed = 0;

        function assignNext(worker) {
            if (queue.length === 0) {
                if (completed === allFens.length) resolve();
                return;
            }
            const item = queue.shift();
            worker.busy = true;

            const c = new Chess(item.fen);
            if (c.isCheckmate() || c.isDraw()) {
                results[item.idx] = [];
                completed++;
                worker.busy = false;
                assignNext(worker);
                return;
            }

            let buf = '';
            function onData(d) {
                buf += d.toString();
                if (buf.includes('bestmove')) {
                    worker.proc.stdout.removeListener('data', onData);
                    results[item.idx] = true;
                    completed++;
                    worker.busy = false;
                    if (completed % 20 === 0) {
                        console.log(`Completed ${completed} / ${allFens.length} positions...`);
                    }
                    if (completed === allFens.length) {
                        resolve();
                    } else {
                        assignNext(worker);
                    }
                }
            }

            worker.proc.stdout.on('data', onData);
            worker.proc.stdin.write(`position fen ${item.fen}\n`);
            worker.proc.stdin.write(`go depth 16\n`);
        }

        workers.forEach(w => assignNext(w));
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`Parallel Pool finished all 90 positions at depth 16 in ${elapsed}s!`);
    workers.forEach(w => w.proc.stdin.write('quit\n'));
}

testParallelSF().catch(console.error);
