const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const { Chess } = require('chess.js');

// Load target game
const targetGameId = process.argv[2] || '165978574788';
console.log(`\n=============================================================`);
console.log(`REAL-TIME STOCKFISH 19 BENCHMARK & CLASSIFIER ANALYSIS: #${targetGameId}`);
console.log(`=============================================================\n`);

let rawData = null;
const paths = [
    `review_data/911Samsung/review_${targetGameId}.json`,
    `review_data/move_by_move_reviews/review_${targetGameId}.json`,
    `ground_truth_${targetGameId}.json`
];

for (const p of paths) {
    if (fs.existsSync(p)) {
        rawData = JSON.parse(fs.readFileSync(p, 'utf8'));
        break;
    }
}

if (!rawData) {
    console.error(`Game data file not found for #${targetGameId}`);
    process.exit(1);
}

const pgn = rawData.pgn || '';
const officialAcc = rawData.accuracies;
console.log('Official Chess.com Accuracies:', officialAcc);
console.log('Players:', rawData.players);

// Setup Stockfish process
const sf = spawn('stockfish/stockfish-windows-x86-64-universal.exe');
sf.stdin.write('uci\n');
sf.stdin.write('setoption name Threads value 4\n');
sf.stdin.write('setoption name Hash value 128\n');
sf.stdin.write('isready\n');

const rl = readline.createInterface({ input: sf.stdout });

let sfReady = false;
let pendingResolve = null;

rl.on('line', (line) => {
    line = line.trim();
    if (line === 'readyok') {
        sfReady = true;
    }
    if (line.startsWith('bestmove') && pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(line);
    }
});

function waitReady() {
    return new Promise((resolve) => {
        if (sfReady) return resolve();
        const check = setInterval(() => {
            if (sfReady) {
                clearInterval(check);
                resolve();
            }
        }, 10);
    });
}

function evaluateFen(fen, depth = 14) {
    return new Promise((resolve) => {
        let bestMoveUci = null;
        let scoreCp = 0;
        let mateVal = null;

        const lineHandler = (line) => {
            line = line.trim();
            if (line.startsWith('info') && line.includes(' score ')) {
                const parts = line.split(/\s+/);
                const scoreIdx = parts.indexOf('score');
                if (scoreIdx !== -1 && scoreIdx + 2 < parts.length) {
                    const type = parts[scoreIdx + 1];
                    const val = parseInt(parts[scoreIdx + 2], 10);
                    if (type === 'cp') {
                        scoreCp = val;
                        mateVal = null;
                    } else if (type === 'mate') {
                        mateVal = val;
                        scoreCp = val > 0 ? 100000 - val * 100 : -100000 - val * 100;
                    }
                }
            }
        };

        const origLineListener = (line) => {
            lineHandler(line);
            if (line.startsWith('bestmove')) {
                rl.removeListener('line', origLineListener);
                const parts = line.split(/\s+/);
                bestMoveUci = parts[1];
                resolve({ bestMoveUci, scoreCp, mateVal });
            }
        };

        rl.on('line', origLineListener);
        sf.stdin.write(`position fen ${fen}\n`);
        sf.stdin.write(`go depth ${depth}\n`);
    });
}

// CAPS2 math formulas
function winExpectancy(scoreCp, elo = 1500) {
    // Model scaling parameter calibrated for Elo bracket
    const s = 4.0;
    const rFactor = Math.pow(Math.max(400, elo) / 1000, -0.15);
    const scaledCp = (scoreCp / 100) * rFactor;
    return 1 / (1 + Math.pow(10, -scaledCp / s));
}

function normalizeCp(cp) {
    if (Math.abs(cp) >= 50000) return cp > 0 ? 1000 : -1000;
    return Math.sign(cp) * (1000 * Math.log10(1 + 0.004 * Math.abs(cp)) / Math.log10(5));
}

