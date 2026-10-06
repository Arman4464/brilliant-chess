const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const KOMODO_TEP = require('./explanation-engine.js');

const wasmPath = path.join(__dirname, 'explanation-engine.wasm');
const game = JSON.parse(fs.readFileSync('review_data/LittleNear/review_184653017586.json', 'utf8'));
const allEvals = JSON.parse(fs.readFileSync('.eval_cache/evals_184653017586.json', 'utf8'));

const chess = new Chess();
chess.loadPgn(game.pgn);
const history = chess.history({ verbose: true });

async function runCee(options = {}) {
    return new Promise((resolve) => {
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
                    engine.postMessage('setoption name ClassificationV3 value true');
                    engine.postMessage('setoption name SpeechV3 value true');
                    
                    for (const [k, v] of Object.entries(options)) {
                        engine.postMessage(`setoption name ${k} value ${v}`);
                    }
                    
                    // Feed initial evals
                    for (const ev of allEvals[0] || []) {
                        if (!ev || !ev.pv || ev.pv.length === 0) continue;
                        const pvStr = ev.pv.join(' ');
                        if (ev.mateIn !== null && ev.mateIn !== undefined) {
                            engine.postMessage(`variation ${pvStr} mate ${ev.mateIn} depth ${ev.depth}`);
                        } else if (ev.cp !== null && ev.cp !== undefined) {
                            engine.postMessage(`variation ${pvStr} cp ${Math.round(ev.cp)} depth ${ev.depth}`);
                        }
                    }

                    for (let i = 0; i < history.length; i++) {
                        const m = history[i];
                        const lan = m.from + m.to + (m.promotion || '');
                        const isBook = i < 7; // first 7 plies in book
                        engine.postMessage(`push ${lan}${isBook ? ' isBook' : ''}`);
                        
                        const evalsAfter = allEvals[i + 1] || [];
                        for (const ev of evalsAfter) {
                            if (!ev || !ev.pv || ev.pv.length === 0) continue;
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
                }
            }
        });
    });
}

(async () => {
    console.log('--- Test 1: Default (Elo 2000) ---');
    const res1 = await runCee({});
    console.log('CAPS:', res1.CAPS);

    console.log('\n--- Test 2: Elo 603 / 643 ---');
    const res2 = await runCee({ WhiteElo: 603, BlackElo: 643 });
    console.log('CAPS:', res2.CAPS);

    console.log('\n--- Test 3: EloSensitivePD + Elo 603 / 643 ---');
    const res3 = await runCee({ WhiteElo: 603, BlackElo: 643, EloSensitivePD: true });
    console.log('CAPS:', res3.CAPS);

    console.log('\n--- Test 4: SerializeLikeCEACV3 true ---');
    const res4 = await runCee({ SerializeLikeCEACV3: true });
    console.log('CAPS:', res4.CAPS, 'topKeys:', Object.keys(res4));

    process.exit(0);
})();
