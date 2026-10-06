const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

const UCI_TOKENS = {
    depth: 1, seldepth: 1, time: 1, nodes: 1, multipv: 1, cp: 1, mate: 1,
    currmovenumber: 1, hashfull: 1, nps: 1, tbhits: 1, sbhits: 1, cpuload: 1,
    score: 2, lowerbound: 2, upperbound: 2,
    bestmove: 3, ponder: 3,
    pv: 4, pvSan: 4, string: 4, refutation: 4, currline: 4
};

function parseUciLine(line) {
    const tokens = line.trim().split(/\s+/);
    if (!tokens.length) return null;
    const mtype = tokens[0];
    const res = { mtype };
    let i = mtype === 'info' ? 1 : 0;
    while (i < tokens.length) {
        const tok = tokens[i];
        const type = UCI_TOKENS[tok];
        if (type === 1) {
            i++;
            if (i < tokens.length) res[tok] = Number(tokens[i]);
        } else if (type === 2) {
            res[tok] = true;
        } else if (type === 3) {
            i++;
            if (i < tokens.length) res[tok] = tokens[i];
        } else if (type === 4) {
            res[tok] = [];
            i++;
            while (i < tokens.length && !UCI_TOKENS[tokens[i]]) {
                res[tok].push(tokens[i]);
                i++;
            }
            continue;
        }
        i++;
    }
    return res;
}

