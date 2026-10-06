const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

async function main() {
    const gameData = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_171853838612.json', 'utf8'));
    const chess = new Chess();
    const allFens = [chess.fen()];
    const gamePlies = [];

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
        chess.move(matched);
        allFens.push(chess.fen());
        gamePlies.push({
            ply: i + 1,
            san: matched.san,
            lan: matched.from + matched.to + (matched.promotion || ''),
            isBook: m.classification === 'book' || m.classification === 'last book',
            official: m.classification
        });
    }

    console.log(`Reconstructed ${gamePlies.length} plies.`);

    const sfPath = path.join(__dirname, 'stockfish', 'stockfish-windows-x86-64-universal.exe');
    const sf = spawn(sfPath);
    sf.stdin.write('uci\n');
    sf.stdin.write('setoption name Threads value 4\n');
    sf.stdin.write('setoption name Hash value 128\n');
    sf.stdin.write('setoption name MultiPV value 2\n');
    sf.stdin.write('isready\n');

    let curIdx = 0;
    let buffer = '';
    const allEvals = [];

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
            sf.stdin.write(`go depth 12\n`);
        }

        sf.stdout.on('data', d => {
            buffer += d.toString();
            if (buffer.includes('bestmove')) {
                const fen = allFens[curIdx];
                const isWhiteTurn = fen.split(' ')[1] === 'w';
                const pvs = {};
                for (const l of buffer.split('\n')) {
                    if (!l.startsWith('info depth')) continue;
                    const pvIdx = l.indexOf(' pv ');
                    if (pvIdx === -1) continue;
                    const mpvMatch = l.match(/\bmultipv\s+(\d+)/);
                    const depthMatch = l.match(/\bdepth\s+(\d+)/);
                    const cpMatch = l.match(/\bscore cp (-?\d+)/);
                    const mateMatch = l.match(/\bscore mate (-?\d+)/);
                    const mpv = mpvMatch ? parseInt(mpvMatch[1], 10) : 1;
                    const d = depthMatch ? parseInt(depthMatch[1], 10) : 12;
                    const pvMoves = l.slice(pvIdx + 4).trim().split(/\s+/);
                    let cp = 0, mate = null;
                    if (mateMatch) {
                        mate = parseInt(mateMatch[1], 10);
                        if (!isWhiteTurn) mate = -mate;
                    } else if (cpMatch) {
                        const rawCp = parseInt(cpMatch[1], 10);
                        cp = isWhiteTurn ? rawCp : -rawCp;
                    }
                    pvs[mpv] = { pv: pvMoves, cp, mate, depth: d };
                }
                allEvals.push(Object.values(pvs));
                curIdx++;
                sendNext();
            }
        });

        setTimeout(sendNext, 200);
    });

    console.log(`Evaluated ${allEvals.length} positions with Stockfish. Sending to CEE...`);

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
                    engine.postMessage('setoption name WhiteElo value 612');
                    engine.postMessage('setoption name BlackElo value 616');
                    engine.postMessage('setoption name UCI_Variant value chess');
                    engine.postMessage('setoption name UCI_Chess960 value false');
                    engine.postMessage('position fen ' + allFens[0]);

                    for (const ev of allEvals[0] || []) {
                        if (!ev.pv || ev.pv.length === 0) continue;
                        engine.postMessage(`variation ${ev.pv.join(' ')} cp ${ev.cp} depth ${ev.depth}`);
                    }

                    for (let i = 0; i < gamePlies.length; i++) {
                        const ply = gamePlies[i];
                        engine.postMessage(`push ${ply.lan}${ply.isBook ? ' isBook' : ''}`);
                        const evalsAfter = allEvals[i + 1] || [];
                        for (const ev of evalsAfter) {
                            if (!ev.pv || ev.pv.length === 0) continue;
                            if (ev.mate !== null) {
                                engine.postMessage(`variation ${ev.pv.join(' ')} mate ${ev.mate} depth ${ev.depth}`);
                            } else {
                                engine.postMessage(`variation ${ev.pv.join(' ')} cp ${ev.cp} depth ${ev.depth}`);
                            }
                        }
                    }

                    engine.postMessage('fetch analysis');
                } else if (msg.startsWith('json')) {
                    const res = JSON.parse(msg.slice(5));
                    console.log('SUCCESS! CEE PROCESSED GAME 171853838612!');
                    console.log('CAPS:', res.CAPS);
                    console.log('White Tallies:', JSON.stringify(res.tallies.white));
                    console.log('Black Tallies:', JSON.stringify(res.tallies.black));

                    let matches = 0;
                    res.positions.slice(1).forEach((p, idx) => {
                        let pred = p.classificationName;
                        if (pred === 'greatFind') pred = 'great';
                        if (pred === gamePlies[idx].official) matches++;
                    });
                    console.log(`Parity: ${matches} / ${gamePlies.length} (${(matches / gamePlies.length * 100).toFixed(1)}%)`);
                    resolve();
                } else if (msg.includes('CEEError')) {
                    reject(new Error(msg));
                }
            }
        });
    });
}

main().catch(console.error);
