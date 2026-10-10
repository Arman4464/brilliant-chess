import { players } from "@/context/analyze";
import { BISHOP, Chess, Color, KNIGHT, Move, PAWN, PieceSymbol, QUEEN, ROOK, Square, WHITE } from "chess.js";
import { SetStateAction } from "react";
import { StockfishEngine } from "./engineWorker";

export type { StockfishEngine };

export type result = '1-0' | '0-1' | '1/2-1/2' | '*' | ''

export type position = ({
    square: Square,
    type: PieceSymbol,
    color: Color,
} | null)[][]

export type square = {
    row: number,
    col: number,
}

export type moveRating = "forced" | "brilliant" | "great" | "best" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "miss" | "blunder"

export interface move {
    fen: string,
    movement?: square[],
    bestMove?: square[],
    bestMoveSan?: string,
    moveRating?: moveRating,
    comment?: string,
    color: Color,
    playedBy?: Color,
    capture?: PieceSymbol,
    castle?: 'k' | 'q',
    san?: string,
    sacrifice?: boolean,
    previousStaticEvals?: string[][],
    evaluation?: string[],
    deltaE?: number,
    accuracy?: number,
    scoreBefore?: number,
    scoreAfter?: number,
}

export interface openings {
    [key: string]: string,
}

const COMMENTS = {
    brilliant: [
        'You found a brilliant way to sacrifice a piece.',
        'This sacrifice showcases a deep understanding of the position.',
        'A bold and exceptional sacrifice to gain a strategic edge.',
    ],
    great: [
        "You capitalized on your opponent's mistake effectively.",
        "This move takes full advantage of your opponent's error.",
        "A strong response to punish your opponent's oversight.",
    ],
    best: [
        'This has been the best move in this position.',
        'This was the most optimal move you could play here.',
        'The most precise and effective move for this scenario.',
    ],
    excellent: [
        'This was not the absolute best move, but it is just as strong.',
        'An excellent move that fits the demands of the position perfectly. It is not the best though.',
        'A top-tier choice, even if not the single best move.',
    ],
    good: [
        'This is not among the best moves, but it is still acceptable.',
        'An acceptable move, but there were better options.',
        'This move works, but it misses stronger alternatives.',
    ],
    inaccuracy: [
        'This move causes you to lose some advantage.',
        'This move weakens your overall position.',
        'An avoidable slip that leads to a worse situation.',
    ],
    mistake: [
        'This move gives your opponent an opportunity to take the advantage.',
        'A mistake that compromises your winning equity.',
        'An oversight that allows your opponent to equalize or gain ground.',
    ],
    miss: [
        "You missed an opportunity to capitalize on your opponent's mistake.",
        'A missed tactical opportunity that lets your opponent escape.',
        'An opportunity to punish your opponent was overlooked.',
    ],
    blunder: [
        'This move loses significant advantage.',
        'This move significantly worsens your position.',
        'This move severely harms your position.',
    ],
    mate: [
        'Delivering checkmate is always a satisfying move.',
        'Checkmating your opponent is the ultimate goal.',
        'A decisive and final move to end the game.',
    ],
    mateIn: [
        'This is the right move to force an eventual checkmate.',
        'A precise move that guarantees a checkmate in the near future.',
        'This move sets up an unstoppable sequence to deliver checkmate.',
    ],
    delayMate: [
        'This move delays a checkmate, but your opponent is still being checkmated.',
        "You slowed down the checkmate sequence, but it's still guaranteed.",
        'A move that postpones the unavoidable checkmate you are delivering.',
    ],
    advanceMate: [
        "This decision shortens the path to your opponent's victory.",
        'You hastened the process of being checkmated with this move.',
        'This move brings your opponent closer to delivering checkmate.',
    ],
    loseAdvantage: [
        'This move causes you to lose the advantage you had.',
        'A costly error that sacrifices your winning edge.',
        'This move shifts the position from advantageous to equal or worse.',
    ],
    giveAdvantage: [
        'This move turns an equal position into a losing one.',
        'A mistake that hands the advantage to your opponent.',
        'This move creates a clear advantage for your opponent.',
    ],
    gettingMated: [
        'This move leads to an eventual forced checkmate by your opponent.',
        'A fatal error that guarantees your opponent will checkmate you.',
        'This move sets up an inevitable checkmate against you.',
    ],
    missMate: [
        'You missed an opportunity to force a checkmate, allowing your opponent to escape.',
        'A chance to secure a decisive checkmate was overlooked with this move.',
        'This move lets your opponent avoid a checkmate you could have forced.',
    ],
    missAdvantage: [
        'You missed an opportunity to gain an advantage.',
        'A key chance to improve your position was lost.',
        'This move overlooks a way to strengthen your position.',
    ],
    forced: [
        'There were no alternatives; this was the only possible move.',
        'You had no choice but to play this move.',
        'The situation left you with just one legal option, and this was it.',
    ]
}

