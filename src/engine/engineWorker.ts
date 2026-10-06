import { wasmSupported, wasmThreadsSupported } from "./wasmChecks";

export interface StockfishEngine {
    postMessage: (message: any, options?: any) => void;
    addEventListener: (type: string, listener: (e: any) => void) => void;
    removeEventListener: (type: string, listener: (e: any) => void) => void;
    terminate: () => void;
    isNative?: boolean;
    engineName?: string;
}

export class NativeEngineWorker implements StockfishEngine {
    private ws: WebSocket;
    private listeners: { [event: string]: Set<(e: any) => void> } = {};
    private pendingMessages: string[] = [];
    private isConnected: boolean = false;
    public isNative: boolean = true;
    public engineName: string = "Stockfish 19 (Native Universal)";

    constructor(ws: WebSocket) {
        this.ws = ws;
        this.isConnected = ws.readyState === WebSocket.OPEN;

        ws.onopen = () => {
            this.isConnected = true;
            while (this.pendingMessages.length > 0) {
                const msg = this.pendingMessages.shift();
                if (msg) ws.send(msg);
            }
        };

        ws.onmessage = (event) => {
            const data = typeof event.data === "string" ? event.data.trim() : event.data;
            this.dispatchEvent("message", { data });
        };

        ws.onerror = (error) => {
            this.dispatchEvent("error", error);
        };

        ws.onclose = () => {
            this.isConnected = false;
        };
    }

    private _onmessage: ((e: any) => void) | null = null;
    private _onerror: ((e: any) => void) | null = null;

    get onmessage() {
        return this._onmessage;
    }
    set onmessage(handler: ((e: any) => void) | null) {
        if (this._onmessage) {
            this.removeEventListener("message", this._onmessage);
        }
        this._onmessage = handler;
        if (handler) {
            this.addEventListener("message", handler);
        }
    }

    get onerror() {
        return this._onerror;
    }
    set onerror(handler: ((e: any) => void) | null) {
        if (this._onerror) {
            this.removeEventListener("error", this._onerror);
        }
        this._onerror = handler;
        if (handler) {
            this.addEventListener("error", handler);
        }
    }

    public postMessage(message: string) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(message);
        } else {
            this.pendingMessages.push(message);
        }
    }

    public addEventListener(event: string, handler: (e: any) => void) {
        if (!this.listeners[event]) {
            this.listeners[event] = new Set();
        }
        this.listeners[event].add(handler);
    }

    public removeEventListener(event: string, handler: (e: any) => void) {
        if (this.listeners[event]) {
            this.listeners[event].delete(handler);
        }
    }

    private dispatchEvent(event: string, data: any) {
        if (this.listeners[event]) {
            for (const handler of Array.from(this.listeners[event])) {
                try {
                    handler(data);
                } catch (e) {
                    console.error("[NativeEngineWorker] error in listener", e);
                }
            }
        }
    }

    public terminate() {
        try {
            this.ws.close();
        } catch { }
    }
}

/**
 * Creates a Stockfish engine instance.
 * Prioritizes the native Stockfish 19 bridge (stockfish-windows-x86-64-universal.exe in the stockfish folder)
 * when running with the local server, and falls back to Stockfish 19 WebAssembly in browser-only mode.
 */
export async function createStockfishWorker(): Promise<StockfishEngine> {
    if (typeof window === "undefined") {
        throw new Error("Window is not defined");
    }

    // 1. Try connecting to native Stockfish bridge (stockfish-windows-x86-64-universal.exe)
    try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.host;

        const candidateHosts: string[] = [];
        if (host) candidateHosts.push(host);
        if (host !== "localhost:3000" && !candidateHosts.includes("localhost:3000")) {
            candidateHosts.push("localhost:3000");
        }

        for (const candidateHost of candidateHosts) {
            const wsUrl = `${protocol}//${candidateHost}/engine/native`;
            const nativeEngine = await new Promise<StockfishEngine | null>((resolve) => {
                let settled = false;
                let ws: WebSocket;
                try {
                    ws = new WebSocket(wsUrl);
                } catch {
                    return resolve(null);
                }

                const timer = setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        try { ws.close(); } catch {}
                        resolve(null);
                    }
                }, 1200);

                ws.onopen = () => {
                    if (!settled) {
                        settled = true;
                        clearTimeout(timer);
                        resolve(new NativeEngineWorker(ws));
                    }
                };

                ws.onerror = () => {
                    if (!settled) {
                        settled = true;
                        clearTimeout(timer);
                        resolve(null);
                    }
                };
            });

            if (nativeEngine) {
                console.log(`⚡ Connected to Native Stockfish 19 bridge at ${wsUrl}`);
                return nativeEngine;
            }
        }
    } catch (e) {
        console.warn("Native Stockfish bridge connection attempt failed, falling back to WebAssembly", e);
    }

    // 2. Fallback to WebAssembly Worker (Stockfish 19)
    let workerPath = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/engine/stockfish.js`;
    if (!wasmThreadsSupported()) {
        workerPath = wasmSupported()
            ? `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/engine/stockfish-single.js`
            : `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/engine/stockfish-asm.js`;
    }

    console.log(`🌐 Using Stockfish 19 WebAssembly at ${workerPath}`);
    const worker = new window.Worker(workerPath);
    (worker as any).isNative = false;
    (worker as any).engineName = "Stockfish 19 (WebAssembly)";
    return worker as unknown as StockfishEngine;
}
