async function findNewGame() {
    const res = await fetch('https://api.chess.com/pub/player/spy-deer-man/games/2026/09');
    const data = await res.json();
    const games = data.games.filter(g => !g.url.includes('184348301442') && !g.url.includes('184347995768') && g.accuracies);
    console.log('Found unreviewed games with official accuracies:', games.length);
    for (let i = 0; i < Math.min(5, games.length); i++) {
        const g = games[i];
        const id = g.url.split('/').pop();
        console.log(`ID: ${id} | White: ${g.white.username} (${g.white.rating}, acc: ${g.accuracies.white}) vs Black: ${g.black.username} (${g.black.rating}, acc: ${g.accuracies.black})`);
    }
}
findNewGame().catch(console.error);