async function setHashValue(stockfish: StockfishEngine | Worker, hash: number) {
    let lastHash = hash

    setTimeout(() => {
        stockfish.removeEventListener("error", reduceHash)
    }, 2000)

    function reduceHash() {
        const hash = lastHash - 50

        stockfish.postMessage(`setoption name Hash value ${hash}`)

        lastHash = hash

        if (lastHash - 50 < 0) {
            stockfish.removeEventListener("error", reduceHash)
        }
    }

    stockfish.addEventListener("error", reduceHash)

    stockfish.postMessage(`setoption name Hash value ${hash}`)
}

export async function prepareStockfish(stockfish: StockfishEngine | Worker, threads: number, hash: number) {
    await waitTillReady(stockfish)

    stockfish.postMessage("uci")
    stockfish.postMessage(`setoption name Threads value ${threads}`)
    await setHashValue(stockfish, hash)
}

export function invertColor(color: Color): Color {
    return color === 'w' ? 'b' : 'w'
}

function getRandomNumber(number: number) {
    return Math.floor(Math.random() * number)
}

function getPlayers(headers: Record<string, string>) {
    const NO_NAME = 'Unknown'
    const NO_ELO = 'NOELO'

    const whiteName = headers.White ?? NO_NAME
    const blackName = headers.Black ?? NO_NAME

    const whiteElo = headers.WhiteElo ?? NO_ELO
    const blackElo = headers.BlackElo ?? NO_ELO

    return [{ name: whiteName, elo: whiteElo }, { name: blackName, elo: blackElo }]
}

function getTime(headers: Record<string, string>) {
    const seconds = headers.TimeControl ?? "0"
    return Number(seconds)
}

function getResult(headers: Record<string, string>, pgn: string): result {
    if (headers.Result) return headers.Result as result
    return (pgn.split(' ').pop() ?? "") as result
}

export function formatSquare(square: string): square {
    const letters = 'abcdefgh'.split('')

    const col = letters.indexOf(square[0])
    const row = Number(square[1]) - 1

    return { col, row }
}

export function deformatSquare(square: square) {
    const letters = 'abcdefgh'.split('')

    return `${letters[square.col]}${square.row + 1}`
}

function formatMove(evaluation: string) {
    const line = evaluation.split('\n').filter(line => line.startsWith('bestmove'))[0]
    const move = line?.split(/\s+/)[1]
    if (move === '(none)') return { }

    const movement = move ? [move.slice(0, 2), move.slice(2, 4)].map(square => {
        const { col, row } = formatSquare(square)

        return { col, row }
    }) : undefined

    const coronation = move ? move[4] as PieceSymbol : undefined

    return { movement, coronation }
}

export function formatStaticEval(evaluation: string): string[] | undefined {
    const lines = evaluation.split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim()
        if (line.startsWith('info') && line.includes(' score ')) {
            const fields = line.split(/\s+/)
            const scoreIdx = fields.indexOf('score')
            if (scoreIdx !== -1 && scoreIdx + 2 < fields.length) {
                const type = fields[scoreIdx + 1]
                const val = fields[scoreIdx + 2]
                if (type === 'cp' || type === 'mate') {
                    return [type, val]
                }
            }
        }
    }
    return undefined
}

export function evalToCentipawns(evalTokens: string[] | undefined): number {
    if (!evalTokens || evalTokens.length < 2) return 0
    const type = evalTokens[0]
    const val = Number(evalTokens[1])
    if (isNaN(val)) return 0

    if (type === 'cp') {
        return val
    }
    if (type === 'mate') {
        if (val > 0) return 100000 - val * 100
        if (val < 0) return -100000 - val * 100
        return 100000
    }
    return 0
}

export function winExpectancy(centipawns: number, rating: number = 1500): number {
    if (centipawns >= 50000) return 1.0
    if (centipawns <= -50000) return 0.0

    // Rating scaling parameter s(R) calibrated against official review data
    // P(win) = 1 / (1 + 10^(-cp / (400 * s(R))))
    const s = Math.max(0.60, Math.min(1.40, 0.65 + 0.25 * (rating / 1000)))
    return 1.0 / (1.0 + Math.pow(10, -centipawns / (400 * s)))
}

function normalizeCp(score: number): number {
    if (score >= 50000) {
        const moves = Math.max(1, Math.round((100000 - score) / 100))
        return 2000 + Math.max(0, 500 - moves * 20)
    }
    if (score <= -50000) {
        const moves = Math.max(1, Math.round((100000 - Math.abs(score)) / 100))
        return -2000 - Math.max(0, 500 - moves * 20)
    }
    return score
}

