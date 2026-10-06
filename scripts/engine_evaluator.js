const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const fs = require('fs');
const { Chess } = require('chess.js');

const STOCKFISH_EXE = path.join(__dirname, '..', 'stockfish', 'stockfish-windows-x86-64-universal.exe');
const CACHE_FILE = path.join(__dirname, 'cache', 'eval_cache.json');

class Evaluator {
    constructor(depth = 16, threads = 8, hash = 128) {
        this.depth = depth;
        this.threads = threads;
        this.hash = hash;
        this.cache = {};
        this.cacheDirty = false;
        this.loadCache();
        this.sf = null;
        this.callbacks = [];
    }

    loadCache() {
        if (fs.existsSync(CACHE_FILE)) {
            try {
                this.cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
                console.log(`[Cache] Loaded ${Object.keys(this.cache).length} cached positions.`);
            } catch (e) {
                console.warn('[Cache] Could not parse cache file, starting empty.');
                this.cache = {};
            }
        }
    }

    saveCache() {
        if (this.cacheDirty) {
            fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache));
            this.cacheDirty = false;
        }
    }

    async initEngine() {
        this.sf = spawn(STOCKFISH_EXE, [], { windowsHide: true });
        const rl = readline.createInterface({ input: this.sf.stdout });
        rl.on('line', (line) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            if (this.callbacks.length > 0) {
                const cb = this.callbacks[0];
                if (cb(trimmed)) {
                    this.callbacks.shift();
                }
            }
        });

        this.send('uci');
        this.send(`setoption name Threads value ${this.threads}`);
        this.send(`setoption name Hash value ${this.hash}`);
        await this.waitReady();
        console.log(`[Engine] Stockfish ready with ${this.threads} threads, ${this.hash}MB hash, depth ${this.depth}.`);
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

    // Evaluate single FEN
    async evalFen(fen) {
        // Normalize FEN to board + turn + castling + ep (drop 50-move counter & fullmove number for cache hit)
        const parts = fen.split(' ');
        const normalizedFen = parts.slice(0, 4).join(' ');

        if (this.cache[normalizedFen]) {
            return this.cache[normalizedFen];
        }

        if (!this.sf) {
            await this.initEngine();
        }

        this.send(`position fen ${fen}`);
        this.send(`go depth ${this.depth}`);

        return new Promise((resolve) => {
            let lastScore = null;
            let bestMove = null;

            this.callbacks.push((line) => {
                if (line.startsWith('info') && line.includes(' score ')) {
                    const tokens = line.split(/\s+/);
                    const sIdx = tokens.indexOf('score');
                    if (sIdx !== -1 && sIdx + 2 < tokens.length) {
                        lastScore = [tokens[sIdx + 1], tokens[sIdx + 2]];
                    }
                }
                if (line.startsWith('bestmove')) {
                    const tokens = line.split(/\s+/);
                    bestMove = tokens[1];
                    const result = { bestMove, score: lastScore };
                    this.cache[normalizedFen] = result;
                    this.cacheDirty = true;
                    resolve(result);
                    return true;
                }
                return false;
            });
        });
    }

    // Convert UCI string (e.g. 'e2e4') to SAN in a given position
    uciToSan(chess, uciMove) {
        if (!uciMove || uciMove === '(none)') return '';
        try {
            const from = uciMove.slice(0, 2);
            const to = uciMove.slice(2, 4);
            const promotion = uciMove.length > 4 ? uciMove[4] : undefined;
            const m = chess.move({ from, to, promotion });
            if (m) {
                chess.undo();
                return m.san;
            }
        } catch (e) {}
        return '';
    }

    // Score tokens to numeric centipawns (from side-to-move perspective)
    scoreToCp(scoreTokens) {
        if (!scoreTokens || scoreTokens.length < 2) return 0;
        const type = scoreTokens[0];
        const val = parseInt(scoreTokens[1], 10);
        if (isNaN(val)) return 0;
        if (type === 'cp') return val;
        if (type === 'mate') {
            if (val > 0) return 100000 - val * 100;
            if (val < 0) return -100000 - val * 100;
            return 100000;
        }
        return 0;
    }

    // Evaluate an entire game move by move
    async evaluateGame(gameData) {
        const chess = new Chess();
        if (gameData.pgn) {
            chess.loadPgn(gameData.pgn);
        } else if (gameData.moves) {
            for (const m of gameData.moves) chess.move(m.san);
        }
        const history = chess.history({ verbose: true });
        const replay = new Chess();

        const moveResults = [];
        let prevEval = await this.evalFen(replay.fen());
        let prevBestSan = this.uciToSan(replay, prevEval.bestMove);
        let prevScoreCp = this.scoreToCp(prevEval.score);

        for (let i = 0; i < history.length; i++) {
            const move = history[i];
            const isWhite = move.color === 'w';
            const legalMovesCount = replay.moves().length;
            const isForced = legalMovesCount === 1;
            const isBest = prevBestSan === move.san;

            // Make move
            replay.move(move.san);

            let nextScoreCp;
            let nextBestSan = '';
            let nextEval = null;

            if (replay.isCheckmate()) {
                nextScoreCp = -100000; // Opponent is checkmated, so opponent's score is -100000
            } else if (replay.isDraw()) {
                nextScoreCp = 0;
            } else {
                nextEval = await this.evalFen(replay.fen());
                nextScoreCp = this.scoreToCp(nextEval.score);
                nextBestSan = this.uciToSan(replay, nextEval.bestMove);
            }

            // Player score before (from player perspective): prevScoreCp
            // Player score after: -nextScoreCp (since nextScoreCp is from opponent perspective)
            const scoreBefore = prevScoreCp;
            const scoreAfter = -nextScoreCp;
            const deltaCp = Math.max(0, scoreBefore - scoreAfter);

            moveResults.push({
                ply: i + 1,
                color: isWhite ? 'white' : 'black',
                san: move.san,
                isBest,
                isForced,
                scoreBefore,
                scoreAfter,
                deltaCp,
                bestMoveSan: prevBestSan
            });

            prevScoreCp = nextScoreCp;
            prevBestSan = nextBestSan;

            if ((i + 1) % 25 === 0) {
                this.saveCache();
            }
        }

        this.saveCache();
        return moveResults;
    }

    terminate() {
        if (this.sf) {
            this.saveCache();
            this.send('quit');
            this.sf.kill();
            this.sf = null;
        }
    }
}

module.exports = { Evaluator };

if (require.main === module) {
    (async () => {
        const ev = new Evaluator(15, 8, 128);
        const chess = new Chess();
        console.log('Testing initial position eval...');
        const res = await ev.evalFen(chess.fen());
        console.log('Initial position eval:', res);
        console.log('San of best move:', ev.uciToSan(chess, res.bestMove));
        ev.terminate();
    })().catch(console.error);
}
