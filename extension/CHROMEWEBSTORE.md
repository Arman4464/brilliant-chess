# Chrome Web Store Listing — Chess.com Review Extractor

> Last Updated: 2026-10-02

## Store Listing

**Extension Name** [REQUIRED]
Chess.com Review Extractor

**Short Description** [REQUIRED]
Extracts and downloads Chess.com game review accuracies, move classifications, and Stockfish evaluations to JSON.

**Detailed Description** [REQUIRED]
Export complete game review analytics directly from Chess.com with one click.

Features:
- Instant extraction of accuracy percentages and estimated game ratings for both players.
- Comprehensive move classification tallies (Brilliant, Great, Best, Excellent, Book, Good, Inaccuracies, Mistakes, Misses, and Blunders).
- Move-by-move evaluation data: Stockfish centipawn/mate scores, move notations (SAN), turn times, and FEN board states.
- Clean JSON output with zero coach commentary or fluff.
- One-click floating button directly on Chess.com review pages.

How to use:
1. Open any completed Chess.com game review page.
2. Click the green "Export Review" button on the page or click the extension icon in your toolbar.
3. Your full review data will automatically download as a clean JSON file and copy to your clipboard.

Privacy Note:
This extension operates 100% locally in your browser. No game data, account details, or analytics are ever collected, transmitted, or sent to external servers.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Extracts and exports Chess.com game review analytics into downloadable JSON files.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `activeTab` | permissions | Required to interact with the active Chess.com tab when the user clicks the extension popup. |
| `scripting` | permissions | Required to run the review extraction script within the Chess.com page context. |
| `https://www.chess.com/*` | host_permissions | Required to read and extract game review elements from Chess.com game pages. |

## Privacy & Data Use

### Data Collection
The extension does not collect, transmit, or store any personal or user data. All processing occurs locally within the user's browser.

### Data Security
All extracted data is saved directly to the user's local disk via browser download.