export function caps2MoveAccuracy(
    deltaE: number,
    rating: number = 1500,
    deltaCp: number = 0,
    playerScoreBefore: number = 0,
    playerScoreAfter: number = 0
): number {
    if (deltaE <= 0.001 && deltaCp <= 10) return 100

    // 1. Missed forced checkmate sequence: player had forced mate and let it slip
    if (playerScoreBefore >= 99000 && playerScoreAfter < 99000) {
        return 18.0
    }

    // 2. Allowed forced checkmate from non-mating position: blundered into mate
    if (playerScoreBefore > -90000 && playerScoreAfter <= -90000) {
        return 0.0
    }

    const rFactor = Math.pow(rating / 1000, -0.2)
    const normBefore = normalizeCp(playerScoreBefore)
    const normAfter = normalizeCp(playerScoreAfter)
    const dCp = Math.max(0, normBefore - normAfter)

    const winDiscount = normAfter > 400 && normBefore > 400 ? 0.35 : (normBefore > 300 && normAfter < 200 ? 1.5 : 1.0)
    const lossDiscount = normBefore < -200 ? Math.max(0.40, 1.0 - Math.abs(normBefore + 200) / 1500) : 1.0

    const effectiveCpLoss = (Math.max(0, dCp - 10) / 100) * 4.5 * winDiscount * lossDiscount
    const effectiveWinLoss = (deltaE * 100) * 1.0
    const totalLoss = effectiveWinLoss + effectiveCpLoss

    const k = 0.055
    const raw = 103.1668 * Math.exp(-k * totalLoss * rFactor) - 3.1668
    return Math.max(0, Math.min(100, Math.round(raw * 10) / 10))
}

export function getPieceCount(chess: Chess): number {
    let count = 0
    const board = chess.board()
    for (const row of board) {
        for (const sq of row) {
            if (sq && sq.type !== 'k') count++
        }
    }
    return count
}

async function getBestMove(program: StockfishEngine | Worker, depth: number, signal: AbortSignal): Promise<{ bestMove: square[], coronation?: PieceSymbol, staticEval: string[] }> {
    program.postMessage(`go depth ${depth}`)

    let staticEval: string[]
    return new Promise((resolve, reject) => {
        function cleanUp() {
            program.removeEventListener('message', readMessage)
            signal?.removeEventListener('abort', handleAbort)
        }

        function readMessage(e: MessageEvent) {
            const line = e.data

            const { movement: bestMove, coronation } = formatMove(line)
            staticEval = formatStaticEval(line) ?? staticEval

            if (bestMove) {
                cleanUp()
                resolve({ bestMove, coronation, staticEval })
            }
        }

        function handleAbort() {
            cleanUp()
            reject(new Error('canceled'))
        }

        signal.addEventListener('abort', handleAbort)

        program.addEventListener('message', readMessage)
    })
}

