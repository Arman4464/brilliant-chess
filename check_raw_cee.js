const fs = require('fs');
const path = require('path');
const KOMODO_TEP = require('./explanation-engine.js');
const crypto = require('crypto');

async function checkRawCee(gameId, targetPlies) {
    const data = JSON.parse(fs.readFileSync('review_data/move_by_move_reviews/review_' + gameId + '.json', 'utf8'));
    const { Chess } = require('chess.js');
    const chess = new Chess();
    const plies = [];
    const allFens = [chess.fen()];
    for (let i = 0; i < data.moves.length; i++) {
        const m = data.moves[i];
        const legalMoves = chess.moves({ verbose: true });
        let matched = legalMoves.find(lm => (lm.from + lm.to + (lm.promotion || '')) === m.lan);
        if (!matched && m.san) matched = legalMoves.find(lm => lm.san === m.san || lm.san.replace(/[+#x]/g, '') === m.san.replace(/[+#x]/g, ''));
        if (!matched && m.fen) {
            const tb = m.fen.split(' ')[0];
            matched = legalMoves.find(lm => {
                const clone = new Chess(chess.fen());
                clone.move(lm);
                return clone.fen().split(' ')[0] === tb;
            });
        }
        chess.move(matched);
        const lan = matched.from + matched.to + (matched.promotion || '');
        allFens.push(chess.fen());
        plies.push({ ply: i + 1, san: matched.san, lan, offClass: m.classification });
    }

    const gameHash = crypto.createHash('md5').update(allFens.join('|')).digest('hex');
    const cachePath = path.join('.eval_cache', 'pool_' + gameHash + '_d18_mpv2.json');
    const allEvals = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

    const res = await new Promise(resolve => {
        const engine = KOMODO_TEP('./explanation-engine.wasm', {
            onKomodoTepInitialized: () => {
                engine.postMessage('uci');
                engine.postMessage('isready');
            },
            onmessage: (msg) => {
                if (typeof msg !== 'string') return;
                if (msg.startsWith('readyok')) {
                    engine.postMessage('setoption name ScoreWhiteToMove value true');
                    engine.postMessage('setoption name SerializeLikeCEAC value true');
                    engine.postMessage('setoption name SerializeBoardEvents value true');
                    engine.postMessage('setoption name ClassificationV3 value true');
                    engine.postMessage('setoption name SpeechV3 value true');
                    engine.postMessage('setoption name WhiteElo value ' + (data.players?.white?.rating || 1500));
                    engine.postMessage('setoption name BlackElo value ' + (data.players?.black?.rating || 1500));
                    engine.postMessage('position fen ' + allFens[0]);
                    for (const ev of allEvals[0] || []) {
                        if (ev.mateIn !== null) engine.postMessage('variation ' + ev.pv.join(' ') + ' mate ' + ev.mateIn + ' depth ' + ev.depth);
                        else engine.postMessage('variation ' + ev.pv.join(' ') + ' cp ' + Math.round(ev.cp) + ' depth ' + ev.depth);
                    }
                    for (let i = 0; i < plies.length; i++) {
                        engine.postMessage('push ' + plies[i].lan);
                        for (const ev of allEvals[i + 1] || []) {
                            if (ev.mateIn !== null) engine.postMessage('variation ' + ev.pv.join(' ') + ' mate ' + ev.mateIn + ' depth ' + ev.depth);
                            else engine.postMessage('variation ' + ev.pv.join(' ') + ' cp ' + Math.round(ev.cp) + ' depth ' + ev.depth);
                        }
                    }
                    engine.postMessage('fetch analysis');
                } else if (msg.startsWith('json')) {
                    resolve(JSON.parse(msg.slice(5)));
                }
            }
        });
    });

    targetPlies.forEach(tp => {
        const p = res.positions[tp];
        console.log(`Game ${gameId} Ply ${tp} (${plies[tp-1].san}): rawCee=${p.classificationName}, offClass=${plies[tp-1].offClass}, diff=${p.difference}, caps2=${p.caps2}`);
    });
}

async function main() {
    await checkRawCee('114104460147', [54, 60, 63]);
    await checkRawCee('172014464516', [83, 87, 89]);
    await checkRawCee('171853838612', [86, 89]);
    await checkRawCee('165803154362', [40, 44]);
}

main().catch(console.error);
