const fs = require('fs');

const players = [
    { username: 'hikaru', tier: '2800+' },
    { username: 'danielnaroditsky', tier: '2400-2600' },
    { username: 'gothamchess', tier: '2200-2400' },
    { username: 'aartikd', tier: '1200-1400' }
];

async function fetchSample() {
    for (const p of players) {
        try {
            const res = await fetch(`https://api.chess.com/pub/player/${p.username}/games/2024/09`, {
                headers: { 'User-Agent': 'ChessAnalysisTool/1.0 (contact: test@example.com)' }
            });
            const data = await res.json();
            const withAcc = (data.games || []).filter(g => g.accuracies && g.rated && g.rules === 'chess');
            console.log(`${p.username} (${p.tier}): total games ${data.games?.length || 0}, with accuracies: ${withAcc.length}`);
            if (withAcc.length > 0) {
                const sample = withAcc[0];
                console.log(`  Game ID: ${sample.url.split('/').pop()}`);
                console.log(`  Time control: ${sample.time_control}, Class: ${sample.time_class}`);
                console.log(`  White: ${sample.white.username} (${sample.white.rating}), Acc: ${sample.accuracies.white}`);
                console.log(`  Black: ${sample.black.username} (${sample.black.rating}), Acc: ${sample.accuracies.black}`);
            }
        } catch(e) {
            console.error(p.username, 'error:', e.message);
        }
    }
}
fetchSample();
