Technical Architecture of Chess.com Game Review: Engine Infrastructure, Move Classification Algorithms, and Replication Feasibility
Engine Infrastructure and Execution Topology
The Chess.com Game Review architecture is engineered around a bifurcated computing model that separates rapid, client-side responsiveness from deep, server-side asynchronous evaluations1. When a player completes a game, an immediate summary is generated via a local engine running directly in the client application or web browser2. This initial phase, designated as Quick Analysis, uses lightweight heuristics to produce an immediate game evaluation graph and tentative move classifications2. Once a user requests a full Game Review, the analytical workload is handed off from the local device to remote compute clusters, which evaluate the game at higher depths and can alter or correct initial classifications1.
The platform's computational engine core relies on Stockfish, while alternative engines such as Komodo are deployed exclusively for interactive bot simulations and custom sparring sessions4. Chess.com updates its primary analysis backend to track modern engine milestones, currently running builds based on Stockfish 181. However, the platform does not universally run identical binary builds or evaluation models across all operational contexts1.
In client-side web browser sessions, the default engine is a specialized WebAssembly build termed Stockfish 18 "Lite"1. This client deployment omits the primary Efficiently Updatable Neural Network (NNUE) evaluation files in favor of traditional Handcrafted Evaluation (HCE)1. The architectural rationale is network efficiency: a full modern Stockfish NNUE network requires an asset download of approximately 108 megabytes, an unacceptable payload for casual browser sessions1. Users can manually opt into downloading the full 108 MB NNUE network via browser settings and elevate the maximum analysis depth up to an uncapped limit of 991. Client-side browser execution also faces security and concurrency boundaries; modern browsers restrict multi-threaded WebAssembly execution on pages containing third-party embeds (such as Twitch streams), limiting browser analysis to single-threaded or older fallback implementations like Stockfish 11 in broadcast contexts1.
Server-side infrastructure executes native, multi-threaded Stockfish 18 binaries configured with the complete 108 MB NNUE network and direct access to 7-piece Syzygy endgame tablebases1. Engine depth within the cloud pipeline is dynamically allocated across predefined strength profiles rather than running open-ended searches1. Internal engine research at Chess.com demonstrates diminishing analytical returns past search depths in the low twenties, particularly for qualitative move labeling1. Consequently, cloud Game Review tiers enforce depth horizons calibrated between 18 and 26 plies7.


Operational Parameter
	Quick Analysis (Local Client)
	Cloud Game Review (Fast/Standard)
	Cloud Game Review (Deep/Maximum)
	Engine Core
	Stockfish 18 "Lite" (WebAssembly)1
	Stockfish 18 (Native Linux Cluster)1
	Stockfish 18 (Native Linux Cluster)1
	Evaluation Model
	Handcrafted Evaluation (HCE)1
	Full NNUE Network (~108 MB file)1
	Full NNUE Network (~108 MB file)1
	Search Depth Horizon
	Shallow / Time-sliced2
	Depth 18 (Fast) to Depth 22 (Standard)7
	Depth 24 (Deep) to Depth 26 (Maximum)7
	Endgame Resources
	External API Tablebase queries6
	Integrated 7-Piece Syzygy Tablebases6
	Integrated 7-Piece Syzygy Tablebases6
	Thread Concurrency
	Single-threaded (DOM-restricted)1
	Multi-core compute nodes1
	High-throughput multi-core nodes1
	Access Entitlement
	Universal (All account tiers)3
	Universal (All account tiers)3
	Premium Gated (Diamond tier exclusive)2
	The Expected Points Model and Accuracy Scoring
Move evaluation on Chess.com is governed by the Classification V2 framework, which departs fundamentally from legacy chess software paradigms that scored moves strictly on raw centipawn differentials9. In classical analysis setups, an evaluation drop of 100 centipawns was penalized identically whether it shifted an evaluation from    to    or from    to   10. To reflect practical human play, Classification V2 translates raw engine scores into win expectations using an empirical Expected Points Model9.
The Expected Points Formulation
The Expected Points Model computes winning expectancy on a continuous scale bounded by   , where    represents a guaranteed victory,    denotes objective equality, and    signifies unavoidable defeat9. The conversion from centipawn output to expected points is dynamically parameterized against two operational variables: the absolute numerical evaluation of the position and the established rating of the player9.
When a move    transitions a position from state    to state   , the system computes the change in expected points (  ) relative to the optimal candidate continuation identified by the engine:
  

Because    reflects the maximum expectancy achievable in the position,    for all non-optimal moves9. Standard move classifications are assigned using fixed numerical intervals of expected points lost9.