export function getMoveRating(
    deltaE: number,
    isBestMove: boolean,
    isBookMove: boolean,
    isForced: boolean,
    isSacrifice: boolean,
    opponentPreviousRating: moveRating | undefined,
    playerScoreBefore: number,
    playerScoreAfter: number,
    playerBeforeE: number,
    playerAfterE: number,
    piecesCount: number,
    bookComment?: string,
    playerRating: number = 1500,
    san?: string
): { comment: string, moveRating: moveRating } {
    const commentNumber = getRandomNumber(3)
    const deltaCp = Math.max(0, playerScoreBefore - playerScoreAfter)

    // 1. Opening book move
    if (isBookMove) {
        return { moveRating: 'book', comment: bookComment || 'This is a standard book move.' }
    }

    // 2. Forced move (single legal option available)
    if (isForced) {
        return { moveRating: 'forced', comment: COMMENTS.forced[commentNumber] }
    }

    // 3. Brilliant Move (!!) - 4 Strict Chess.com Criteria
    const isContestedBefore = playerScoreBefore <= 350 && playerBeforeE <= 0.88
    const isSoundSacrifice = deltaE <= 0.025 && playerAfterE >= 0.42
    const satisfiesEndgame = piecesCount >= 7 || isBestMove

    if (isSacrifice && isSoundSacrifice && isContestedBefore && satisfiesEndgame) {
        return { moveRating: 'brilliant', comment: COMMENTS.brilliant[commentNumber] }
    }

    // 4. Miss (X) - Overlooked forced mate, failed to punish opponent blunder, or blew decisive lead
    const missedMate = playerScoreBefore >= 90000 && playerScoreAfter < 90000
    const blewWinningAdvantage = playerScoreBefore >= 250 && playerScoreAfter <= 50 && deltaCp >= 220 && !isBestMove
    const failedToPunish = (opponentPreviousRating === 'mistake' || opponentPreviousRating === 'blunder' || opponentPreviousRating === 'miss') && deltaCp >= 110 && playerScoreAfter < 120 && !isBestMove
    if (missedMate || blewWinningAdvantage || failedToPunish) {
        return { moveRating: 'miss', comment: COMMENTS.missAdvantage[commentNumber] }
    }

    // 5. Great Move (!) - Rare turning point or critical tactical conversion
    const foundMateSequence = playerScoreAfter >= 99000 && playerScoreBefore < 50000 && playerScoreBefore <= 450
    const miraculousSave = playerScoreBefore <= -180 && playerScoreAfter >= -30
    const tacticalPunish = (opponentPreviousRating === 'blunder' || opponentPreviousRating === 'miss') &&
        playerScoreBefore <= 0 && playerScoreAfter >= 150
    if (isBestMove && !isSacrifice && (foundMateSequence || miraculousSave || tacticalPunish)) {
        return { moveRating: 'great', comment: COMMENTS.great[commentNumber] }
    }

    // 6. Best Move: Engine's top choice
    if (isBestMove || playerScoreAfter >= 99990) {
        if (playerScoreAfter >= 50000) {
            return { moveRating: 'best', comment: COMMENTS.mate[commentNumber] }
        }
        return { moveRating: 'best', comment: COMMENTS.best[commentNumber] }
    }

    // 7. Checkmate sequence handling (mitigate distance-to-mate penalties)
    if (playerScoreBefore >= 90000 && playerScoreAfter >= 90000) {
        return { moveRating: 'excellent', comment: COMMENTS.excellent[commentNumber] }
    }
    if (playerScoreBefore <= -90000 && playerScoreAfter <= -90000) {
        if (deltaCp > 250) return { moveRating: 'inaccuracy', comment: COMMENTS.inaccuracy[commentNumber] }
        return { moveRating: 'excellent', comment: COMMENTS.excellent[commentNumber] }
    }

    // 8. Already severely lost positions: cannot blunder when already hopelessly lost
    if (playerScoreBefore <= -300) {
        if (deltaE <= 0.001) {
            return { moveRating: 'best', comment: COMMENTS.best[commentNumber] }
        }
        if (playerScoreAfter <= -90000 && playerScoreBefore > -90000) {
            return { moveRating: 'inaccuracy', comment: COMMENTS.inaccuracy[commentNumber] }
        }
        if (deltaCp >= 200 || deltaE >= 0.08) return { moveRating: 'inaccuracy', comment: COMMENTS.inaccuracy[commentNumber] }
        if (deltaCp >= 60 || deltaE >= 0.03) return { moveRating: 'good', comment: COMMENTS.good[commentNumber] }
        return { moveRating: 'excellent', comment: COMMENTS.excellent[commentNumber] }
    }

    // 9. Blunder: Massive loss of winning equity or blundering directly into mate
    if (playerScoreBefore > -90000 && playerScoreAfter <= -90000) {
        return { moveRating: 'blunder', comment: COMMENTS.blunder[commentNumber] }
    }
    if ((deltaE >= 0.30 || deltaCp >= 280) && playerScoreBefore > -250 && playerScoreAfter <= -150) {
        return { moveRating: 'blunder', comment: COMMENTS.blunder[commentNumber] }
    }

    // 10. Mistake: Significant regression into losing position or throwing away an advantage
    if (((deltaE >= 0.16 && playerScoreAfter < 120) || deltaCp >= 150 || (playerScoreBefore >= 180 && playerScoreAfter <= -30)) && playerScoreAfter < 200) {
        return { moveRating: 'mistake', comment: COMMENTS.giveAdvantage[commentNumber] }
    }

    // 11. Inaccuracy: Measurable tactical or positional concession
    if ((deltaE >= 0.085 || deltaCp >= 85) && playerScoreAfter < 350) {
        return { moveRating: 'inaccuracy', comment: COMMENTS.inaccuracy[commentNumber] }
    }

    // 12. Good: Minor imprecision preserving underlying game state
    if (deltaE >= 0.038 || deltaCp >= 38) {
        return { moveRating: 'good', comment: COMMENTS.good[commentNumber] }
    }

    // 13. Excellent: Negligible reduction in winning equity
    return { moveRating: 'excellent', comment: COMMENTS.excellent[commentNumber] }
}

