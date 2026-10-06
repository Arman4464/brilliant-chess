const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

const gameData = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_172014464516.json', 'utf8'));

// 1. Reconstruct moves from gameData
const chess = new Chess();
const positions = [{ fen: chess.fen() }];
const playedMoves = [];

for (let i = 0; i < gameData.moves.length; i++) {
    const m = gameData.moves[i];
    const legalMoves = chess.moves({ verbose: true });
    const targetBoard = m.fen.split(' ')[0];
    const matched = legalMoves.find(lm => {
        const clone = new Chess(chess.fen());
        clone.move(lm);
        return clone.fen().split(' ')[0] === targetBoard;
    });
    if (!matched) {
        console.error('Failed to match move at index', i);
        process.exit(1);
    }
    const lan = matched.from + matched.to + (matched.promotion || '');
    playedMoves.push({
        lan,
        san: matched.san,
        isBook: m.classification === 'book' || m.classification === 'last book',
        officialClassification: m.classification,
        officialEval: m.eval
    });
    chess.move(matched);
    positions.push({ fen: chess.fen() });
}

console.log('Game moves:', playedMoves.length);
console.log('Analyzing all positions with Stockfish (MultiPV 2)...');

const sfPath = path.join(__dirname, 'stockfish', 'stockfish-windows-x86-64-universal.exe');
const sf = spawn(sfPath);

let sfOutput = '';
let sfResolver = null;

sf.stdout.on('data', (d) => {
    sfOutput += d.toString();
    if (sfResolver && sfOutput.includes('bestmove')) {
        const out = sfOutput;
        sfOutput = '';
        const res = sfResolver;
        sfResolver = null;
        res(out);
    }
});

function sendSF(cmd) {
    sf.stdin.write(cmd + '\n');
}

function analyzePosition(fen, depth = 14) {
    return new Promise((resolve) => {
        sfResolver = resolve;
        sendSF('position fen ' + fen);
        sendSF('go depth ' + depth);
    });
}

function parseSFEvals(out, isWhiteTurn) {
    const lines = out.split('\n');
    const pvs = {};
    for (const l of lines) {
        if (!l.startsWith('info depth')) continue;
        const mpvMatch = l.match(/multipv\s+(\d+)/);
        const depthMatch = l.match(/depth\s+(\d+)/);
        const cpMatch = l.match(/score cp (-?\d+)/);
        const mateMatch = l.match(/score mate (-?\d+)/);
        const pvMatch = l.match(/pv\s+([a-h1-8qrbn\s]+)/);
        
        const mpv = mpvMatch ? parseInt(mpvMatch[1], 10) : 1;
        const d = depthMatch ? parseInt(depthMatch[1], 10) : 0;
        
        if (pvMatch) {
            const rawPv = pvMatch[1].trim().split(/\s+/);
            let cp = 0;
            let mate = null;
            if (mateMatch) {
                mate = parseInt(mateMatch[1], 10);
            } else if (cpMatch) {
                let rawCp = parseInt(cpMatch[1], 10);
                // Stockfish returns score from side-to-move perspective
                // CEE ScoreWhiteToMove requires score from White's perspective!
                cp = isWhiteTurn ? rawCp : -rawCp;
            }
            pvs[mpv] = {
                pv: rawPv,
                cp,
                mate,
                depth: d
            };
        }
    }
    return Object.values(pvs);
}

