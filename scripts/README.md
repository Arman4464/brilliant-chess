# Chess Review Calibration & Engine Benchmarks

This directory contains calibration pipelines, accuracy models, parity tests, and engine benchmarks reverse-engineered and calibrated against official Chess.com Game Review outputs.

## Ground Truth Data
- `../review_data/`: Complete datasets containing Chess.com game review extracts and official accuracies:
  - `LittleNear/`: 72 games (66 Live Chess with official accuracies, 6 Bot games)
  - `911Samsung/`: 85 games (81 Live Chess with official accuracies, 4 Coach/Bot games)
  - `Spy-deer-man/`: 61 games (58 Live Chess with official accuracies, 3 Bot games)
  - **Total**: 205 verified games with official Chess.com game accuracies, ratings, and move histories.
- `../sample_extracted_review.json`: Extracted move-by-move ground truth review from Chess.com for Game #184653017586.
- `cache/`: High-performance evaluation cache storing FEN positions and move evaluations for 33 full games.

## Calibrated Mathematical Models

### 1. Expected Points Model (Win Expectancy)
$$\text{Win Expectancy } E(cp, R) = \frac{1}{1 + 10^{-cp / (400 \cdot s(R))}}$$
where $s(R) = \max(0.60, \min(1.40, 0.65 + 0.25 \cdot (R / 1000)))$.

### 2. CAPS2 Move Accuracy Curve
$$\Delta_{loss} = (\Delta E \cdot 100) + \Delta cp_{penalty} \cdot winScale$$
$$A(\Delta_{loss}, R) = 103.1668 \cdot e^{-0.065 \cdot \Delta_{loss} \cdot (R/1000)^{-0.2}} - 3.1668$$
- For book moves, top engine choices, or $\Delta cp \le 10$: $A = 100\%$.
- Forced moves are excluded from game accuracy aggregation, matching Chess.com behavior.

### 3. Game Accuracy Power-Mean Aggregation
$$M_p = \left( \frac{1}{n} \sum_{i=1}^n A_i^p \right)^{1/p} \quad (p = 0.30)$$
$$\text{Game Accuracy} = 0.75 \cdot M_p + 0.25 \cdot M_{arithmetic}$$

## Scripts & Commands

| Script | Command | Purpose |
|---|---|---|
| `benchmark_calibrated.js` | `npm run benchmark` | Benchmarks calibrated formulas across 33 games (66 players) and reports MAE and parity. |
| `train_and_calibrate.js` | `npm run calibrate` | Grid-search optimizer across cached games to determine optimal curve parameters. |
| `test_calibrated_rules.js` | `npm run test:parity` | Evaluates predicted move classifications against Chess.com ground truth (85.1%+ exact agreement). |
| `evaluate_dataset.js` | `node scripts/evaluate_dataset.js` | High-performance batch game evaluator with position caching. |
| `cache_more_games.js` | `node scripts/cache_more_games.js` | Evaluates and caches additional games from `review_data/`. |
| `extract_official_reviews.js` | `node scripts/extract_official_reviews.js` | Extracts official Chess.com review data and accuracies from PGN collections and API archives. |
| `test_sf_speed.js` | `npm run test:speed` | Benchmarks Stockfish search speed and throughput. |