async function analyze(program: StockfishEngine | Worker, fen: string, depth: number, signal: AbortSignal) {
    program.postMessage(`position fen ${fen}`)

    try {
        const { bestMove, staticEval, coronation } = await getBestMove(program, depth, signal)
        return { bestMove, staticEval, bestMoveCoronation: coronation }
    } catch {
        throw new Error('cancelled')
    }
}

function getAttackersDefenders(chess: Chess, color: Color, to: Square) {
    const attackers = chess.attackers(to, invertColor(color))
    const legalAttackers = attackers.filter(attacker => chess.moves({ verbose: true }).findIndex(move => move.from === attacker && move.to === to) !== -1)
    const legalAttackersPieces = legalAttackers.map(attacker => chess.get(attacker))

    let defenders, legalDefenders, legalDefendersPieces
    if (attackers.length === 1) {
        const testChess = new Chess(chess.fen())
        try {
            testChess.move({ from: attackers[0], to })
        } catch { }

        defenders = testChess.attackers(to, color)
        legalDefenders = defenders.filter(defender => {
            if (testChess.moves({ verbose: true }).findIndex(move => move.from === defender && move.to === to) === -1) {
                return false
            }
            return true
        })
        legalDefendersPieces = legalDefenders.map(defender => chess.get(defender))
    } else {
        defenders = chess.attackers(to, color)
        legalDefenders = defenders.filter(defender => {
            for (const attacker of legalAttackers) {
                const testChess = new Chess(chess.fen())
                try {
                    testChess.move({ from: attacker, to: to })
                } catch { }
    
                if (testChess.moves({ verbose: true }).findIndex(move => move.from === defender && move.to === to) === -1) {
                    return false
                }
            }
            return true
        })
        legalDefendersPieces = legalDefenders.map(defender => chess.get(defender))
    }

    return { attackers: { squares: legalAttackers, pieces: legalAttackersPieces, length: legalAttackers.length }, defenders: { squares: legalDefenders, pieces: legalDefendersPieces, length: legalDefenders.length } }
}

function couldBeSaved(chess: Chess, square: Square, color: Color) {
    if (!chess.attackers(square, color).length) {
        for (const move of chess.moves({ verbose: true })) {
            if (move.from !== square) return true
        }
    } else {
        for (const move of chess.moves({ verbose: true, square: square })) {
            const testChess = new Chess(move.after)
            if (!testChess.attackers(move.to, color).length) return true
        }
    }

    return false
}

export function isSacrifice(move: Move) {
    const chess = new Chess(move.after)
    const chessBefore = new Chess(move.before)

    const sacrifying: {
        square: Square,
        type: PieceSymbol,
        color: Color,
    }[] = []

    const board = chess.board()
    for (const row of board) {
        for (const square of row) {
            if (!square || square.type === PAWN) continue
            if (square.color !== move.color) continue

            const { attackers, defenders } = getAttackersDefenders(chess, move.color, square.square)

            if (!defenders.length && attackers.length && (!move.captured || move.captured === PAWN)) {
                sacrifying.push(square)
                continue
            }
            if ((square.type === KNIGHT || square.type === BISHOP) && (!move.captured || move.captured === PAWN) && attackers.pieces.findIndex(piece => piece?.type === PAWN) !== -1) {
                sacrifying.push(square)
                continue
            }
            if (square.type === ROOK && attackers.length && (move.captured !== ROOK && move.captured !== QUEEN) && !(attackers.length === 1 && (attackers.pieces[0]?.type === QUEEN || attackers.pieces[0]?.type === ROOK) && defenders.length) && !(defenders.length && (move.captured === KNIGHT || move.captured === BISHOP))) {
                sacrifying.push(square)
                continue
            }
            if (square.type === QUEEN && attackers.length && move.captured !== QUEEN && !(attackers.length === 1 && attackers.pieces[0]?.type === QUEEN && defenders.length) && !(attackers.length === 1 && attackers.pieces[0]?.type === ROOK && move.captured === ROOK && defenders.length)) {
                sacrifying.push(square)
                continue
            }
        }
    }

    for (const square of sacrifying) {
        const beforeSquare = chessBefore.get(square.square)?.color === chess.get(square.square)?.color && chessBefore.get(square.square)?.type === chess.get(square.square)?.type ? square.square : move.from

        if (couldBeSaved(chessBefore, beforeSquare, invertColor(move.color))) return true
    }

    return false
}

function isForced(move: Move) {
    const chess = new Chess(move.before)

    return chess.moves().length === 1
}

function cleanStockfish(stockfish: StockfishEngine | Worker) {
    stockfish.postMessage("stop")
    stockfish.postMessage("ucinewgame")
}

