import { players } from "@/context/analyze";
import { BISHOP, Chess, Color, KNIGHT, Move, PAWN, PieceSymbol, QUEEN, ROOK, Square, WHITE } from "chess.js";
import { SetStateAction } from "react";
import { StockfishEngine } from "./engineWorker";
import {
    MoveClassification,
    classifyMove,
    calculateDeltaE,
    winExpectancy,
    caps2MoveAccuracy
} from "./classificationTree";

export type { StockfishEngine };
export { winExpectancy, caps2MoveAccuracy, calculateDeltaE, classifyMove };

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

export type moveRating = MoveClassification;

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
    stockfish.postMessage("setoption name MultiPV value 2")
    await setHashValue(stockfish, hash)
}

export function invertColor(color: Color): Color {
    return color === 'w' ? 'b' : 'w'
}

function getRandomNumber(number: number) {
    return Math.floor(Math.random() * number)
}

function getPlayers(headers: Record<string, string | null | undefined>): players {
    const NO_NAME = 'Unknown'
    const NO_ELO = 'NOELO'

    const whiteName = headers.White ?? NO_NAME
    const blackName = headers.Black ?? NO_NAME

    const whiteElo = headers.WhiteElo ?? NO_ELO
    const blackElo = headers.BlackElo ?? NO_ELO

    return [{ name: whiteName, elo: whiteElo }, { name: blackName, elo: blackElo }]
}

function getTime(headers: Record<string, string | null | undefined>) {
    const seconds = headers.TimeControl ?? "0"
    return Number(seconds)
}

function getResult(headers: Record<string, string | null | undefined>, pgn: string): result {
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

export function formatMultiPvEvals(evaluation: string): { pv1?: string[], pv2?: string[] } {
    const lines = evaluation.split('\n')
    let pv1: string[] | undefined
    let pv2: string[] | undefined
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim()
        if (line.startsWith('info') && line.includes(' score ')) {
            const fields = line.split(/\s+/)
            const scoreIdx = fields.indexOf('score')
            const mpvIdx = fields.indexOf('multipv')
            const mpvNum = mpvIdx !== -1 && mpvIdx + 1 < fields.length ? Number(fields[mpvIdx + 1]) : 1
            if (scoreIdx !== -1 && scoreIdx + 2 < fields.length) {
                const type = fields[scoreIdx + 1]
                const val = fields[scoreIdx + 2]
                if (type === 'cp' || type === 'mate') {
                    if (mpvNum === 1 && !pv1) {
                        pv1 = [type, val]
                    } else if (mpvNum === 2 && !pv2) {
                        pv2 = [type, val]
                    }
                }
            }
        }
        if (pv1 && pv2) break
    }
    return { pv1, pv2 }
}