Move Classification
	Lower Bound (ΔE)
	Upper Bound (ΔE)
	Theoretical Description
	Best
	  

	  

	Top engine recommendation or mathematically identical continuation9.
	Excellent
	  

	  

	Negligible reduction in overall winning probability9.
	Good
	  

	  

	Minor imprecision preserving the underlying state of the game9.
	Inaccuracy
	  

	  

	Measurable tactical or positional concession9.
	Mistake
	  

	  

	Significant regression directly compromising winning equity9.
	Blunder
	  

	  

	Severe degradation forfeiting decisive material or the game9.
	Under this model, moving from an evaluation of    down to    results in    for experienced players because the statistical likelihood of winning remains   9. As a consequence, that decision receives a Best or Excellent classification despite the 300-centipawn gap9. Conversely, in an even position (  ), dropping 300 centipawns down to    swings expected winning chances from    to nearly zero, precipitating    and triggering a Blunder classification9.
CAPS and the CAPS2 Normalization Shift
To measure game-wide precision, Chess.com deploys the Computer Aggregated Precision Score 2 (CAPS2) algorithm11. CAPS2 replaced the original CAPS (v1) scoring framework to resolve distributional anomalies that alienated casual players and complicated anti-cheat monitoring11.
The original CAPS v1 algorithm mapped precision across a normalized human range that proved excessively penalizing for amateur participants11. Because novice players frequently make natural book moves or straightforward recapture sequences, executing roughly    engine-optimal choices is common; however, CAPS v1 assigned such performances single-digit accuracy percentages, misrepresenting overall competence11. At the master level, sharp, forced variations yielded ratings of    with high regularity, causing a surge in unverified cheating allegations across the community11. Furthermore, CAPS v1 exhibited sample-size bias, penalizing brief tactical miniatures while inflating accuracy scores for protracted, fifty-move technical endgames10.
CAPS2 aligns accuracy reporting with the grading curves used in academic testing11. Under CAPS2, typical player accuracy values compress into an intuitive band between    and   11. The model evaluates each move's    in proportion to the rating of the participant, comparing move choices against an expected distribution for that specific Elo bracket rather than comparing everyone directly to an infallible machine9. Furthermore, CAPS2 mitigates distance-to-mate penalties10. If a player executes a 15-move forced ladder checkmate instead of an engine-discovered mate-in-six, the expected points model registers   , preserving a perfect accuracy metric because the practical outcome of the position remains completely secured9.
Algorithmic Logic for Brilliant and Special Classifications
Beyond the standard mathematical bands defined by   , Game Review overlays contextual heuristics to award four specialized labels: Book Move, Miss, Great Move, and Brilliant Move9.
The Book classification identifies moves cataloged within Chess.com's curated master opening database9. The Miss designation occurs when a player fails to capitalize on a blunder or mistake played by the opponent on the immediately preceding half-move, allowing the opponent to escape or retain an advantage9. The engine's threshold for recognizing a Miss scales with player rating, ensuring that tactical errors expected only of Grandmasters are not counted against lower-rated individuals9.
A Great Move (!) designates a pivotal turning point where a player finds a move critical to the game's outcome, such as converting a losing state into balance, transforming parity into an advantage, or executing the sole viable defensive resource in a complex position9.
The Mechanics of the "Brilliant Move" (!!) Algorithm
Chess.com replaced its legacy brilliant move logic—which rewarded hard-to-find computer lines at extreme search depths—with an updated framework centered strictly on viable piece sacrifices9. The platform's classification engine requires four criteria to assign a Brilliant (!!) badge to a move:
1. Sacrifice Identification: The player must volunteer a net material sacrifice, typically involving a minor piece, a major piece, or an exchange (giving up a Rook for a minor piece)13.
2. Objective Engine Soundness: The sacrifice must maintain parity or an advantage, functioning as the top engine candidate or a near-optimal alternative (  )9. Flawed sacrifices that drop the player into an objectively lost position fail this check and are categorized as Mistakes or Blunders9.
3. Competitive State Precondition: The sacrifice cannot occur in a position that was already decisively won9. If a player holds a crushing material advantage (such as being up two rooks in a    position), sacrificing further material is deemed strategically redundant and will not receive a Brilliant designation9. The game must be contested or roughly balanced prior to the move9.
4. Game Phase Constraints: In opening and middlegame positions, a sacrifice qualifies as Brilliant even if several other sound moves exist, provided the sacrifice itself is positionally viable13. In endgames, the sacrifice must be the single, unique path to victory or a draw13. If alternate winning continuations were readily available in an endgame, the move is demoted to Best or Great13.
The platform dynamically adjusts its criteria based on player rating, applying more lenient sacrifice definitions to lower-rated players9. At lower rating tiers, temporary clearance sacrifices or short tactical trades that immediately recoup material are awarded the Brilliant badge9. At master ratings, the engine requires genuine long-term material investment without straightforward tactical recovery9.
Technical Replication Barriers
Achieving deterministic parity with Chess.com's Game Review on an external system faces distinct architectural barriers:
   * Proprietary Win-Probability Transformations: While the expected points loss thresholds (   boundaries) are publicly documented, the parameterized function    that translates centipawn evaluations and player rating into win probability is proprietary9. Replicating this curve requires empirical approximation through logistic regression, which introduces classification drift on borderline move evaluations9.
   * Dynamic Rating Deviation Factors: The platform integrates both players' Glicko ratings and their underlying Rating Deviation (RD) into its accuracy and classification calculations9. Because RD fluctuates based on user inactivity and matchmaking confidence, an external system lacking access to Chess.com's live database cannot reproduce the exact dynamic weighting applied to a specific game12.
   * Multi-Threaded Asynchronous Search Non-Determinism: Stockfish instances executed across multiple CPU threads are non-deterministic due to thread scheduling, transposition table hash collisions, and Alpha-Beta pruning variations1. Evaluating identical positions to depth 22 can produce centipawn shifts (such as    versus   ) across separate runs7. These subtle differences can cross the narrow boundaries separating Best, Excellent, and Good moves2.
   * Heuristic Thresholds for Sacrifices: Chess.com does not publish the exact centipawn threshold that defines an endgame position as "completely winning" (e.g.,    versus   )9. Similarly, the quantitative rating-scaling formula used to relax sacrifice requirements for novice players remains an internal implementation detail9.
