const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

const gameData = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_172014464516.json', 'utf8'));

// Reconstruct game
const chess = new Chess();
const moves = [];
const NUM_MOVES = gameData.moves.length;

for (let i = 0; i < NUM_MOVES; i++) {
    const m = gameData.moves[i];
    const legalMoves = chess.moves({ verbose: true });
    const targetBoard = m.fen.split(' ')[0];
    const matched = legalMoves.find(lm => {
        const clone = new Chess(chess.fen());
        clone.move(lm);
        return clone.fen().split(' ')[0] === targetBoard;
    });
    const beforeFen = chess.fen();
    chess.move(matched);
    const afterFen = chess.fen();
    moves.push({
        ply: i + 1,
        san: matched.san,
        lan: matched.from + matched.to + (matched.promotion || ''),
        beforeFen,
        afterFen,
        officialClassification: m.classification,
        isBook: m.classification === 'book' || m.classification === 'last book'
    });
}

console.log(`Starting analysis of ${NUM_MOVES} moves with Stockfish (MultiPV 2)...`);

const sfPath = path.join(__dirname, 'stockfish', 'stockfish-windows-x86-64-universal.exe');
const sf = spawn(sfPath);

let sfBuffer = '';
let sfResolver = null;

sf.stdout.on('data', d => {
    sfBuffer += d.toString();
    if (sfResolver && sfBuffer.includes('bestmove')) {
        const out = sfBuffer;
        sfBuffer = '';
        const cb = sfResolver;
        sfResolver = null;
        cb(out);
    }
});

function sendSF(cmd) {
    sf.stdin.write(cmd + '\n');
}

function analyzeFen(fen, depth = 14) {
    return new Promise(resolve => {
        sfResolver = resolve;
        sendSF(`position fen ${fen}`);
        sendSF(`go depth ${depth}`);
    });
}

function parseEvals(rawOutput, fen) {
    const isWhiteTurn = fen.split(' ')[1] === 'w';
    const lines = rawOutput.split('\n');
    const pvs = {};
    for (const l of lines) {
        if (!l.startsWith('info depth')) continue;
        const pvIdx = l.indexOf(' pv ');
        if (pvIdx === -1) continue;
        const mpvMatch = l.match(/\bmultipv\s+(\d+)/);
        const depthMatch = l.match(/\bdepth\s+(\d+)/);
        const cpMatch = l.match(/\bscore cp (-?\d+)/);
        const mateMatch = l.match(/\bscore mate (-?\d+)/);
        const mpv = mpvMatch ? parseInt(mpvMatch[1], 10) : 1;
        const depth = depthMatch ? parseInt(depthMatch[1], 10) : 14;
        const pvMoves = l.slice(pvIdx + 4).trim().split(/\s+/);
        let cp = 0;
        let mate = null;
        if (mateMatch) {
            mate = parseInt(mateMatch[1], 10);
            if (!isWhiteTurn) mate = -mate;
        } else if (cpMatch) {
            const rawCp = parseInt(cpMatch[1], 10);
            cp = isWhiteTurn ? rawCp : -rawCp;
        }
        pvs[mpv] = { pv: pvMoves, cp, mate, depth };
    }
    return Object.values(pvs);
}

async function run() {
    sendSF('uci');
    sendSF('setoption name Threads value 4');
    sendSF('setoption name Hash value 128');
    sendSF('setoption name MultiPV value 2');
    sendSF('isready');
    await new Promise(r => setTimeout(r, 200));

    // Collect evals for each position
    const evalsBefore = [];
    const evalsAfter = [];

    for (let i = 0; i < NUM_MOVES; i++) {
        const outBefore = await analyzeFen(moves[i].beforeFen, 14);
        evalsBefore.push(parseEvals(outBefore, moves[i].beforeFen));
        const outAfter = await analyzeFen(moves[i].afterFen, 14);
        evalsAfter.push(parseEvals(outAfter, moves[i].afterFen));
        process.stdout.write(`.` );
    }
    console.log('\nStockfish evaluation done! Starting CEE...');
    sf.kill();

    const engine = KOMODO_TEP(path.join(__dirname, 'explanation-engine.wasm'), {
        onKomodoTepInitialized: () => {
            engine.postMessage('uci');
            engine.postMessage('isready');
        },
        onmessage: (msg) => {
            if (typeof msg !== 'string') return;
            if (msg.startsWith('readyok')) {
                classifyStep(0);
            } else if (msg.startsWith('json')) {
                const res = JSON.parse(msg.slice(5));
                const p = res.positions[1];
                let pred = p.classificationName;
                if (pred === 'greatFind') pred = 'great';
                const actual = moves[curIdx].officialClassification;
                const match = pred === actual ? '✓ MATCH' : '✗ DIFF';
                console.log(`Ply ${moves[curIdx].ply} (${moves[curIdx].san}): actual=${actual.padEnd(10)} cee=${(pred || 'null').padEnd(10)} ${match} (diff: ${p.difference}, caps: ${p.caps2})`);
                if (pred === actual) matchCount++;
                curIdx++;
                if (curIdx < NUM_MOVES) {
                    classifyStep(curIdx);
                } else {
                    console.log(`\n========================================`);
                    console.log(`RESULT: ${matchCount} / ${NUM_MOVES} (${(matchCount / NUM_MOVES * 100).toFixed(1)}%) exact matches!`);
                    process.exit(0);
                }
            }
        }
    });

    let curIdx = 0;
    let matchCount = 0;

    function classifyStep(idx) {
        const m = moves[idx];
        const bEvals = evalsBefore[idx];
        const aEvals = evalsAfter[idx];

        engine.postMessage('setoption name ScoreWhiteToMove value true');
        engine.postMessage('setoption name SerializeLikeCEAC value true');
        engine.postMessage('setoption name WhiteElo value 1400');
        engine.postMessage('setoption name BlackElo value 1300');
        engine.postMessage('position fen ' + m.beforeFen);

        // Before move candidate variations
        for (const ev of bEvals) {
            const pvStr = ev.pv.join(' ');
            if (ev.mate !== null) {
                engine.postMessage(`variation ${pvStr} mate ${ev.mate} depth ${ev.depth}`);
            } else {
                engine.postMessage(`variation ${pvStr} cp ${ev.cp} depth ${ev.depth}`);
            }
        }

        // Push played move
        engine.postMessage(`push ${m.lan}${m.isBook ? ' isBook' : ''}`);

        // After move candidate variation
        for (const ev of aEvals) {
            const pvStr = ev.pv.join(' ');
            if (ev.mate !== null) {
                engine.postMessage(`variation ${pvStr} mate ${ev.mate} depth ${ev.depth}`);
            } else {
                engine.postMessage(`variation ${pvStr} cp ${ev.cp} depth ${ev.depth}`);
            }
        }

        engine.postMessage('fetch analysis');
    }
}

run().catch(console.error);
