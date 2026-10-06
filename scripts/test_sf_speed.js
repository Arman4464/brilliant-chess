const { spawn } = require('child_process');
const path = require('path');
const { Chess } = require('chess.js');
const fs = require('fs');

const STOCKFISH_EXE = path.join(__dirname, '..', 'stockfish', 'stockfish-windows-x86-64-universal.exe');

class StockfishProcess {
    constructor() {
        this.sf = spawn(STOCKFISH_EXE, [], { windowsHide: true });
        this.buffer = '';
        this.callbacks = [];

        this.sf.stdout.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (this.callbacks.length > 0) {
                    const cb = this.callbacks[0];
                    if (cb(trimmed)) {
                        this.callbacks.shift();
                    }
                }
            }
        });
    }

    send(cmd) {
        this.sf.stdin.write(cmd + '\n');
    }

    async waitReady() {
        return new Promise((resolve) => {
            this.callbacks.push((line) => {
                if (line === 'readyok') {
                    resolve();
                    return true;
                }
                return false;
            });
            this.send('isready');
        });
    }

    async analyzeFen(fen, depth = 18) {
        this.send(`position fen ${fen}`);
        this.send(`go depth ${depth}`);

        return new Promise((resolve) => {
            let lastScore = null;
            let bestMove = null;

            this.callbacks.push((line) => {
                if (line.startsWith('info') && line.includes(' score ')) {
                    const parts = line.split(/\s+/);
                    const sIdx = parts.indexOf('score');
                    if (sIdx !== -1 && sIdx + 2 < parts.length) {
                        lastScore = [parts[sIdx + 1], parts[sIdx + 2]];
                    }
                }
                if (line.startsWith('bestmove')) {
                    const parts = line.split(/\s+/);
                    bestMove = parts[1];
                    resolve({ bestMove, score: lastScore });
                    return true;
                }
                return false;
            });
        });
    }

    terminate() {
        this.send('quit');
        this.sf.kill();
    }
}

async function testOneGame() {
    console.log('Starting Stockfish Process...');
    const sf = new StockfishProcess();
    sf.send('uci');
    sf.send('setoption name Threads value 4');
    sf.send('setoption name Hash value 64');
    await sf.waitReady();
    console.log('Stockfish Ready!');

    // Load sample game
    const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));
    console.log(`Analyzing game ${sample.game.id}, total moves: ${sample.moves.length}`);

    const startTime = Date.now();
    const chess = new Chess();
    let moveIdx = 0;

    // Test first 10 moves
    for (const m of sample.moves.slice(0, 10)) {
        const fenBefore = chess.fen();
        const res = await sf.analyzeFen(fenBefore, 18);
        console.log(`Move ${++moveIdx} (${m.color} ${m.san}): SF best = ${res.bestMove}, score = ${res.score?.join(' ')}`);
        chess.move(m.san);
    }

    const elapsed = Date.now() - startTime;
    console.log(`Analyzed 10 moves in ${(elapsed / 1000).toFixed(2)}s (${(elapsed / 10 / 1000).toFixed(2)}s per move)`);
    sf.terminate();
}

testOneGame().catch(console.error);
