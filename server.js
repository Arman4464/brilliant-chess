const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const { WebSocketServer } = require('ws');
const { ChessReviewEngine } = require('./review_pipeline.js');

const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, 'dist');
const STOCKFISH_EXE = process.env.STOCKFISH_PATH || path.join(__dirname, 'stockfish', 'stockfish-windows-x86-64-universal.exe');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
    // Cross-Origin headers for multi-threaded SharedArrayBuffer Stockfish WebAssembly
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Endpoint to stream and save official Chess.com eco.json
    if (req.url === '/api/save_eco' && req.method === 'POST') {
        const fileStream = fs.createWriteStream(path.join(__dirname, 'eco.json'));
        req.pipe(fileStream);
        fileStream.on('finish', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        });
        fileStream.on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
        });
        return;
    }

    // API endpoint to query native engine availability
    if (req.url === '/api/engine') {
        const exists = fs.existsSync(STOCKFISH_EXE);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            available: exists,
            name: 'Stockfish 19',
            binary: path.basename(STOCKFISH_EXE),
            path: STOCKFISH_EXE,
            type: 'native'
        }));
        return;
    }

    // API endpoint for authentic CEE + Stockfish game review
    if (req.url === '/api/review' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const params = JSON.parse(body);
                const engine = new ChessReviewEngine();
                const review = await engine.analyzeGame({
                    pgn: params.pgn,
                    moves: params.moves,
                    startFen: params.startFen,
                    whiteElo: params.whiteElo,
                    blackElo: params.blackElo,
                    depth: params.depth || 18,
                    multiPv: params.multiPv || 2
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, ...review }));
            } catch (err) {
                console.error('[API /api/review Error]', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // API endpoint to resolve Chess.com game by ID
    if (req.url.startsWith('/api/game')) {
        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const id = urlObj.searchParams.get('id');
        if (!id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing game id' }));
            return;
        }

        (async () => {
            try {
                // Check if already in local review_data datasets
                const reviewDataDir = path.join(__dirname, 'review_data');
                if (fs.existsSync(reviewDataDir)) {
                    for (const userFolder of fs.readdirSync(reviewDataDir)) {
                        const candidatePath = path.join(reviewDataDir, userFolder, `review_${id}.json`);
                        if (fs.existsSync(candidatePath)) {
                            const cached = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: true,
                                id,
                                pgn: cached.pgn,
                                url: cached.game?.url,
                                time_class: cached.game?.timeClass,
                                white: cached.players?.white,
                                black: cached.players?.black
                            }));
                            return;
                        }
                    }
                }

                // Otherwise fetch from Chess.com callback
                const callbackRes = await fetch(`https://www.chess.com/callback/live/game/${id}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                });
                if (!callbackRes.ok) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Game #${id} not found on Chess.com` }));
                    return;
                }
                const data = await callbackRes.json();
                const date = data.game?.pgnHeaders?.Date;
                const player = data.players?.top?.username || data.players?.bottom?.username;

                if (date && player) {
                    const [year, month] = date.split('.');
                    const archiveUrl = `https://api.chess.com/pub/player/${player.toLowerCase()}/games/${year}/${month}`;
                    const archiveRes = await fetch(archiveUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                    });
                    if (archiveRes.ok) {
                        const { games } = await archiveRes.json();
                        const match = (games || []).find(g => g.url && g.url.includes(String(id)));
                        if (match) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: true,
                                id,
                                pgn: match.pgn,
                                url: match.url,
                                time_class: match.time_class,
                                white: match.white,
                                black: match.black
                            }));
                            return;
                        }
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, id, data }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        })();
        return;
    }

    let reqPath = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    if (!reqPath) {
        reqPath = 'index.html';
    } else if (!path.extname(reqPath)) {
        if (fs.existsSync(path.join(DIST, reqPath + '.html'))) {
            reqPath = reqPath + '.html';
        } else if (fs.existsSync(path.join(DIST, reqPath, 'index.html'))) {
            reqPath = path.join(reqPath, 'index.html');
        }
    }

    let filePath = path.join(DIST, reqPath);
    let statusCode = 200;

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST, '404.html');
        statusCode = 404;
        if (!fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    res.writeHead(statusCode, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
});

// Setup WebSocket bridge for Native Stockfish 19 executable
const wss = new WebSocketServer({ server, path: '/engine/native' });

wss.on('connection', (ws) => {
    console.log('[Native Stockfish Bridge] Client connected via WebSocket');

    if (!fs.existsSync(STOCKFISH_EXE)) {
        console.error('[Native Stockfish Bridge] Executable not found at:', STOCKFISH_EXE);
        ws.send('info string Error: Stockfish executable not found at ' + STOCKFISH_EXE);
        ws.close();
        return;
    }

    console.log(`[Native Stockfish Bridge] Spawning ${STOCKFISH_EXE}`);
    const sf = spawn(STOCKFISH_EXE, [], { windowsHide: true });
    sf.stdin.write('setoption name Threads value 4\nsetoption name Hash value 128\n');

    const rl = readline.createInterface({ input: sf.stdout });
    rl.on('line', (line) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(line);
        }
    });

    sf.stderr.on('data', (data) => {
        console.error('[Native Stockfish STDERR]', data.toString().trim());
    });

    sf.on('error', (err) => {
        console.error('[Native Stockfish Error]', err);
        if (ws.readyState === ws.OPEN) {
            ws.send('info string Native engine error: ' + err.message);
        }
    });

    sf.on('close', (code) => {
        console.log('[Native Stockfish] Process exited with code', code);
    });

    ws.on('message', (message) => {
        const cmd = message.toString().trim();
        if (cmd) {
            try {
                sf.stdin.write(cmd + '\n');
            } catch (e) {
                console.error('[Native Stockfish Stdin Error]', e);
            }
        }
    });

    ws.on('close', () => {
        console.log('[Native Stockfish Bridge] Client disconnected, terminating engine');
        try {
            sf.stdin.write('quit\n');
            setTimeout(() => {
                if (!sf.killed) sf.kill();
            }, 500);
        } catch {
            sf.kill();
        }
    });
});

server.listen(PORT, () => {
    const nativeFound = fs.existsSync(STOCKFISH_EXE);
    console.log(`✓ Brilliant Chess server running at http://localhost:${PORT}`);
    if (nativeFound) {
        console.log(`✓ Native Stockfish bridge active: ${STOCKFISH_EXE}`);
    } else {
        console.warn(`! Native Stockfish executable not found at ${STOCKFISH_EXE}, will fall back to WebAssembly`);
    }
});