function caps2MoveAccuracy(deltaE, elo = 1500, deltaCp = 0, scoreBefore = 0, scoreAfter = 0) {
    if (deltaE <= 0.001 && deltaCp <= 10) return 100.0;
    if (scoreBefore >= 99000 && scoreAfter < 99000) return 18.0;
    if (scoreBefore > -90000 && scoreAfter <= -99000) return 5.0;

    const rFactor = Math.pow(elo / 1000, -0.2);
    const normBefore = normalizeCp(scoreBefore);
    const normAfter = normalizeCp(scoreAfter);
    const dCp = Math.max(0, normBefore - normAfter);

    const winDiscount = normAfter > 200 ? Math.max(0.20, 1.0 - (normAfter - 200) / 1000) : 1.0;
    const lossDiscount = normBefore < -200 ? Math.max(0.40, 1.0 - Math.abs(normBefore + 200) / 1500) : 1.0;

    const effectiveCpLoss = (Math.max(0, dCp - 10) / 100) * 4.5 * winDiscount * lossDiscount;
    const effectiveWinLoss = (deltaE * 100) * 1.0;
    const totalLoss = effectiveWinLoss + effectiveCpLoss;

    const k = 0.055;
    const raw = 103.1668 * Math.exp(-k * totalLoss * rFactor) - 3.1668;
    return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

async function run() {
    await waitReady();
    console.log('Stockfish 19 ready. Parsing game PGN...');

    const chess = new Chess();
    // Clean PGN
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    console.log(`Total moves: ${history.length} plies (${Math.ceil(history.length / 2)} moves)\n`);

    const engineChess = new Chess();
    const results = [];
    const tallies = {
        white: { brilliant: 0, great: 0, book: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
        black: { brilliant: 0, great: 0, book: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 }
    };
    const accuracies = { white: [], black: [] };

    const totalStartTime = Date.now();

    for (let i = 0; i < history.length; i++) {
        const m = history[i];
        const isWhite = m.color === 'w';
        const side = isWhite ? 'white' : 'black';
        const fenBefore = engineChess.fen();

        // 1. Evaluate position before move
        const moveStart = Date.now();
        const evalBefore = await evaluateFen(fenBefore, 14);

        // Convert engine best move UCI to SAN
        const bestMoveObj = engineChess.moves({ verbose: true }).find(cand => cand.from + cand.to + (cand.promotion || '') === evalBefore.bestMoveUci);
        const bestMoveSan = bestMoveObj ? bestMoveObj.san : null;

        // Make the player's move
        engineChess.move(m);
        const fenAfter = engineChess.fen();

        // 2. Evaluate position after move
        const evalAfter = await evaluateFen(fenAfter, 14);
        const elapsed = Date.now() - moveStart;

        // Player scores: positive is good for current player
        const playerScoreBefore = evalBefore.scoreCp;
        const playerScoreAfter = -evalAfter.scoreCp;

        const pElo = isWhite ? (rawData.players?.white?.rating || 1500) : (rawData.players?.black?.rating || 1500);
        const playerBeforeE = winExpectancy(playerScoreBefore, pElo);
        const playerAfterE = winExpectancy(playerScoreAfter, pElo);
        const deltaE = Math.max(0, playerBeforeE - playerAfterE);
        const deltaCp = Math.max(0, playerScoreBefore - playerScoreAfter);

        const isBestMove = bestMoveSan === m.san;
        const isBook = i < 6 && (m.san === 'e4' || m.san === 'e5' || m.san === 'Nf3' || m.san === 'Nc6' || m.san === 'c5' || m.san === 'd4');

        // Classification
        let classification = 'good';
        if (isBook) {
            classification = 'book';
        } else if (isBestMove) {
            // Check for Great / Brilliant
            if (playerScoreBefore <= -150 && playerScoreAfter >= -30) {
                classification = 'great';
            } else {
                classification = 'best';
            }
        } else {
            // Error thresholds
            if ((deltaE >= 0.40 || deltaCp >= 400) && playerScoreAfter <= -200) {
                classification = 'blunder';
            } else if (deltaE >= 0.22 || deltaCp >= 200) {
                classification = 'mistake';
            } else if (deltaE >= 0.12 || deltaCp >= 80) {
                classification = 'inaccuracy';
            } else if (deltaE >= 0.05 || deltaCp >= 40) {
                classification = 'good';
            } else {
                classification = 'excellent';
            }
        }

        // Accuracy
        let acc = isBook ? 100 : caps2MoveAccuracy(deltaE, pElo, deltaCp, playerScoreBefore, playerScoreAfter);
        if (classification === 'best' || classification === 'great' || classification === 'brilliant') acc = 100;
        else if (classification === 'excellent') acc = Math.max(acc, 93.0);
        else if (classification === 'good') acc = Math.min(acc, 85.0);
        else if (classification === 'inaccuracy') acc = Math.min(acc, 60.0);
        else if (classification === 'mistake') acc = Math.min(acc, 30.0);
        else if (classification === 'miss') acc = Math.min(acc, 18.0);
        else if (classification === 'blunder') acc = Math.min(acc, 6.0);

        accuracies[side].push(acc);
        tallies[side][classification]++;

        const plyNum = i + 1;
        const moveNum = Math.ceil(plyNum / 2);
        console.log(`[Ply ${String(plyNum).padStart(2)}] ${isWhite ? moveNum + '.' : moveNum + '...'} ${m.san.padEnd(5)} | Best: ${(bestMoveSan || '-').padEnd(5)} | Eval: ${(playerScoreAfter/100).toFixed(2).padStart(6)} | Class: ${classification.padEnd(10)} | Acc: ${acc.toFixed(1).padStart(5)}% | ${elapsed}ms`);
    }

    const totalElapsed = (Date.now() - totalStartTime) / 1000;

    const avgWhiteAcc = accuracies.white.reduce((a, b) => a + b, 0) / accuracies.white.length;
    const avgBlackAcc = accuracies.black.reduce((a, b) => a + b, 0) / accuracies.black.length;

    console.log(`\n=============================================================`);
    console.log(`ANALYSIS FINISHED IN ${totalElapsed.toFixed(2)}s`);
    console.log(`=============================================================`);
    console.log(`\nComputed Accuracies:`);
    console.log(`  White: ${avgWhiteAcc.toFixed(1)}% (Official Chess.com: ${officialAcc?.white || 'N/A'}%)`);
    console.log(`  Black: ${avgBlackAcc.toFixed(1)}% (Official Chess.com: ${officialAcc?.black || 'N/A'}%)`);
    console.log(`\nMove Tallies:`);
    console.log('White:', JSON.stringify(tallies.white, null, 2));
    console.log('Black:', JSON.stringify(tallies.black, null, 2));

    sf.stdin.write('quit\n');
    process.exit(0);
}

run();
