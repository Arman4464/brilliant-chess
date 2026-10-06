const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');

const ecoData = JSON.parse(fs.readFileSync('chesscom_eco.json', 'utf8'));

// Build shortened FEN map
const fenMap = new Map();
for (const entry of ecoData) {
    if (entry.f) {
        fenMap.set(entry.f, entry);
    }
}

function getShortFen(fen) {
    return fen.split(' ').slice(0, 3).join(' ');
}

function resolveOpening(pgn) {
    const chess = new Chess();
    const cleanPgn = pgn.replace(/\{[^}]*\}|\$\d+/g, '').replace(/\[[^\]]*\]/g, '').replace(/\d+\.+/g, '').replace(/\s+/g, ' ').trim();
    const tokens = cleanPgn.split(' ').filter(t => t && !['1-0', '0-1', '1/2-1/2', '*'].includes(t));
    
    let lastMatch = null;
    let matchPly = 0;
    
    for (let i = 0; i < tokens.length; i++) {
        try {
            const m = chess.move(tokens[i]);
            if (!m) break;
            const sFen = getShortFen(chess.fen());
            if (fenMap.has(sFen)) {
                lastMatch = fenMap.get(sFen);
                matchPly = i + 1;
            }
        } catch (e) {
            break;
        }
    }
    return { lastMatch, matchPly };
}

const files = [
    'review_data/LittleNear/review_184653017586.json',
    'review_data/911Samsung/review_171608609212.json',
    'review_data/911Samsung/review_114104460147.json',
    'review_data/911Samsung/review_172014464516.json',
    'review_data/911Samsung/review_171853838612.json',
    'review_data/911Samsung/review_165803154362.json'
];

for (const f of files) {
    const g = JSON.parse(fs.readFileSync(f, 'utf8'));
    const pgn = g.pgn;
    
    const ecoMatch = pgn.match(/\[ECO "([^"]+)"\]/);
    const ecoUrlMatch = pgn.match(/\[ECOUrl "([^"]+)"\]/);
    const headerEco = ecoMatch ? ecoMatch[1] : null;
    const headerUrl = ecoUrlMatch ? ecoUrlMatch[1] : null;
    
    const res = resolveOpening(pgn);
    console.log('--- ' + path.basename(f) + ' ---');
    console.log('  PGN Header ECO:    ', headerEco);
    console.log('  PGN Header ECOUrl: ', headerUrl);
    console.log('  Resolved ECO:      ', res.lastMatch ? res.lastMatch.c : 'NONE');
    console.log('  Resolved Name:     ', res.lastMatch ? res.lastMatch.n : 'NONE');
    console.log('  Resolved URL:      ', res.lastMatch ? res.lastMatch.u : 'NONE');
    console.log('  Match Ply:         ', res.matchPly);
    
    const expectedUrlSlug = headerUrl ? headerUrl.split('/').pop() : null;
    const urlMatches = expectedUrlSlug ? (res.lastMatch?.u === expectedUrlSlug) : 'N/A';
    const ecoMatches = headerEco ? (res.lastMatch?.c === headerEco) : 'N/A';
    console.log('  ECO Code Match:    ', ecoMatches);
    console.log('  URL Slug Match:    ', urlMatches);
}