async function waitTillReady(engine: StockfishEngine | Worker, signal?: AbortSignal) {
    return new Promise((resolve, reject) => {
        function cleanUp() {
            engine.removeEventListener('message', isReadyOk)
            signal?.removeEventListener('abort', handleAbort)
        }

        function isReadyOk(e: MessageEvent) {
            if (e.data === 'readyok') {
                cleanUp()
                resolve(true)
            }
        }

        function handleAbort() {
            cleanUp()
            reject(new Error('canceled'))
        }

        signal?.addEventListener('abort', handleAbort)

        engine.addEventListener('message', isReadyOk)
        engine.postMessage('isready')
    })
}

export function clearPgn(pgn: string) {
    // remove comments
    return pgn.replace(/^%.*/gm, '')
}

export function moveToSan(move: square[], coronation: PieceSymbol | undefined, fen: string) {
    if (!move.length) return ""

    try {
        const chess = new Chess(fen)
        const moveObject = chess.move({ from: deformatSquare(move[0]), to: deformatSquare(move[1]), promotion: coronation })
        return moveObject.san
    } catch {
        return ""
    }
}

export function getCastle(san: string) {
    return san === 'O-O' ? 'k' : san === 'O-O-O' ? 'q' : undefined
}

export async function parseMove(
    stockfish: StockfishEngine | Worker,
    depth: number,
    move: Move,
    chess: Chess,
    previousStaticEvals: string[][],
    previousBestMoveSan: string | undefined,
    previousSacrifice: boolean,
    openings: openings,
    handleAbort: () => void,
    signal: AbortSignal,
    opponentRating?: moveRating,
    playerRating: number = 1500
): Promise<move> {
    if (signal.aborted) handleAbort()
    const movement: square[] = [move.from, move.to].map(square => {
        const { col, row } = formatSquare(square)

        return { col, row }
    })

    const fen = move.after
    chess.load(fen)

    const playerColor = move.color
    const color = invertColor(playerColor)
    const capture = move.captured
    const san = move.san

    const castle = getCastle(move.san)

    let sacrifice, staticEval: string[], bestMove: square[] | undefined, forced, bestMoveCoronation
    if (chess.isCheckmate()) {
        sacrifice = false
        staticEval = ["mate", "0"]
        bestMove = undefined
        forced = false
        bestMoveCoronation = undefined
    } else {
        sacrifice = move.promotion ? false : isSacrifice(move)

        try {
            ({ staticEval, bestMove, bestMoveCoronation } = await analyze(stockfish, move.after, depth, signal))
        } catch {
            handleAbort()
            bestMove = undefined
            staticEval = []
            bestMoveCoronation = undefined
        }

        if (signal.aborted) handleAbort()
        forced = isForced(move)
    }

    // Evaluation before the move:
    // In move.before, playerColor was to move. Stockfish evaluated it from playerColor's perspective.
    const beforeTokens = previousStaticEvals[0]
    const playerScoreBefore = evalToCentipawns(beforeTokens)

    // Evaluation after the move:
    // In move.after, opponent (color) is to move. Stockfish evaluates it from opponent's perspective.
    // So from the player's perspective, it is the negative (or checkmate delivered).
    const playerScoreAfter = chess.isCheckmate() ? 100000 : -evalToCentipawns(staticEval)

    // Expected Points calculation (logistic win probability dynamically scaled by rating):
    const pRating = playerRating || 1500
    const playerBeforeE = winExpectancy(playerScoreBefore, pRating)
    const playerAfterE = winExpectancy(playerScoreAfter, pRating)
    const deltaE = Math.max(0, playerBeforeE - playerAfterE)

    // Check if book move
    const bookComment = openings[fen]
    const isBookMove = Boolean(bookComment)

    // Best move comparison
    const isBestMove = Boolean(previousBestMoveSan && previousBestMoveSan === move.san)
    const piecesCount = getPieceCount(chess)

    const { moveRating, comment } = getMoveRating(
        deltaE,
        isBestMove,
        isBookMove,
        forced,
        Boolean(sacrifice),
        opponentRating,
        playerScoreBefore,
        playerScoreAfter,
        playerBeforeE,
        playerAfterE,
        piecesCount,
        bookComment,
        pRating,
        san
    )
    const deltaCp = Math.max(0, playerScoreBefore - playerScoreAfter)
    let accuracy = isBookMove || forced ? 100 : caps2MoveAccuracy(deltaE, pRating, deltaCp, playerScoreBefore, playerScoreAfter)
    if (moveRating === 'best' || moveRating === 'great' || moveRating === 'brilliant') {
        accuracy = 100
    } else if (moveRating === 'excellent') {
        accuracy = Math.max(accuracy, 93.0)
    } else if (moveRating === 'good') {
        accuracy = Math.min(accuracy, 85.0)
    } else if (moveRating === 'inaccuracy') {
        accuracy = Math.min(accuracy, 60.0)
    } else if (moveRating === 'mistake') {
        accuracy = Math.min(accuracy, 30.0)
    } else if (moveRating === 'miss') {
        accuracy = Math.min(accuracy, 18.0)
    } else if (moveRating === 'blunder') {
        accuracy = Math.min(accuracy, 0.0)
    }

    // Evaluation formatted for display (White's perspective):
    const whiteEvalCp = playerColor === 'w' ? playerScoreAfter : -playerScoreAfter
    let displayEval: string[]
    if (Math.abs(whiteEvalCp) >= 50000) {
        const movesToMate = Math.max(1, Math.round((100000 - Math.abs(whiteEvalCp)) / 100))
        displayEval = ['mate', whiteEvalCp > 0 ? String(movesToMate) : String(-movesToMate)]
    } else {
        displayEval = ['cp', String(whiteEvalCp)]
    }

    if (chess.isGameOver()) bestMove = undefined

    const bestMoveSan = bestMove ? moveToSan(bestMove, bestMoveCoronation, fen) : undefined

    const newPreviousStaticEval = [staticEval, ...previousStaticEvals]

    return {
        color,
        playedBy: playerColor,
        capture,
        san,
        castle,
        moveRating,
        comment,
        bestMove,
        bestMoveSan,
        fen,
        sacrifice,
        movement,
        previousStaticEvals: newPreviousStaticEval,
        evaluation: displayEval,
        deltaE,
        accuracy,
        scoreBefore: playerScoreBefore,
        scoreAfter: playerScoreAfter,
    }
}

