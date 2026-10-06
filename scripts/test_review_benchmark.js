const { spawn } = require('child_process');
const path = require('path');
const { Chess } = require('chess.js');
const fs = require('fs');

const STOCKFISH_EXE = path.join(__dirname, '..', 'stockfish', 'stockfish-windows-x86-64-universal.exe');

// Chess.com Expected Points Model
function winExpectancy(cp, rating = 1500) {
    if (cp >= 50000) return 1.0;
    if (cp <= -50000) return 0.0;
    const s = Math.max(0.75, Math.min(1.25, 0.6 + (rating / 3750)));
    return 1.0 / (1.0 + Math.pow(10, -cp / (400 * s)));
}

// CAPS2 Move Accuracy Curve
function caps2MoveAccuracy(deltaE, rating = 1500) {
    if (deltaE <= 0.001) return 100;
    // Normalized grading curve
    // E.g. deltaE = 0 -> 100, deltaE = 0.02 (Good) -> ~85-90, deltaE = 0.05 (Inaccuracy) -> ~70, deltaE = 0.20 (Blunder) -> ~20
    const ratingFactor = Math.max(0.85, Math.min(1.15, rating / 1500));
    const winDiff = deltaE * 100;
    const raw = 103.1668 * Math.exp(-0.04354 * winDiff * ratingFactor) - 3.1668;
    return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

// Convert eval tokens to centipawns
function evalToCp(scoreTokens) {
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

// UCI Coordinate to SAN
function uciToSan(chess, uciMove) {
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
    } catch {}
    return '';
}

const readline = require('readline');

// Stockfish Wrapper
class StockfishEngine {
    constructor() {
        this.sf = spawn(STOCKFISH_EXE, [], { windowsHide: true });
        this.callbacks = [];
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

    async analyze(fen, depth = 18) {
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

// Simple piece sacrifice check
function isPieceSacrifice(move) {
    if (!move.captured && (move.piece === 'n' || move.piece === 'b' || move.piece === 'r' || move.piece === 'q')) {
        // Simple heuristic: minor/major moved into attacked square
        return false; // conservative
    }
    return false;
}

// Move classifier
function classifyMove(deltaE, isBestMove, isBookMove, isForced, isSacrifice, oppRating, scoreBefore, scoreAfter, beforeE, afterE) {
    if (isBookMove) return 'book';
    if (isForced) return 'forced';

    if (isSacrifice && deltaE <= 0.025 && afterE >= 0.42 && scoreBefore <= 350 && beforeE <= 0.88) {
        return 'brilliant';
    }

    // Great move (!)
    const foundMate = scoreAfter >= 50000 && scoreBefore < 50000;
    const punishedError = (oppRating === 'mistake' || oppRating === 'blunder') && afterE >= 0.72;
    const savedLosingGame = beforeE < 0.35 && afterE >= 0.48;
    if (isBestMove && (foundMate || punishedError || savedLosingGame)) {
        return 'great';
    }

    // Miss (X)
    if ((oppRating === 'mistake' || oppRating === 'blunder') && deltaE >= 0.10) {
        return 'miss';
    }

    if (isBestMove || deltaE <= 0.005) {
        return 'best';
    }

    if (deltaE <= 0.020) return 'excellent';
    if (deltaE <= 0.050) return 'good';
    if (deltaE <= 0.100) return 'inaccuracy';
    if (deltaE <= 0.200) return 'mistake';
    return 'blunder';
}

async function runBenchmarkGame(gameData, sf, depth = 18) {
    const pgn = gameData.pgn;
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });

    const whiteRating = parseInt(gameData.players.white.rating || 1500, 10);
    const blackRating = parseInt(gameData.players.black.rating || 1500, 10);

    const movesResult = [];
    const replayChess = new Chess();

    // Initial position evaluation
    let initEval = await sf.analyze(replayChess.fen(), depth);
    let prevScoreTokens = initEval.score;
    let prevBestMoveUci = initEval.bestMove;
    let prevBestMoveSan = uciToSan(replayChess, prevBestMoveUci);

    let lastWhiteRating = undefined;
    let lastBlackRating = undefined;

    for (let i = 0; i < history.length; i++) {
        const m = history[i];
        const isWhite = m.color === 'w';
        const pRating = isWhite ? whiteRating : blackRating;
        const oppRating = isWhite ? lastBlackRating : lastWhiteRating;

        const isForced = replayChess.moves().length === 1;
        const isBest = prevBestMoveSan === m.san;

        // Make move
        replayChess.move(m.san);
        const fenAfter = replayChess.fen();

        let afterEvalScoreTokens;
        let nextBestUci;
        let nextBestSan;

        if (replayChess.isCheckmate()) {
            afterEvalScoreTokens = ['mate', '0'];
        } else {
            const res = await sf.analyze(fenAfter, depth);
            afterEvalScoreTokens = res.score;
            nextBestUci = res.bestMove;
            nextBestSan = uciToSan(replayChess, nextBestUci);
        }

        const scoreBefore = evalToCp(prevScoreTokens);
        const scoreAfter = replayChess.isCheckmate() ? 100000 : -evalToCp(afterEvalScoreTokens);

        const beforeE = winExpectancy(scoreBefore, pRating);
        const afterE = winExpectancy(scoreAfter, pRating);
        const deltaE = Math.max(0, beforeE - afterE);

        // Book move detection: first 6 ply or standard lines
        const isBook = i < 6; // simplified for benchmark

        const classification = classifyMove(
            deltaE,
            isBest,
            isBook,
            isForced,
            false,
            oppRating,
            scoreBefore,
            scoreAfter,
            beforeE,
            afterE
        );

        const acc = isBook || isForced ? 100 : caps2MoveAccuracy(deltaE, pRating);

        if ((i + 1) % 10 === 0 || i === history.length - 1) {
            console.log(`[Progress] Evaluated ply ${i + 1}/${history.length} (${m.san} -> ${classification}, dE=${deltaE.toFixed(3)}, acc=${acc.toFixed(1)})`);
        }

        movesResult.push({
            ply: i + 1,
            color: isWhite ? 'white' : 'black',
            san: m.san,
            classification,
            deltaE,
            acc,
            scoreBefore,
            scoreAfter
        });

        if (isWhite) lastWhiteRating = classification;
        else lastBlackRating = classification;

        prevScoreTokens = afterEvalScoreTokens;
        prevBestMoveUci = nextBestUci;
        prevBestMoveSan = nextBestSan;
    }

    return movesResult;
}

module.exports = {
    StockfishEngine,
    runBenchmarkGame,
    caps2MoveAccuracy,
    winExpectancy
};

if (require.main === module) {
    (async () => {
        console.log('=== BENCHMARK ON SAMPLE EXTRACTED GAME ===');
        const sf = new StockfishEngine();
        sf.send('uci');
        sf.send('setoption name Threads value 4');
        sf.send('setoption name Hash value 64');
        await sf.waitReady();

        const sample = JSON.parse(fs.readFileSync('sample_extracted_review.json', 'utf8'));
        // Find corresponding game in review_data/
        const gameReview = JSON.parse(fs.readFileSync('review_data/review_184653017586.json', 'utf8'));

        console.log(`Running review on game ${gameReview.game.id}...`);
        const startTime = Date.now();
        const results = await runBenchmarkGame(gameReview, sf, 16);
        const elapsed = Date.now() - startTime;
        console.log(`Review complete in ${(elapsed / 1000).toFixed(1)}s!`);

        // Tallies
        const tallies = { white: {}, black: {} };
        const accs = { white: [], black: [] };

        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const ground = sample.moves[i];
            const col = r.color;

            if (r.classification !== 'forced') {
                tallies[col][r.classification] = (tallies[col][r.classification] || 0) + 1;
            }
            accs[col].push(r.acc);
        }

        const wAvg = accs.white.reduce((a, b) => a + b, 0) / accs.white.length;
        const bAvg = accs.black.reduce((a, b) => a + b, 0) / accs.black.length;

        console.log('\n--- COMPUTED VS GROUND TRUTH TALLIES ---');
        console.log('Computed White Tallies:', tallies.white);
        console.log('Ground Truth White Tallies:', sample.tallies);
        console.log('Computed Black Tallies:', tallies.black);

        console.log('\n--- COMPUTED VS GROUND TRUTH ACCURACY ---');
        console.log(`White Accuracy: Computed = ${wAvg.toFixed(2)}%, Official = ${sample.players.white.accuracy}%`);
        console.log(`Black Accuracy: Computed = ${bAvg.toFixed(2)}%, Official = ${sample.players.black.accuracy}%`);

        sf.terminate();
    })().catch(console.error);
}