async function run() {
    const gameData = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_172014464516.json', 'utf8'));

    const chess = new Chess();
    const gamePlies = [];
    const allFens = [chess.fen()];

    for (let i = 0; i < gameData.moves.length; i++) {
        const m = gameData.moves[i];
        const legalMoves = chess.moves({ verbose: true });
        let matched = null;
        if (m.lan) matched = legalMoves.find(lm => (lm.from + lm.to + (lm.promotion || '')) === m.lan);
        if (!matched && m.fen) {
            const targetBoard = m.fen.split(' ')[0];
            matched = legalMoves.find(lm => {
                const clone = new Chess(chess.fen());
                clone.move(lm);
                return clone.fen().split(' ')[0] === targetBoard;
            });
        }
        if (!matched && m.san) matched = legalMoves.find(lm => lm.san === m.san || lm.san.replace(/[+#x]/g, '') === m.san.replace(/[+#x]/g, ''));
        if (!matched) throw new Error('Cannot match ply ' + (i + 1));

        chess.move(matched);
        const lan = matched.from + matched.to + (matched.promotion || '');
        allFens.push(chess.fen());
        gamePlies.push({
            ply: i + 1,
            san: matched.san,
            lan,
            isBook: m.classification === 'book' || m.classification === 'last book',
            officialClassification: m.classification
        });
    }

    console.log(`Reconstructed ${gamePlies.length} plies.`);

    let allEvals = null;
    const cacheFile = 'sf_pure_mpv2_172014464516.json';
    if (fs.existsSync(cacheFile)) {
        console.log('Loading evals from cache:', cacheFile);
        allEvals = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } else {
        console.log(`Evaluating ${allFens.length} positions with 4 parallel Stockfish workers (MultiPV 2, depth 18)...`);
        const sfPath = path.join(__dirname, 'stockfish', 'stockfish-windows-x86-64-universal.exe');
        const netPath = path.join(__dirname, 'stockfish', 'nn-61e7af4bb97d.nnue').replace(/\\/g, '/');
        
        const numWorkers = 4;
        const workers = [];
        for (let i = 0; i < numWorkers; i++) {
            const proc = spawn(sfPath);
            proc.stdin.write('uci\n');
            proc.stdin.write('setoption name Threads value 2\n');
            proc.stdin.write('setoption name Hash value 64\n');
            proc.stdin.write('setoption name MultiPV value 2\n');
            proc.stdin.write(`setoption name EvalFile value ${netPath}\n`);
            proc.stdin.write('isready\n');
            workers.push({ proc, busy: false });
        }

        await new Promise(r => setTimeout(r, 200));

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
                if (c.isGameOver()) {
                    results[item.idx] = [];
                    completed++;
                    worker.busy = false;
                    if (completed === allFens.length) resolve();
                    else assignNext(worker);
                    return;
                }

                const isWhiteTurn = item.fen.split(' ')[1] === 'w';
                let buffer = '';

                function onData(chunk) {
                    buffer += chunk.toString();
                    if (buffer.includes('bestmove')) {
                        worker.proc.stdout.removeListener('data', onData);
                        const curEval = [];

                        for (const line of buffer.split('\n')) {
                            if (!line.startsWith('info depth')) continue;
                            const parsed = parseUciLine(line);
                            if (!parsed || !parsed.pv || !parsed.multipv) continue;
                            if (parsed.upperbound || parsed.lowerbound) continue;

                            const mateIn = parsed.mate !== undefined ? (isWhiteTurn ? parsed.mate : -parsed.mate) : null;
                            let cp = parsed.cp !== undefined ? (isWhiteTurn ? parsed.cp : -parsed.cp) : null;
                            if (cp !== null && Math.abs(cp) === 9) cp = 0;

                            const slot = parsed.multipv - 1;
                            curEval[slot] = {
                                pv: parsed.pv,
                                cp,
                                mateIn,
                                depth: parsed.depth
                            };
                        }

                        results[item.idx] = curEval.filter(Boolean);
                        completed++;
                        worker.busy = false;

                        if (completed % 15 === 0 || completed === allFens.length) {
                            console.log(`Evaluated ${completed}/${allFens.length}...`);
                        }

                        if (completed === allFens.length) resolve();
                        else assignNext(worker);
                    }
                }

                worker.proc.stdout.on('data', onData);
                worker.proc.stdin.write(`position fen ${item.fen}\n`);
                worker.proc.stdin.write(`go depth 18 movetime 2500\n`);
            }

            workers.forEach(w => assignNext(w));
        });

        workers.forEach(w => w.proc.stdin.write('quit\n'));
        allEvals = results;
        fs.writeFileSync(cacheFile, JSON.stringify(allEvals, null, 2));
    }

    console.log('Stockfish evaluations complete. Running CEE batch classification...');
    const wasmPath = path.join(__dirname, 'explanation-engine.wasm');
    await new Promise((resolve, reject) => {
        const engine = KOMODO_TEP(wasmPath, {
            onKomodoTepInitialized: () => {
                engine.postMessage('uci');
                engine.postMessage('isready');
            },
            onmessage: (msg) => {
                if (typeof msg !== 'string') return;
                if (msg.startsWith('readyok')) {
                    engine.postMessage('setoption name ScoreWhiteToMove value true');
                    engine.postMessage('setoption name SerializeLikeCEAC value true');
                    engine.postMessage('setoption name SerializeBoardEvents value true');
                    engine.postMessage('setoption name ClassificationV3 value true');
                    engine.postMessage('setoption name SpeechV3 value true');
                    engine.postMessage('setoption name CoachAssetsV2 value true');
                    engine.postMessage('setoption name WhiteElo value 1400');
                    engine.postMessage('setoption name BlackElo value 1300');
                    engine.postMessage('setoption name UCI_Variant value chess');
                    engine.postMessage('setoption name UCI_Chess960 value false');
                    engine.postMessage('position fen ' + allFens[0]);

                    for (const ev of allEvals[0] || []) {
                        const pvStr = ev.pv.join(' ');
                        if (ev.mateIn !== null && ev.mateIn !== undefined) {
                            engine.postMessage(`variation ${pvStr} mate ${ev.mateIn} depth ${ev.depth}`);
                        } else if (ev.cp !== null && ev.cp !== undefined) {
                            engine.postMessage(`variation ${pvStr} cp ${Math.round(ev.cp)} depth ${ev.depth}`);
                        }
                    }

                    for (let i = 0; i < gamePlies.length; i++) {
                        const ply = gamePlies[i];
                        engine.postMessage(`push ${ply.lan}${ply.isBook ? ' isBook' : ''}`);
                        const evalsAfter = allEvals[i + 1] || [];
                        for (const ev of evalsAfter) {
                            const pvStr = ev.pv.join(' ');
                            if (ev.mateIn !== null && ev.mateIn !== undefined) {
                                engine.postMessage(`variation ${pvStr} mate ${ev.mateIn} depth ${ev.depth}`);
                            } else if (ev.cp !== null && ev.cp !== undefined) {
                                engine.postMessage(`variation ${pvStr} cp ${Math.round(ev.cp)} depth ${ev.depth}`);
                            }
                        }
                    }

                    engine.postMessage('fetch analysis');
                } else if (msg.startsWith('json')) {
                    const res = JSON.parse(msg.slice(5));
                    let matches = 0;
                    const diffs = [];
                    res.positions.slice(1).forEach((p, idx) => {
                        let pred = p.classificationName;
                        if (gamePlies[idx].isBook) {
                            const nextIsBook = (idx + 1 < gamePlies.length) && gamePlies[idx + 1].isBook;
                            pred = nextIsBook ? 'book' : 'last book';
                        }
                        if (pred === 'greatFind') pred = 'great';
                        const actual = gamePlies[idx].officialClassification;
                        if (pred === actual) {
                            matches++;
                        } else {
                            diffs.push({
                                ply: idx + 1,
                                san: gamePlies[idx].san,
                                pred,
                                actual,
                                diff: p.difference,
                                caps2: p.caps2
                            });
                        }
                    });
                    console.log(`\n========================================`);
                    console.log(`Parity: ${matches} / ${gamePlies.length} (${(matches / gamePlies.length * 100).toFixed(1)}%)`);
                    console.log(`White Accuracy: ${res.CAPS?.white?.all?.toFixed(1)}%`);
                    console.log(`Black Accuracy: ${res.CAPS?.black?.all?.toFixed(1)}%`);
                    console.log(`Diffs count: ${diffs.length}`);
                    console.log(JSON.stringify(diffs.slice(0, 20), null, 2));
                    resolve();
                } else if (msg.includes('CEEError')) {
                    reject(new Error(msg));
                }
            }
        });
    });
}

run().catch(console.error);
