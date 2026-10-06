const fs = require('fs');
const path = require('path');

const targetTiers = [
    { tier: 'SuperGM_2800+', players: ['hikaru', 'magnuscarlsen'], minElo: 2800, maxElo: 3500 },
    { tier: 'Master_2200_2600', players: ['danielnaroditsky', 'gothamchess'], minElo: 2200, maxElo: 2700 },
    { tier: 'Advanced_1800_2200', players: ['arcas6', 'atastypawn'], minElo: 1800, maxElo: 2200 },
    { tier: 'Intermediate_1400_1800', players: ['agentorangejuice', '3zylryb', 'arkieplayer', 'andreakis'], minElo: 1400, maxElo: 1800 },
    { tier: 'Casual_1000_1400', players: ['alanmurray', 'alyssahn', '33_ad', 'atm849'], minElo: 1000, maxElo: 1400 },
    { tier: 'Novice_300_1000', players: ['0galen0', 'angrypawn3002', 'argembarger', 'albump'], minElo: 200, maxElo: 1000 }
];

const outDir = path.join(__dirname, '..', 'dataset_multi_tier');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function fetchPlayerMonth(username, year = '2024', month = '09') {
    const url = `https://api.chess.com/pub/player/${username}/games/${year}/${month}`;
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'ChessAnalysisTool/1.0 (contact: test@example.com)' }
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.games || []).filter(g => 
            g.rated && 
            g.rules === 'chess' && 
            g.pgn && 
            g.accuracies && 
            (g.time_class === 'rapid' || g.time_class === 'blitz')
        );
    } catch (e) {
        console.error(`Error fetching for ${username}:`, e.message);
        return [];
    }
}

async function main() {
    console.log('=== COLLECTING MULTI-TIER CHESS.COM GAMES ===\n');
    const allCollected = [];

    for (const group of targetTiers) {
        console.log(`--- Fetching Tier: ${group.tier} ---`);
        let tierCount = 0;
        for (const username of group.players) {
            if (tierCount >= 4) break;
            console.log(`  Querying archives for player: ${username}...`);
            const games = await fetchPlayerMonth(username);
            for (const g of games) {
                if (tierCount >= 4) break;
                const id = g.url.split('/').pop();
                const wElo = g.white.rating;
                const bElo = g.black.rating;
                const avgElo = (wElo + bElo) / 2;

                // Validate rating range
                if (avgElo < group.minElo * 0.9 || avgElo > group.maxElo * 1.1) continue;

                // Make sure pgn has reasonable length (> 15 moves)
                const moveCount = (g.pgn.match(/\d+\./g) || []).length;
                if (moveCount < 15 || moveCount > 80) continue;

                const outPath = path.join(outDir, `game_${id}.json`);
                const record = {
                    id,
                    tier: group.tier,
                    url: g.url,
                    timeClass: g.time_class,
                    timeControl: g.time_control,
                    white: {
                        username: g.white.username,
                        rating: g.white.rating,
                        accuracy: g.accuracies.white,
                        result: g.white.result
                    },
                    black: {
                        username: g.black.username,
                        rating: g.black.rating,
                        accuracy: g.accuracies.black,
                        result: g.black.result
                    },
                    eco: g.eco ? g.eco.split('/').pop() : null,
                    pgn: g.pgn
                };

                fs.writeFileSync(outPath, JSON.stringify(record, null, 2));
                allCollected.push(record);
                tierCount++;
                console.log(`    Saved game #${id} (${record.white.username} [${wElo}] vs ${record.black.username} [${bElo}], ${moveCount} moves, Acc: W ${record.white.accuracy}% / B ${record.black.accuracy}%)`);
            }
        }
        console.log(`Tier ${group.tier} complete: ${tierCount} games.\n`);
    }

    console.log(`Total Multi-Tier Games Collected: ${allCollected.length}`);
}

main().catch(console.error);