async function runBenchmark() {
    sendSF('uci');
    sendSF('setoption name Threads value 4');
    sendSF('setoption name Hash value 128');
    sendSF('setoption name MultiPV value 2');
    sendSF('isready');
    await new Promise(r => setTimeout(r, 200));

    const startTime = Date.now();
    const positionEvals = [];

    // Evaluate each position before move i, and after final move
    for (let i = 0; i < positions.length; i++) {
        const fen = positions[i].fen;
        const isWhiteTurn = fen.split(' ')[1] === 'w';
        const out = await analyzePosition(fen, 14);
        const evals = parseSFEvals(out, isWhiteTurn);
        positionEvals.push(evals);
        if (i % 20 === 0) {
            console.log(`Analyzed ${i}/${positions.length} positions...`);
        }
    }

    console.log(`Stockfish analysis complete in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    sf.kill();

    // Now send everything to CEE
    console.log('Sending full game data to CEE (Komodo TEP)...');
    const engine = KOMODO_TEP(path.join(__dirname, 'explanation-engine.wasm'), {
        onKomodoTepInitialized: () => {
            engine.postMessage('uci');
            engine.postMessage('isready');
        },
        onmessage: (msg) => {
            if (typeof msg !== 'string') return;
            if (msg.startsWith('readyok')) {
                console.log('CEE ready! Pushing game data...');
                engine.postMessage('setoption name ScoreWhiteToMove value true');
                engine.postMessage('setoption name SerializeLikeCEAC value true');
                engine.postMessage('setoption name WhiteElo value 1400');
                engine.postMessage('setoption name BlackElo value 1300');
                engine.postMessage('position fen ' + positions[0].fen);

                // Root candidate evals
                for (const ev of positionEvals[0]) {
                    const pvStr = ev.pv.join(' ');
                    if (ev.mate !== null) {
                        engine.postMessage(`variation ${pvStr} mate ${ev.mate} depth ${ev.depth}`);
                    } else {
                        engine.postMessage(`variation ${pvStr} cp ${ev.cp} depth ${ev.depth}`);
                    }
                }

                // Push each move with its candidate evals
                for (let i = 0; i < playedMoves.length; i++) {
                    const pm = playedMoves[i];
                    engine.postMessage(`push ${pm.lan}${pm.isBook ? ' isBook' : ''}`);
                    const evals = positionEvals[i + 1] || [];
                    for (const ev of evals) {
                        const pvStr = ev.pv.join(' ');
                        if (ev.mate !== null) {
                            engine.postMessage(`variation ${pvStr} mate ${ev.mate} depth ${ev.depth}`);
                        } else {
                            engine.postMessage(`variation ${pvStr} cp ${ev.cp} depth ${ev.depth}`);
                        }
                    }
                }

                console.log('Requesting fetch analysis from CEE...');
                engine.postMessage('fetch analysis');
            } else if (msg.startsWith('json')) {
                const res = JSON.parse(msg.slice(5));
                console.log('\n================ CEE RESULTS ================');
                console.log('CEE CAPS Accuracies:');
                console.log('White:', res.CAPS.white.all, '% (Official:', gameData.accuracies.white, '%)');
                console.log('Black:', res.CAPS.black.all, '% (Official:', gameData.accuracies.black, '%)');

                console.log('\nCEE Move Tallies:');
                const tWhite = res.tallies.white;
                const tBlack = res.tallies.black;
                console.log('White CEE:', JSON.stringify({
                    brilliant: tWhite.brilliant,
                    great: tWhite.greatFind,
                    best: tWhite.best,
                    excellent: tWhite.excellent,
                    good: tWhite.good,
                    inaccuracy: tWhite.inaccuracy,
                    mistake: tWhite.mistake,
                    blunder: tWhite.blunder,
                    book: tWhite.book
                }));
                console.log('White Official:', JSON.stringify(Object.fromEntries(
                    Object.entries(gameData.tallies).map(([k, v]) => [k, v.white])
                )));

                console.log('Black CEE:', JSON.stringify({
                    brilliant: tBlack.brilliant,
                    great: tBlack.greatFind,
                    best: tBlack.best,
                    excellent: tBlack.excellent,
                    good: tBlack.good,
                    inaccuracy: tBlack.inaccuracy,
                    mistake: tBlack.mistake,
                    blunder: tBlack.blunder,
                    book: tBlack.book
                }));
                console.log('Black Official:', JSON.stringify(Object.fromEntries(
                    Object.entries(gameData.tallies).map(([k, v]) => [k, v.black])
                )));

                let exact = 0;
                res.positions.slice(1).forEach((p, idx) => {
                    const actual = playedMoves[idx].officialClassification;
                    let pred = p.classificationName;
                    if (pred === 'greatFind') pred = 'great';
                    if (pred === actual) exact++;
                });

                console.log(`\nExact Classification Match: ${exact}/${playedMoves.length} (${(exact / playedMoves.length * 100).toFixed(1)}%)`);
                process.exit(0);
            }
        }
    });
}

runBenchmark().catch(console.error);
