const { spawn } = require('child_process');
const readline = require('readline');
const { Chess } = require('chess.js');
const fs = require('fs');
const path = require('path');

const STOCKFISH_EXE = path.join(__dirname, 'stockfish', 'stockfish-windows-x86-64-universal.exe');

function winExpectancy(scoreCp, elo = 1500) {
    const s = 4.0;
    const rFactor = Math.pow(Math.max(300, elo) / 1000, -0.15);
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

    const rFactor = Math.pow(Math.max(300, elo) / 1000, -0.2);
    const normBefore = normalizeCp(scoreBefore);
    const normAfter = normalizeCp(scoreAfter);
    const dCp = Math.max(0, normBefore - normAfter);

    const winDiscount = normAfter > 400 && normBefore > 400 ? 0.35 : (normBefore > 300 && normAfter < 200 ? 1.5 : 1.0);
    const lossDiscount = normBefore < -200 ? Math.max(0.40, 1.0 - Math.abs(normBefore + 200) / 1500) : 1.0;

    const effectiveCpLoss = (Math.max(0, dCp - 10) / 100) * 4.5 * winDiscount * lossDiscount;
    const effectiveWinLoss = (deltaE * 100) * 1.0;
    const totalLoss = effectiveWinLoss + effectiveCpLoss;

    const k = 0.055;
    const raw = 103.1668 * Math.exp(-k * totalLoss * rFactor) - 3.1668;
    return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

async function analyzeGame(gameId, depth = 13) {
    const filePath = path.join(__dirname, 'review_data', '911Samsung', `review_${gameId}.json`);
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }
    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const officialAcc = rawData.accuracies;

    console.log(`\n======================================================`);
    console.log(`ANALYZING GAME #${gameId} (Depth ${depth})`);
    console.log(`Players: White=${rawData.players?.white?.username || 'White'} (${rawData.players?.white?.rating}) vs Black=${rawData.players?.black?.username || 'Black'} (${rawData.players?.black?.rating})`);
    console.log(`Official Chess.com Accuracies: White: ${officialAcc?.white}% | Black: ${officialAcc?.black}%`);
    console.log(`======================================================`);

    const sf = spawn(STOCKFISH_EXE, [], { windowsHide: true });
    sf.stdin.write('setoption name Threads value 4\nsetoption name Hash value 128\n');

    const rl = readline.createInterface({ input: sf.stdout });

    function evaluateFen(fen) {
        return new Promise((resolve) => {
            let bestMoveUci = null;
            let scoreCp = 0;

            function onLine(line) {
                const parts = line.split(' ');
                if (parts[0] === 'info' && parts.includes('score')) {
                    const scoreIdx = parts.indexOf('score');
                    const scoreType = parts[scoreIdx + 1];
                    const scoreVal = parseInt(parts[scoreIdx + 2], 10);
                    if (scoreType === 'cp') {
                        scoreCp = scoreVal;
                    } else if (scoreType === 'mate') {
                        scoreCp = scoreVal > 0 ? (100000 - scoreVal * 100) : (-100000 - scoreVal * 100);
                    }
                }
                if (parts[0] === 'bestmove') {
                    bestMoveUci = parts[1];
                    rl.removeListener('line', onLine);
                    resolve({ bestMoveUci, scoreCp });
                }
            }

            rl.on('line', onLine);
            sf.stdin.write(`position fen ${fen}\n`);
            sf.stdin.write(`go depth ${depth}\n`);
        });
    }

    await new Promise((resolve) => {
        function onLine(line) {
            if (line === 'readyok') {
                rl.removeListener('line', onLine);
                resolve();
            }
        }
        rl.on('line', onLine);
        sf.stdin.write('isready\n');
    });

    const chess = new Chess();
    chess.loadPgn(rawData.pgn);
    const history = chess.history({ verbose: true });

    const engineChess = new Chess();
    const tallies = {
        white: { brilliant: 0, great: 0, book: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
        black: { brilliant: 0, great: 0, book: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 }
    };
    const accuracies = { white: [], black: [] };
    const startTime = Date.now();

    // Initial position
    let currentEval = await evaluateFen(engineChess.fen());

    for (let i = 0; i < history.length; i++) {
        const m = history[i];
        const isWhite = m.color === 'w';
        const side = isWhite ? 'white' : 'black';
        const evalBefore = currentEval;

        const bestMoveObj = engineChess.moves({ verbose: true }).find(c => c.from + c.to + (c.promotion || '') === evalBefore.bestMoveUci);
        const bestMoveSan = bestMoveObj ? bestMoveObj.san : null;

        engineChess.move(m);

        let evalAfter;
        if (engineChess.isCheckmate()) {
            evalAfter = { scoreCp: -100000, bestMoveUci: null };
        } else {
            evalAfter = await evaluateFen(engineChess.fen());
        }
        currentEval = evalAfter;

        const playerScoreBefore = evalBefore.scoreCp;
        const playerScoreAfter = -evalAfter.scoreCp;

        const pElo = isWhite ? (rawData.players?.white?.rating || 1500) : (rawData.players?.black?.rating || 1500);
        const playerBeforeE = winExpectancy(playerScoreBefore, pElo);
        const playerAfterE = winExpectancy(playerScoreAfter, pElo);
        const deltaE = Math.max(0, playerBeforeE - playerAfterE);
        const deltaCp = Math.max(0, playerScoreBefore - playerScoreAfter);

        const isBestMove = bestMoveSan === m.san || deltaE <= 0.001;
        const isBook = i < 4 && (m.san === 'e4' || m.san === 'e5' || m.san === 'Nf3' || m.san === 'Nc6' || m.san === 'd4' || m.san === 'c5' || m.san === 'd5');

        let classification = 'good';
        if (isBook) {
            classification = 'book';
        } else if (isBestMove) {
            if (playerScoreBefore <= -150 && playerScoreAfter >= -30) {
                classification = 'great';
            } else {
                classification = 'best';
            }
        } else {
            if ((deltaE >= 0.32 || deltaCp >= 300) && playerScoreBefore > -300 && playerScoreAfter <= -150) {
                classification = 'blunder';
            } else if (playerScoreBefore > -90000 && playerScoreAfter <= -99000) {
                classification = 'blunder';
            } else if ((deltaE >= 0.18 || deltaCp >= 150) && playerScoreAfter < 150) {
                classification = 'mistake';
            } else if (deltaE >= 0.08 || deltaCp >= 75) {
                classification = 'inaccuracy';
            } else if (deltaE >= 0.025 || deltaCp >= 30) {
                classification = 'good';
            } else {
                classification = 'excellent';
            }
        }

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
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const avgWhiteAcc = (accuracies.white.reduce((a, b) => a + b, 0) / accuracies.white.length).toFixed(1);
    const avgBlackAcc = (accuracies.black.reduce((a, b) => a + b, 0) / accuracies.black.length).toFixed(1);

    console.log(`Analysis completed in ${elapsed}s!`);
    console.log(`Results for #${gameId}:`);
    console.log(`  White Accuracy: ${avgWhiteAcc}% (Official Chess.com: ${officialAcc?.white || 'N/A'}%)`);
    console.log(`  Black Accuracy: ${avgBlackAcc}% (Official Chess.com: ${officialAcc?.black || 'N/A'}%)`);
    console.log(`  White Tallies:`, tallies.white);
    console.log(`  Black Tallies:`, tallies.black);

    sf.stdin.write('quit\n');
}

async function main() {
    await analyzeGame('167679679488', 13);
    await analyzeGame('165978574788', 13);
    await analyzeGame('172014464516', 13);
    process.exit(0);
}

main();