export function formatStaticEval(evaluation: string): string[] | undefined {
    const { pv1 } = formatMultiPvEvals(evaluation)
    if (pv1) return pv1

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

async function getBestMove(
    program: StockfishEngine | Worker,
    depth: number,
    signal: AbortSignal
): Promise<{ bestMove: square[], coronation?: PieceSymbol, staticEval: string[], secondBestEval?: string[] }> {
    program.postMessage(`go depth ${depth}`)

    let staticEval: string[] = []
    let secondBestEval: string[] | undefined
    return new Promise((resolve, reject) => {
        function cleanUp() {
            program.removeEventListener('message', readMessage)
            signal?.removeEventListener('abort', handleAbort)
        }

        function readMessage(e: MessageEvent) {
            const line = typeof e.data === 'string' ? e.data : ''

            const { movement: bestMove, coronation } = formatMove(line)
            const { pv1, pv2 } = formatMultiPvEvals(line)
            if (pv1) staticEval = pv1
            if (pv2) secondBestEval = pv2

            if (bestMove) {
                cleanUp()
                resolve({ bestMove, coronation, staticEval, secondBestEval })
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
    san?: string,
    secondBestScore?: number
): { comment: string, moveRating: moveRating } {
    const res = classifyMove({
        playerScoreBefore,
        playerScoreAfter,
        playerRating,
        isBestMove,
        isBookMove,
        isForced,
        isSacrifice,
        piecesCount,
        opponentPreviousRating,
        secondBestScore,
        san,
        bookComment
    })
    return { moveRating: res.classification, comment: res.comment }
}

async function analyze(program: StockfishEngine | Worker, fen: string, depth: number, signal: AbortSignal) {
    program.postMessage(`position fen ${fen}`)

    try {
        const { bestMove, staticEval, coronation, secondBestEval } = await getBestMove(program, depth, signal)
        return { bestMove, staticEval, bestMoveCoronation: coronation, secondBestEval }
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

    let sacrifice, staticEval: string[], bestMove: square[] | undefined, forced, bestMoveCoronation, secondBestEval: string[] | undefined
    if (chess.isCheckmate()) {
        sacrifice = false
        staticEval = ["mate", "0"]
        bestMove = undefined
        forced = false
        bestMoveCoronation = undefined
        secondBestEval = undefined
    } else {
        sacrifice = move.promotion ? false : isSacrifice(move)

        try {
            ({ staticEval, bestMove, bestMoveCoronation, secondBestEval } = await analyze(stockfish, move.after, depth, signal))
        } catch {
            handleAbort()
            bestMove = undefined
            staticEval = []
            bestMoveCoronation = undefined
            secondBestEval = undefined
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

    // Second-best move score (Multi-PV 2) from player's perspective
    let secondBestScore: number | undefined
    if (secondBestEval && secondBestEval.length >= 2) {
        secondBestScore = -evalToCentipawns(secondBestEval)
    }

    const pRating = playerRating || 1500

    // Check if book move
    const bookComment = openings[fen]
    const isBookMove = Boolean(bookComment)

    // Best move comparison
    const isBestMove = Boolean(previousBestMoveSan && previousBestMoveSan === move.san)
    const piecesCount = getPieceCount(chess)

    const classificationResult = classifyMove({
        playerScoreBefore,
        playerScoreAfter,
        playerRating: pRating,
        isBestMove,
        isBookMove,
        isForced: Boolean(forced),
        isSacrifice: Boolean(sacrifice),
        piecesCount,
        opponentPreviousRating: opponentRating,
        secondBestScore,
        san,
        bookComment
    })

    const moveRating = classificationResult.classification
    const comment = classificationResult.comment
    const accuracy = classificationResult.accuracy
    const deltaE = classificationResult.deltaE

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
                        let bestSan = bestLan;
                        try {
                            const tempChess = new Chess(hMove.before);
                            const m = tempChess.move({ from: bestLan.slice(0, 2) as any, to: bestLan.slice(2, 4) as any, promotion: (bestLan[4] || 'q') as any });
                            if (m) bestSan = m.san;
                        } catch {}

                        moves.push({
                            fen: hMove.after,
                            movement: [mFrom, mTo],
                            bestMove: bestSquare,
                            bestMoveSan: bestSan,
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

        // Compute overall CAPS2 game accuracy for local review mode
        const whiteMoves = moves.filter(m => m.playedBy === 'w' && m.moveRating !== 'book' && m.moveRating !== 'forced')
        const blackMoves = moves.filter(m => m.playedBy === 'b' && m.moveRating !== 'book' && m.moveRating !== 'forced')
        const whiteAcc = whiteMoves.length > 0
            ? Number((whiteMoves.reduce((acc, m) => acc + (m.accuracy ?? 100), 0) / whiteMoves.length).toFixed(1))
            : 100.0
        const blackAcc = blackMoves.length > 0
            ? Number((blackMoves.reduce((acc, m) => acc + (m.accuracy ?? 100), 0) / blackMoves.length).toFixed(1))
            : 100.0

        if (players[0]) players[0].accuracy = whiteAcc
        if (players[1]) players[1].accuracy = blackAcc
        ;(metadata as any).accuracies = { white: whiteAcc, black: blackAcc }

        resolve({ metadata, moves })
    })
}