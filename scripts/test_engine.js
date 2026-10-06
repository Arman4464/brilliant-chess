const { spawn } = require('child_process');
const path = require('path');

const sfPath = path.join(__dirname, '..', 'stockfish', 'stockfish-windows-x86-64-universal.exe');
console.log('Stockfish path:', sfPath);

const sf = spawn(sfPath);

sf.stdout.on('data', (data) => {
    const text = data.toString();
    console.log('SF output:\n', text.split('\n').slice(0, 5).join('\n'));
    if (text.includes('Stockfish') || text.includes('uciok')) {
        sf.stdin.write('quit\n');
    }
});

sf.on('close', (code) => {
    console.log('Stockfish process closed with code:', code);
});

sf.stdin.write('uci\n');