Replication Synthesis and Implementation Blueprint
An external analysis framework can achieve high structural fidelity with Chess.com's Game Review by mirroring the platform's known production configurations and rule sets:
      1. Engine and Network Setup: Deploy Stockfish 18 via native binaries and configure the full ~108 MB official NNUE evaluation file1. Browser-based WebAssembly engines running Handcrafted Evaluation should be avoided1.
      2. Search Parameters: Calibrate engine depth to match Chess.com's cloud tiers: depth 18 for Fast, depth 22 for Standard, and depth 26 for Maximum7. To minimize non-deterministic evaluation swings across multi-threaded runs, apply fixed node caps (nodes <count>) alongside search depth limits.
      3. Endgame and Opening Data: Link the engine directly to complete 7-piece Syzygy endgame tablebases6. Pre-filter opening moves against an opening tree to flag Book classifications before invoking the engine9.
      4. Expected Points Calculation: Implement a logistic win-probability function approximating the Expected Points Model:
  

Here,    is a sensitivity scaling parameter adjusted for player rating   9. From this function, compute    and apply the platform's documented cutoffs for Best, Excellent, Good, Inaccuracy, Mistake, and Blunder9. 5. Brilliant Move Identification: Scan candidate moves for net material deficits using Static Exchange Evaluation (SEE), require an engine-sound outcome (  ), check that the position was contested prior to the sacrifice (evaluation within   ), and enforce uniqueness if fewer than seven pieces remain on the board9.
This configuration will closely mirror Chess.com's Game Review outputs, though exact programmatic parity remains constrained by the platform's proprietary rating-curve parameters and the non-deterministic nature of multi-threaded engine searches1.
Works cited
      1. How do the chess engines on Chess.com work?, https://support.chess.com/en/articles/9462780-how-do-the-chess-engines-on-chess-com-work
      2. Why did my move classification change in Game Review?, https://support.chess.com/en/articles/11845102-why-did-my-move-classification-change-in-game-review
      3. What is 'Cloud Analysis' and how do I use it? | Chess.com Help Center, https://support.chess.com/en/articles/8646880-what-is-cloud-analysis-and-how-do-i-use-it
      4. What computer am I playing against? - Chess.com Help Center, https://support.chess.com/en/articles/8648809-what-computer-am-i-playing-against
      5. How To Use A Chess Engine, https://www.chess.com/article/view/how-to-use-chess-engine
      6. How can I view the tablebase on Chess.com?, https://support.chess.com/en/articles/8708949-how-can-i-view-the-tablebase-on-chess-com
      7. What is the depht of each game review ? - Chess Forums, https://www.chess.com/forum/view/game-analysis/what-is-the-depht-of-each-game-review
      8. What is analysis depth? What does it mean? | Chess.com Help Center, https://support.chess.com/en/articles/8708936-what-is-analysis-depth-what-does-it-mean
      9. How are moves classified? What is a 'blunder' or 'brilliant,' etc.?, https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc
      10. CEE CAPS2 - Chess Forums, https://www.chess.com/forum/view/site-feedback/cee-caps2
      11. How is accuracy in Analysis determined? | Chess.com Help Center, https://support.chess.com/en/articles/8708970-how-is-accuracy-in-analysis-determined
      12. https://support.chess.com/en/articles/10773754-how-is-game-rating-calculated-in-game-review
      13. How To Play A Brilliant Move In Chess, https://www.chess.com/article/view/how-to-play-a-brilliant-move
      14. How does Game Review work? | Chess.com Help Center, https://support.chess.com/en/articles/8584089-how-does-game-review-work
      15. brillant moves - Chess Forums, https://www.chess.com/forum/view/endgames/brillant-moves