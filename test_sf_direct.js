const { spawn } = require('child_process');

const sf = spawn('stockfish/stockfish-windows-x86-64-universal.exe');
sf.stdout.on('data', (d) => {
    const s = d.toString();
    if (s.includes('bestmove')) {
        console.log('[SF-OUTPUT]', s.split('\n').filter(l => l.startsWith('bestmove') || l.includes('depth 16') || l.includes('depth 18')).join('\n'));
    }
});

sf.stdin.write('uci\n');
setTimeout(() => {
    sf.stdin.write('setoption name Threads value 4\n');
    sf.stdin.write('setoption name Hash value 128\n');
    sf.stdin.write('isready\n');
}, 100);

setTimeout(() => {
    const start = Date.now();
    console.log('Testing FEN depth 16...');
    sf.stdin.write('position fen rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1\n');
    sf.stdin.write('go depth 16\n');
}, 300);

setTimeout(() => {
    sf.stdin.write('quit\n');
}, 2500);
