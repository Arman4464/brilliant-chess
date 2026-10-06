const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');

const sfPath = 'stockfish/stockfish-windows-x86-64-universal.exe';
console.log('Testing Stockfish executable at:', sfPath);

const sf = spawn(sfPath);
const rl = readline.createInterface({ input: sf.stdout });

let ready = false;
let startTime = 0;

rl.on('line', (line) => {
    line = line.trim();
    // console.log('SF:', line);
    if (line === 'uciok') {
        sf.stdin.write('setoption name Threads value 4\n');
        sf.stdin.write('setoption name Hash value 64\n');
        sf.stdin.write('isready\n');
    }
    if (line === 'readyok') {
        console.log('Stockfish 19 initialized with 4 threads and 64MB hash.');
        ready = true;
        testDepth(12);
    }
    if (line.startsWith('bestmove')) {
        const elapsed = Date.now() - startTime;
        console.log(`[Result] ${line} (took ${elapsed}ms)`);
        if (currentDepth === 12) {
            testDepth(14);
        } else if (currentDepth === 14) {
            testDepth(16);
        } else if (currentDepth === 16) {
            testDepth(18);
        } else {
            sf.stdin.write('quit\n');
            process.exit(0);
        }
    }
});

let currentDepth = 0;
function testDepth(d) {
    currentDepth = d;
    startTime = Date.now();
    console.log(`\nEvaluating depth ${d}...`);
    sf.stdin.write('position startpos moves e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6\n');
    sf.stdin.write(`go depth ${d}\n`);
}

sf.stdin.write('uci\n');
