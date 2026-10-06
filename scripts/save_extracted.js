const fs = require("fs");
const raw = fs.readFileSync("C:/Users/rango/.gemini/antigravity/brain/7db821fd-0c95-4f59-b5b3-cebb228945ad/.system_generated/steps/1421/output.txt", "utf8");
const jsonMatch = raw.match(/```json\r?\n([\s\S]*?)\r?\n```/);
if (jsonMatch) {
  const data = JSON.parse(jsonMatch[1]);
  fs.writeFileSync("review_data/move_by_move_reviews/review_165803154362.json", JSON.stringify(data, null, 2), "utf8");
  console.log("Successfully saved review_165803154362.json! Total moves:", data.totalMoves);
} else {
  console.error("Match failed");
}
