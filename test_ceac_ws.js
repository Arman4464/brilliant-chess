const WebSocket = require('ws');

const ws = new WebSocket('wss://analysis.chess.com:443/v2/game-review', {
    headers: {
        'Origin': 'https://www.chess.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
    }
});

ws.on('open', () => {
    console.log('WebSocket successfully CONNECTED to wss://analysis.chess.com:443/v2/game-review!');
    ws.close();
    process.exit(0);
});

ws.on('error', (err) => {
    console.error('WebSocket connection error:', err.message);
    process.exit(1);
});

ws.on('close', (code, reason) => {
    console.log('WebSocket closed:', code, reason.toString());
});
