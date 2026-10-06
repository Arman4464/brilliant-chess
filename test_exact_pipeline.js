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

async function runExactPipeline(gameId = '172014464516', depth = 12) {
    const gameData = JSON.parse(fs.readFileSync(`review_data/move_by_move_reviews/review_${gameId}.json`, 'utf8'));
    const chess = new Chess();
    const playedMoves = [];
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
        const lan = matched.from + matched.to + (matched.promotion || '');
        chess.move(matched);
        allFens.push(chess.fen());
        playedMoves.push({
            moveLan: lan,
            san: matched.san,
            isBook: m.classification === 'book' || m.classification === 'last book',
            official: m.classification
        });
    }

    console.log(`Analyzing game ${gameId} (${playedMoves.length} plies, depth ${depth})...`);

    const sfPath = path.join(__dirname, 'stockfish', 'stockfish-windows-x86-64-universal.exe');
    const sf = spawn(sfPath);
    sf.stdin.write('uci\n');
    sf.stdin.write('setoption name Threads value 6\n');
    sf.stdin.write('setoption name Hash value 128\n');
    sf.stdin.write('setoption name Skill Level value 20\n');
    sf.stdin.write('setoption name MultiPV value 2\n');
    sf.stdin.write('isready\n');

    let curIdx = 0;
    let buffer = '';
    const allEvals = [];

    const tSf = Date.now();
    await new Promise((resolve) => {
        function sendNext() {
            if (curIdx >= allFens.length) {
                sf.stdin.write('quit\n');
                resolve();
                return;
            }
            const fen = allFens[curIdx];
            const c = new Chess(fen);
            if (c.isCheckmate() || c.isDraw()) {
                allEvals.push([]);
                curIdx++;
                sendNext();
                return;
            }
            buffer = '';
            sf.stdin.write(`position fen ${fen}\n`);
            sf.stdin.write(`go depth ${depth}\n`);
        }

        sf.stdout.on('data', d => {
            buffer += d.toString();
            if (buffer.includes('bestmove')) {
                const fen = allFens[curIdx];
                const isWhiteTurn = fen.split(' ')[1] === 'w';
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

                allEvals.push(curEval.filter(Boolean));
                curIdx++;
                sendNext();
            }
        });

        setTimeout(sendNext, 200);
    });

    const sfTime = ((Date.now() - tSf) / 1000).toFixed(2);
    console.log(`Stockfish finished in ${sfTime}s`);

    // Run CEE
    const tCee = Date.now();
    const whiteElo = gameData.players?.white?.rating || 1400;
    const blackElo = gameData.players?.black?.rating || 1300;

    const ceeRes = await new Promise((resolve, reject) => {
        const engine = KOMODO_TEP(path.join(__dirname, 'explanation-engine.wasm'), {
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
                    engine.postMessage(`setoption name WhiteElo value ${whiteElo}`);
                    engine.postMessage(`setoption name BlackElo value ${blackElo}`);
                    engine.postMessage('setoption name UCI_Variant value chess');
                    engine.postMessage('setoption name UCI_Chess960 value false');
                    engine.postMessage('position fen ' + allFens[0]);

                    for (const ev of allEvals[0] || []) {
                        if (!ev || !ev.pv || !ev.pv.length) continue;
                        const pvStr = ev.pv.join(' ');
                        if (ev.mateIn !== null && ev.mateIn !== undefined) {
                            engine.postMessage(`variation ${pvStr} mate ${ev.mateIn} depth ${ev.depth}`);
                        } else if (ev.cp !== null && ev.cp !== undefined) {
                            engine.postMessage(`variation ${pvStr} cp ${Math.round(ev.cp)} depth ${ev.depth}`);
                        }
                    }

                    for (let i = 0; i < playedMoves.length; i++) {
                        const pm = playedMoves[i];
                        engine.postMessage(`push ${pm.moveLan}${pm.isBook ? ' isBook' : ''}`);
                        const afterEvals = allEvals[i + 1] || [];
                        for (const ev of afterEvals) {
                            if (!ev || !ev.pv || !ev.pv.length) continue;
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
                    resolve(JSON.parse(msg.slice(5)));
                } else if (msg.includes('CEEError')) {
                    reject(new Error(msg));
                }
            }
        });
    });

    const ceeTime = ((Date.now() - tCee) / 1000).toFixed(2);
    console.log(`CEE finished in ${ceeTime}s`);

    let matches = 0;
    const diffs = [];
    ceeRes.positions.slice(1).forEach((p, idx) => {
        let pred = p.classificationName;
        if (pred === 'greatFind') pred = 'great';
        const off = playedMoves[idx].official;
        if (pred === off) {
            matches++;
        } else {
            diffs.push({
                ply: idx + 1,
                san: playedMoves[idx].san,
                calc: pred,
                official: off,
                diff: p.difference,
                caps2: p.caps2?.toFixed(1)
            });
        }
    });

    console.log(`\n================ RESULTS FOR GAME ${gameId} ================`);
    console.log(`White CAPS: ${ceeRes.CAPS?.white?.all?.toFixed(1)}% (Official: ${gameData.accuracies.white}%)`);
    console.log(`Black CAPS: ${ceeRes.CAPS?.black?.all?.toFixed(1)}% (Official: ${gameData.accuracies.black}%)`);
    console.log(`Exact Classification Match: ${matches} / ${playedMoves.length} (${(matches / playedMoves.length * 100).toFixed(1)}%)`);
    console.log('Tallies (Calculated vs Official):');
    console.log('White Calc:', JSON.stringify(ceeRes.tallies.white));
    console.log('White Off :', JSON.stringify(Object.fromEntries(Object.entries(gameData.tallies).map(([k,v]) => [k, v.white]))));
    console.log('Black Calc:', JSON.stringify(ceeRes.tallies.black));
    console.log('Black Off :', JSON.stringify(Object.fromEntries(Object.entries(gameData.tallies).map(([k,v]) => [k, v.black]))));
    if (diffs.length > 0) {
        console.log('\nDiffs:');
        console.table(diffs);
    }
}

runExactPipeline('172014464516', 16).catch(console.error);