export async function parsePosition(stockfish: StockfishEngine | Worker, chess: Chess, depth: number, signal: AbortSignal, handleAbort: () => void): Promise<move> {
    const fen = chess.fen()
    const color = chess.turn()

    let analyzeObject
    try {
        analyzeObject = await analyze(stockfish, fen, depth, signal)
    } catch {
        handleAbort()
        analyzeObject = { bestMove: [], staticEval: [] }
    }

    if (signal.aborted) handleAbort()

    const { bestMove, staticEval, bestMoveCoronation } = analyzeObject

    const bestMoveSan = moveToSan(bestMove, bestMoveCoronation, fen)

    const previousStaticEvals = [staticEval]

    const whiteEvalCp = color === 'w' ? evalToCentipawns(staticEval) : -evalToCentipawns(staticEval)
    let displayEval: string[]
    if (Math.abs(whiteEvalCp) >= 50000) {
        const movesToMate = Math.max(1, Math.round((100000 - Math.abs(whiteEvalCp)) / 100))
        displayEval = ['mate', whiteEvalCp > 0 ? String(movesToMate) : String(-movesToMate)]
    } else {
        displayEval = ['cp', String(whiteEvalCp)]
    }

    return {
        fen,
        bestMove,
        bestMoveSan,
        color,
        previousStaticEvals,
        evaluation: displayEval,
    }
}

