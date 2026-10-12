# Chess.com Support Pages & Articles Knowledge Base (2026 Edition)

This directory contains a complete research archive and comprehensive catalog of all **Chess.com Support Center** articles and knowledge base pages, with dedicated focus on all **2026 updates and active documentation**.

---

## 📊 Knowledge Base Overview & Metrics

- **Total Articles Indexed:** 470
- **Articles Updated / Maintained in 2026:** 179 (38.1%)
- **Platform Host:** Intercom Help Center (`support.chess.com`)
- **Engine Core:** Stockfish (Evaluation, Game Review, Classification V2)
- **Archive Status:** 100% Up to Date (Current as of October 2026)

### Year-over-Year Article Maintenance Distribution

| Update Year | Article Count | Share (%) |
| :--- | :--- | :--- |
| **2026** | **179** | **38.1%** |
| **2025** | 189 | 40.2% |
| **2024** | 102 | 21.7% |

---

## 📂 Document Catalog Structure

| File | Description | Article Count |
| :--- | :--- | :--- |
| [**`gameplay_and_learning_articles_2026.md`**](./gameplay_and_learning_articles_2026.md) | In-depth documentation on Game Review, CAPS2 Accuracy, Move Classifications, Rules, Analysis Board, and Puzzles. | **47 Articles** |
| [**`chesscom_support_articles_2026_master_catalog.md`**](./chesscom_support_articles_2026_master_catalog.md) | **Master Catalog of every single article updated in 2026** with IDs, categories, dates, and direct URLs. | **179 Articles** |
| [**`complete_support_articles_archive_470.md`**](./complete_support_articles_archive_470.md) | Complete reference archive listing **all 470 articles** across all years. | **470 Articles** |
| [**`chesscom_support_database_2026.json`**](./chesscom_support_database_2026.json) | Complete machine-readable JSON database with full metadata. | Structured JSON |

---

## 🏷️ Category Breakdown (2026 Maintained Articles)

| Category / Collection | 2026 Articles | Total Category Articles | 2026 Focus Area |
| :--- | :--- | :--- | :--- |
| **Learn** | **36** | 80 | Game Review, CAPS2 Accuracy, Stockfish evaluation numbers |
| **Community** | **30** | 88 | Clubs, messaging, leaderboards, player profiles |
| **Gameplay** | **29** | 86 | Pre-moves, tournaments, arena leagues, clock handling |
| **Troubleshooting** | **18** | 41 | Server sync, disconnect recovery, drawing board arrows |
| **Account** | **16** | 36 | Username change, authentication, avatar & profile privacy |
| **Billing** | **14** | 29 | Diamond/Platinum/Gold plans, renewal policies, refunds |
| **Safety** | **12** | 20 | Fair Play detection, report handling, blocking abuse |
| **Courses** | **8** | 27 | Course navigation, progress tracking, interactive drills |
| **Mobile** | **7** | 9 | iOS & Android app settings, push notifications, offline play |
| **General Support / FAQ** | **4** | 19 | Platform maintenance & user experience |
| **Sportsmanship** | **3** | 5 | Sandbagging, stalling, aborting games |
| **Variants** | **2** | 30 | Chess960, 4-Player Chess, Crazyhouse rules |

---

## 🔍 Key Technical Findings from 2026 Support Documentation

1. **Game Review & Move Classifications (Expected Points Model):**
   - Chess.com classifies moves based on **Expected Points Lost** (0.00 to 1.00 win probability scale) rather than static centipawn loss.
   - **Brilliant (!!):** Contextual piece sacrifice that preserves the evaluation advantage.
   - **Great (!):** Only viable defensive or offensive resource in critical positions.
   - **Best (⭐):** Engine's #1 move.
   - **Excellent (🟢):** Near-optimal loss (< 0.02 EP).
   - **Good (🟢):** Modest concession (0.02 – 0.05 EP).
   - **Book (📖):** Established theoretical opening move.
   - **Inaccuracy (?!):** 0.05 – 0.10 EP loss.
   - **Mistake (?):** 0.10 – 0.20 EP loss.
   - **Blunder (??):** > 0.20 EP severe blunder.
   - **Miss (🔭):** Failure to punish opponent's blunder or seize tactical win.

2. **CAPS2 Accuracy Calculation:**
   - Moves are aggregated on a 0–100 scale comparing player decisions against top engine evaluation moves.
   - Shorter time controls (Bullet/Blitz) feature lower average accuracy baseline due to clock urgency.

3. **Evaluation Numbers:**
   - Positive scores (+1.50) represent White advantage; negative (-1.50) represent Black advantage.
   - #M (e.g. #3) indicates forced checkmate in 3 plies/moves.

4. **Fair Play & Titled Accounts:**
   - Multi-tier Fair Play algorithm combines statistical engine-correlation checks with behavioral analysis.
   - Titled players (GM, IM, WGM, FM, etc.) receive free lifetime Diamond memberships upon credential verification.
