const fs = require('fs');

function parseStepOutput(stepNum, outFileName) {
  const stepPath = `C:/Users/rango/.gemini/antigravity/brain/7db821fd-0c95-4f59-b5b3-cebb228945ad/.system_generated/steps/${stepNum}/output.txt`;
  const raw = fs.readFileSync(stepPath, 'utf8');
  
  // Find JSON inside backticks or quoted string
  let parsed = null;
  const matchTicks = raw.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  if (matchTicks) {
    parsed = JSON.parse(matchTicks[1]);
  } else {
    const startIdx = raw.indexOf('{"game"');
    if (startIdx !== -1) {
      const endIdx = raw.lastIndexOf('}') + 1;
      parsed = JSON.parse(raw.slice(startIdx, endIdx));
    } else {
      // It might be a quoted string like "{\"game\": ...}"
      const qStart = raw.indexOf('"{\\"game\\"');
      if (qStart !== -1) {
        const qEnd = raw.lastIndexOf('}"') + 2;
        const unescaped = JSON.parse(raw.slice(qStart, qEnd));
        parsed = JSON.parse(unescaped);
      }
    }
  }

  if (parsed) {
    const outPath = `review_data/move_by_move_reviews/${outFileName}`;
    fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2), 'utf8');
    console.log(`✅ Saved ${outPath}: ${parsed.totalMoves} moves, White acc: ${parsed.players?.white?.accuracy}, Black acc: ${parsed.players?.black?.accuracy}`);
    return parsed;
  } else {
    console.error(`❌ Failed to parse output from step ${stepNum}`);
  }
}

const args = process.argv.slice(2);
if (args.length >= 2) {
  parseStepOutput(args[0], args[1]);
}

module.exports = { parseStepOutput };
