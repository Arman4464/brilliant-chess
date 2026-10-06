const fs = require('fs');
const { ChessReviewEngine } = require('../review_pipeline.js');

async function test() {
    const archiveRes = await fetch('https://api.chess.com/pub/player/spy-deer-man/games/2026/09', {
        headers: { 'User-Agent': 'ChessAnalysisTool/1.0' }
    });
    const archData = await archiveRes.json();
    const g = archData.games.find(x => x.url.includes('184347995768'));
    const engine = new ChessReviewEngine(4);
    const res = await engine.analyzeGame({
        pgn: g.pgn,
        whiteElo: 700,
        blackElo: 698,
        depth: 18,
        multiPv: 2
    });
    const gt = JSON.parse(fs.readFileSync('ground_truth_184347995768.json', 'utf8'));
    console.log('PLY | COLOR | SAN | CALC_CLASS | GT_CLASS | MATCH? | RAW_CEE | CAPS2 | DIFF');
    let matches = 0;
    res.moves.forEach((m, i) => {
        const expected = gt[i]?.classification;
        const match = m.classification === expected ? 'YES' : 'NO';
        if (match === 'YES') matches++;
        console.log(`${m.ply} | ${m.color} | ${m.san} | ${m.classification} | ${expected || ''} | ${match} | ${m.rawClassification} | ${m.caps2} | ${m.difference}`);
    });
    console.log(`\nMatches: ${matches} / ${res.moves.length} (${(matches / res.moves.length * 100).toFixed(1)}%)`);
}
test().catch(console.error);