export function parsePGN(
    stockfish: StockfishEngine | Worker,
    rawPgn: string,
    depth: number,
    openings: openings,
    setProgress: React.Dispatch<SetStateAction<number>>,
    signal: AbortSignal,
    performanceRatings?: { white?: number, black?: number }
): Promise<{ metadata: { time: number, players: players, result: result }, moves: move[] }> {
    return new Promise(async (resolve, reject) => {
        function handleAbort() {
            reject(new Error('canceled'))
            signal.removeEventListener('abort', handleAbort)
            setProgress(0)
        }

        signal.addEventListener('abort', handleAbort)

        const chess = new Chess()

        const pgn = clearPgn(rawPgn)

        try {
            chess.loadPgn(pgn)
        } catch {
            reject(new Error('pgn'))
        }

        const headers = chess.header()

        const players = getPlayers(headers)
        if (performanceRatings) {
            if (performanceRatings.white && players[0]) players[0].performanceRating = performanceRatings.white
            if (performanceRatings.black && players[1]) players[1].performanceRating = performanceRatings.black
        }
        const time = getTime(headers)
        const result = getResult(headers, pgn)

        const history = chess.history({ verbose: true })

        const totalMoves = history.length
        let progress = 0

        const metadata = { players, time, result }

        const moves: move[] = []

        cleanStockfish(stockfish)
        try {
            await waitTillReady(stockfish, signal)
        } catch {
            handleAbort()
        }

        if (signal.aborted) handleAbort()

        const whiteElo = parseInt(players[0]?.elo, 10) || 1500
        const blackElo = parseInt(players[1]?.elo, 10) || 1500

        // Fast-path: query authentic server review pipeline (CEE + Stockfish) if available
        try {
            const apiRes = await fetch('/api/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pgn,
                    moves: history.map(h => ({ san: h.san, lan: h.from + h.to + (h.promotion || ''), color: h.color === 'w' ? 'white' : 'black' })),
                    whiteElo,
                    blackElo,
                    depth: 18,
                    multiPv: 2
                }),
                signal
            });
            if (apiRes.ok) {
                const reviewData = await apiRes.json();
                console.log('[Stockfish Engine] Authenticated CEE Review Data received:', reviewData);
                if (reviewData.success && reviewData.moves && reviewData.moves.length === totalMoves) {
                    const firstMove = history[0];
                    const startFen = firstMove ? firstMove.before : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
                    const initBestLan = reviewData.moves[0]?.bestMoveLan || 'e2e4';
                    const initBestMove = [initBestLan.slice(0, 2), initBestLan.slice(2, 4)].map(formatSquare);

                    moves.push({
                        fen: startFen,
                        color: 'w',
                        bestMove: initBestMove,
                        bestMoveSan: initBestLan
                    });

                    for (let i = 0; i < history.length; i++) {
                        const hMove = history[i];
                        const sMove = reviewData.moves[i];
                        const mFrom = formatSquare(hMove.from);
                        const mTo = formatSquare(hMove.to);
                        const bestLan = sMove?.bestMoveLan || (hMove.from + hMove.to);
                        const bestSquare = [bestLan.slice(0, 2), bestLan.slice(2, 4)].map(formatSquare);

                        moves.push({
                            fen: hMove.after,
                            movement: [mFrom, mTo],
                            bestMove: bestSquare,
                            bestMoveSan: bestLan,
                            moveRating: (sMove?.classification || 'best') as moveRating,
                            comment: sMove?.comment || '',
                            color: invertColor(hMove.color),
                            playedBy: hMove.color,
                            capture: hMove.captured,
                            castle: getCastle(hMove.san),
                            san: hMove.san,
                            accuracy: sMove?.caps2 !== undefined ? sMove.caps2 : 100,
                            deltaE: sMove?.difference || 0,
                            scoreAfter: sMove?.eval ? parseFloat(sMove.eval) * 100 : 0
                        });
                        setProgress(((i + 1) / totalMoves) * 100);
                    }

                    if (reviewData.performanceRatings) {
                        if (players[0]) players[0].performanceRating = reviewData.performanceRatings.white;
                        if (players[1]) players[1].performanceRating = reviewData.performanceRatings.black;
                    }

                    if (reviewData.accuracies) {
                        if (players[0]) players[0].accuracy = reviewData.accuracies.white;
                        if (players[1]) players[1].accuracy = reviewData.accuracies.black;
                        (metadata as any).accuracies = reviewData.accuracies;
                    }

                    if (reviewData.opening) {
                        (metadata as any).opening = reviewData.opening;
                    }

                    resolve({ metadata, moves });
                    return;
                }
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                handleAbort();
                return;
            }
            console.log('[Stockfish Engine] Server review fallback to local engine:', err?.message);
        }

        let moveNumber = 0, previousBestMoveSan: string | undefined, previousSacrifice = false, previousStaticEvals: string[][] = []
        let lastWhiteRating: moveRating | undefined
        let lastBlackRating: moveRating | undefined
        for (const move of history) {
            if (moveNumber === 0) {
                chess.load(move.before)
                const pos = await parsePosition(stockfish, chess, depth, signal, handleAbort)

                if (!pos.previousStaticEvals) return

                moves.push(pos)

                previousStaticEvals = pos.previousStaticEvals
                previousSacrifice = false
                previousBestMoveSan = pos.bestMoveSan
            }

            const isWhite = move.color === 'w'
            const oppRating = isWhite ? lastBlackRating : lastWhiteRating
            const pRating = isWhite ? whiteElo : blackElo

            const analyzedMove = await parseMove(
                stockfish,
                depth,
                move,
                chess,
                previousStaticEvals,
                previousBestMoveSan,
                previousSacrifice,
                openings,
                handleAbort,
                signal,
                oppRating,
                pRating
            )

            moves.push(analyzedMove)

            if (isWhite) {
                lastWhiteRating = analyzedMove.moveRating
            } else {
                lastBlackRating = analyzedMove.moveRating
            }

            if (!analyzedMove.previousStaticEvals || analyzedMove.sacrifice === undefined) continue

            previousStaticEvals = analyzedMove.previousStaticEvals
            previousBestMoveSan = analyzedMove.bestMoveSan

            moveNumber++
            previousSacrifice = analyzedMove.sacrifice
    
            progress++
            setProgress((progress / totalMoves) * 100)
        }

        resolve({ metadata, moves })
    })
}