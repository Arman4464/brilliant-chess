# Stockfish Native Engine

This directory contains the native Stockfish 19 executable used by the Chessmate review pipeline.

- Binary: `stockfish-windows-x86-64-universal.exe`
- When running locally, `server.js` connects to this executable via a high-performance WebSocket bridge with automatic idle process termination and RAM capping (32 MB Hash, 2 Threads).
- If the native binary is not present, Chessmate automatically falls back to multi-threaded SharedArrayBuffer WebAssembly in the browser.
