"use client"

import React, { useEffect, useState, useRef, useContext } from "react"

import Board, { drag, gameStartSound } from "./board"
import Clock from "./clock"
import Name from "./name"
import Evaluation from "./evaluation"
import { AnalyzeContext, CustomLine } from "@/context/analyze"
import { formatSquare, getCastle, invertColor, move, openings, parseMove, parsePGN, parsePosition, prepareStockfish, result, square, StockfishEngine } from "@/engine/stockfish"
import { createStockfishWorker } from "@/engine/engineWorker"
import { Chess, PieceSymbol, WHITE } from "chess.js"
import { getAproxMemory, wasmSupported, wasmThreadsSupported } from "@/engine/wasmChecks"
import { pushPageWarning, pushPageError } from "@/components/errors/pageErrors"
import { ErrorsContext } from "@/context/errors"
import { maxVertical, navTop } from "../../../tailwind.config"
import { ConfigContext } from "@/context/config"
import GameButtons from "../menu/analysis/gameButtons"

// const NOT_SUPPORTED_WASM_THREADS_WARNING = ['WebAssembly threads not supported', 'The app may run slower. Try updating your browser for better performance.']
const NOT_SUPPORTED_WASM_WARNING = ['WebAssembly not supported', 'The app may run very slow. Try updating your browser for better performance.']

export type arrow = square[]
export interface AllGameArrows { [key: number]: arrow[] }

export function getMoves(game: move[], moveNumber: number, customLine: CustomLine, returnedToNormalGame: square[] | null) {
    const previousMove = (() => {
        if (customLine.moveNumber === 0) {
            return game[moveNumber]
        }
        if (customLine.moveNumber > 0) {
            return customLine.moves[customLine.moveNumber - 1]
        }
        return game[moveNumber - 1]
    })()

    const move = (() => {
        if (customLine.moveNumber >= 0) {
            return customLine.moves[customLine.moveNumber]
        }
        return game[moveNumber]
    })()

    const nextMove = (() => {
        if (customLine.moveNumber >= 0) {
            return customLine.moves[customLine.moveNumber + 1]
        }
        if (returnedToNormalGame) {
            return { ...game[moveNumber], movement: returnedToNormalGame }
        }
        return game[moveNumber + 1]
    })()

    return { previousMove, move, nextMove }
}

function getArrows(arrows: AllGameArrows, moveNumber: number, customLine: CustomLine) {
    if (customLine.moveNumber < 0) {
        return arrows[moveNumber]
    }
    return customLine.arrows[customLine.moveNumber]
}

function getCustomResult(move?: move): result {
    if (!move) return ""

    const chess = new Chess(move.fen)
    const color = move.color

    if (chess.isCheckmate()) return color === WHITE ? "0-1" : "1-0"
    if (chess.isDraw()) return "1/2-1/2"
    return ""
}

export default function Game() {
    const [boardSize, setBoardSize] = useState(750)
    const [gameHeight, setGameHeight] = useState(850)
    const [captured, setCaptured] = useState<{ white: PieceSymbol[], black: PieceSymbol[] }>({ white: [], black: [] })
    const [arrows, setArrows] = useState<AllGameArrows>({0: []})
    const [gap, setGap] = useState(10)
    const [openings, setOpenings] = useState<openings>({ })
    const [drag, setDrag] = useState<drag>({is: false, id: ''})
    const [isNavTop, setIsNavTop] = useState(false)

    const analyzeContext = useContext(AnalyzeContext)
    const errorsContext = useContext(ErrorsContext)
    const configContext = useContext(ConfigContext)

    const [players, setPlayers] = analyzeContext.players
    const [time, setTime] = analyzeContext.time
    const [moveNumber, setMoveNumber] = analyzeContext.moveNumber
    const [game, setGame] = analyzeContext.game
    const [data, setData] = analyzeContext.data
    const [pageState, setPageState] = analyzeContext.pageState
    const [forward, setForward] = analyzeContext.forward
    const [animation, setAnimation] = analyzeContext.animation
    const [white, setWhite] = analyzeContext.white
    const [playing, setPlaying] = analyzeContext.playing
    const [materialAdvantage] = analyzeContext.materialAdvantage
    const [result, setResult] = analyzeContext.result
    const setProgress = analyzeContext.progress[1]
    const [tab, setTab] = analyzeContext.tab
    const [analyzeController, setAnalyzeController] = analyzeContext.analyzeController
    const [customLine, setCustomLine] = analyzeContext.customLine
    const [returnedToNormalGame] = analyzeContext.returnedToNormalGame
    const [analyzingMove, setAnalyzingMove] = analyzeContext.analyzingMove
    const [depth] = analyzeContext.depth
    const setMaterialAdvantage = analyzeContext.materialAdvantage[1]

    const gameController = analyzeContext.gameController

    const setErrors = errorsContext.errors[1]

    const [boardSounds] = configContext.boardSounds

    const componentRef = useRef<HTMLDivElement>(null)
    const gameRef = useRef<HTMLDivElement>(null)

    const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined)
    const tabRef = useRef(tab)

    const dragRef = useRef(drag)

    const engineWorkerRef = useRef<StockfishEngine | Worker | null>(null)
    const [engineStatus, setEngineStatus] = useState<string>("Connecting engine...")

    const analyzingMoveRef = useRef<boolean>(analyzingMove)

    const { previousMove, move, nextMove } = getMoves(game, moveNumber, customLine, returnedToNormalGame)
    const shownResult = customLine.moveNumber < 0 ? result : getCustomResult(move)

    useEffect(() => {
        analyzingMoveRef.current = analyzingMove
    }, [analyzingMove])

    useEffect(() => {
        dragRef.current = drag
    }, [drag])

    useEffect(() => {
        (async () => {
            const openingsRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH}/openings/openings.json`)
            const openings = await openingsRes.json()
            setOpenings(openings as openings)
        })()
    }, [])

    useEffect(() => {
        let active = true
        // Efficient resource allocation: cap threads to 2 and hash to 32MB (drops RAM usage from 1.5GB to <50MB)
        const threads = Math.min(2, Math.max(1, navigator.hardwareConcurrency ?? 1))
        const hash = 32

        const errorTimeout = setTimeout(() => pushPageError(setErrors, 'The browser is having some troubles loading Stockfish', "If the app doesn't work properly try restarting the browser."), 15000);

        (async () => {
            try {
                const stockfish = await createStockfishWorker()
                if (!active) {
                    stockfish.terminate()
                    return
                }
                engineWorkerRef.current = stockfish
                setEngineStatus(stockfish.engineName || (stockfish.isNative ? "Stockfish 19 (Native Universal)" : "Stockfish 19 (WebAssembly)"))

                await prepareStockfish(stockfish, threads, hash)
                clearTimeout(errorTimeout)

                try {
                    const loadPgn = sessionStorage.getItem("load_pgn");
                    if (loadPgn) {
                        sessionStorage.removeItem("load_pgn");
                        setData({ format: "pgn", string: loadPgn });
                    }
                } catch { }
            } catch (err) {
                console.error("Stockfish init failed:", err)
            }
        })()

        return () => {
            active = false
            clearTimeout(errorTimeout)
            if (engineWorkerRef.current) {
                engineWorkerRef.current.terminate()
                engineWorkerRef.current = null
            }
        }
    }, [])

    useEffect(() => {
        setAnimation(false)
    }, [moveNumber, customLine.moveNumber])

    useEffect(() => {
        tabRef.current = tab
    }, [tab])

    useEffect(() => {
        clearInterval(intervalRef.current)
        if (playing) {
            function nextMove() {
                gameController.forward()
            }
            nextMove()
            intervalRef.current = setInterval(nextMove, 1000)
        } else {
            clearInterval(intervalRef.current)
        }

        return () => clearInterval(intervalRef.current)
    }, [playing])

    function createArrowsObject(length: number) {
        const newArrows: AllGameArrows = {}
        Array.from({ length }).forEach((_, i) => {
            newArrows[i] = []
        })

        return newArrows
    }

    function cleanArrows() {
        setArrows({ 0: [] })
    }

    function cleanCurrentArrows() {
        if (customLine.moveNumber < 0) {
            setArrows(prev => {return {...prev, [moveNumber]: []}})
        } else {
            setCustomLine(prev => ({ ...prev, arrows: { ...prev.arrows, [prev.moveNumber]: [] } }))
        }
    }

    function pushArrow(currentArrow: arrow) {
        if (customLine.moveNumber < 0) {
            const repeatedIndex = arrows[moveNumber].findIndex(arrow => JSON.stringify(arrow) === JSON.stringify(currentArrow))
            const isRepeated = repeatedIndex !== -1

            const newArrows = [...arrows[moveNumber]]

            if (isRepeated) {
                newArrows.splice(repeatedIndex, 1)
            } else {
                newArrows.push(currentArrow)
            }

            setArrows(prev => {return {...prev, [moveNumber]: newArrows}})
        } else {
            const repeatedIndex = customLine.arrows[customLine.moveNumber].findIndex(arrow => JSON.stringify(arrow) === JSON.stringify(currentArrow))
            const isRepeated = repeatedIndex !== -1

            const newArrows = [...customLine.arrows[customLine.moveNumber]]

            if (isRepeated) {
                newArrows.splice(repeatedIndex, 1)
            } else {
                newArrows.push(currentArrow)
            }

            setCustomLine(prev => ({ ...prev, arrows: { ...prev.arrows, [customLine.moveNumber]: newArrows } }))
        }
    }

    useEffect(() => {
        let lastPressed = 0
        function handleKeyDown(e: KeyboardEvent) {
            const element = e.target as HTMLElement
            const focusableInputTypes = ['text', 'number', 'password', 'email', 'search', 'tel', 'url']
            if (element.tagName === 'INPUT' && focusableInputTypes.includes(element.getAttribute('type') ?? '')) return
            if (element.tagName === 'TEXTAREA') return

            const now = new Date().getTime()
            const minPressInterval = 25

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault()
                    if (dragRef.current.is) return
                    if (now - lastPressed < minPressInterval) return
                    if (analyzingMoveRef.current) return

                    gameController.back()

                    lastPressed = new Date().getTime()
                    break
                case 'ArrowRight':
                    e.preventDefault()
                    if (dragRef.current.is) return
                    if (now - lastPressed < minPressInterval) return
                    if (analyzingMoveRef.current) return

                    gameController.forward()

                    lastPressed = new Date().getTime()
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    if (dragRef.current.is) return
                    if (now - lastPressed < minPressInterval) return
                    if (analyzingMoveRef.current) return

                    gameController.first()

                    lastPressed = new Date().getTime()
                    break
                case 'ArrowDown':
                    e.preventDefault()
                    if (dragRef.current.is) return
                    if (now - lastPressed < minPressInterval) return
                    if (analyzingMoveRef.current) return

                    gameController.last()

                    lastPressed = new Date().getTime()
                    break
                case ' ':
                    e.preventDefault()
                    if (dragRef.current.is) return
                    if (now - lastPressed < minPressInterval) return
                    if (analyzingMoveRef.current) return

                    gameController.togglePlay()

                    lastPressed = new Date().getTime()
                    break
                case 'Tab':
                    e.preventDefault()
                    if (now - lastPressed < minPressInterval) return

                    const tab = tabRef.current

                    if (pageState === "analyze") {
                        if (tab === 'summary') setTab('moves')
                        else if (tab === 'moves') setTab('summary')
                    }
                    break
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    async function handlePGN(pgn: string, depth: number) {
        const PGN_ERROR = ['Error reading PGN', 'Please, provide a valid PGN.']

        setPageState('loading')

        if (!pgn) {
            pushPageError(setErrors, PGN_ERROR[0], PGN_ERROR[1])
            setPageState('default')
            return
        }

        if (!wasmThreadsSupported()) {
            if (!wasmSupported()) {
                pushPageWarning(setErrors, NOT_SUPPORTED_WASM_WARNING[0], NOT_SUPPORTED_WASM_WARNING[1])
            } else {
                // pushPageWarning(setErrors, NOT_SUPPORTED_WASM_THREADS_WARNING[0], NOT_SUPPORTED_WASM_THREADS_WARNING[1])
            }
        }

        const stockfish = engineWorkerRef.current
        if (!stockfish) return

        try {
            const { metadata, moves } = await parsePGN(stockfish, pgn, depth, openings, setProgress, analyzeController.signal, data.performanceRatings)

            if ((metadata as any).accuracies || (metadata as any).opening) {
                setData(prev => ({
                    ...prev,
                    accuracies: (metadata as any).accuracies,
                    opening: (metadata as any).opening
                }))
            }

            setTime(metadata.time)
            setPlayers(metadata.players)
            setGame(moves)
            setResult(metadata.result)
            setAnimation(false)
            setArrows(createArrowsObject(moves.length))
            setCustomLine({ moveNumber: -1, moves: [], arrows: {} })
            setAnalyzingMove(false)

            if (boardSounds) setTimeout(() => gameStartSound.play(), 100)
            setPageState('analyze')
        } catch (e: any) {
            switch (e.message) {
                case 'pgn':
                    pushPageError(setErrors, PGN_ERROR[0], PGN_ERROR[1])
                    break
                case 'canceled':
                    setAnalyzeController(new AbortController())
                    break
            }

            setPageState('default')
        }

        setProgress(0)
        setMoveNumber(0)
    }

    async function handleFEN(fen: string) {
        const FEN_ERROR = ['Error reading FEN', 'Please, provide a valid FEN.']

        let move
        try {
            move = await new Promise<move>(async (resolve, reject) => {
                setPageState('loading')

                setTime(0)
                setPlayers([{ name: 'White', elo: '?' }, { name: 'Black', elo: '?' }])
                setWhite(true)
                setPlaying(false)
                setMoveNumber(0)
                setResult("")
                setProgress(0)
                setCustomLine({ moveNumber: -1, moves: [], arrows: {} })
                setAnalyzingMove(false)
                cleanArrows()

                if (!fen) {
                    const chess = new Chess()
                    const fen = chess.fen()
                    const bestMove = chess.move({ from: "e2", to: "e4" })

                    const move: move = {
                        fen,
                        color: chess.turn(),
                        bestMove: [formatSquare(bestMove.from), formatSquare(bestMove.to)],
                        bestMoveSan: bestMove.san,
                        previousStaticEvals: [["cp", "-30"]]
                    }

                    setGame([move])
                    setPageState('default')
                    return
                }

                const stockfish = engineWorkerRef.current
                if (!stockfish) return

                let chess
                try {
                    chess = new Chess(fen)
                } catch {
                    reject(new Error("fen"))
                    return
                }
                const signal = analyzeController.signal

                function handleAbort() {
                    reject(new Error('canceled'))
                    signal.removeEventListener('abort', handleAbort)
                }

                const move = await parsePosition(stockfish, chess, depth, signal, handleAbort)

                resolve(move)
            })
        } catch (e: any) {
            switch (e.message) {
                case 'fen':
                    pushPageError(setErrors, FEN_ERROR[0], FEN_ERROR[1])
                    break
                case 'canceled':
                    setAnalyzeController(new AbortController())
                    break
            }

            setPageState('default')
            return
        }

        setGame([move])
        setPageState('analyzeCustom')
    }

    useEffect(() => {
        const { format, string } = data
        switch (format) {
            case "pgn":
                if (!string) return
                handlePGN(string, depth)
                break
            case "fen":
                handleFEN(string)
                break
        }
    }, [data.format, data.string])

    useEffect(() => {
        function updateBoardSize() {
            setGap(8)

            const isMobile = window.innerWidth < 768
            const isTablet = window.innerWidth < 1024

            let maxAvailableH: number
            let maxAvailableW: number

            if (isMobile) {
                // Mobile viewport: header/nav at top (56px), players (84px), status (24px), bottom tabs (180px)
                maxAvailableH = window.innerHeight - 340
                maxAvailableW = window.innerWidth - 36
            } else if (isTablet) {
                maxAvailableH = window.innerHeight - 150
                maxAvailableW = window.innerWidth - 380 - 48
            } else {
                // Desktop viewport: left sidebar (~144px), right review card (~440px), margins (~56px)
                // Height: top & bottom player bars (~88px) + status (~28px) + outer padding (~40px)
                maxAvailableH = window.innerHeight - 156
                maxAvailableW = window.innerWidth - 144 - 440 - 56
            }

            const rawSize = Math.min(maxAvailableH, maxAvailableW)
            const boundedSize = Math.max(280, Math.min(760, rawSize))
            const newBoardSize = Math.floor(boundedSize / 8) * 8

            setBoardSize(newBoardSize)
            setGameHeight(newBoardSize)
        }

        updateBoardSize()

        window.addEventListener('resize', updateBoardSize)

        return () => window.removeEventListener('resize', updateBoardSize)
    }, [])

    useEffect(() => {
        const newCaptured: typeof captured = { white: [], black: [] }
        for (let i = 0; i <= moveNumber && i < game.length; i++) {
            const move = game[i]
            if (move.capture) newCaptured[move.color === 'w' ? 'black' : 'white'].push(move.capture)
        }
        for (let i = 0; i <= customLine.moveNumber; i++) {
            const move = customLine.moves[i]
            if (move.capture) newCaptured[move.color === 'w' ? 'black' : 'white'].push(move.capture)
        }
        setCaptured(newCaptured)
    }, [moveNumber, customLine.moveNumber])

    function roundBoardSize(boardSize: number) {
        return Math.round(boardSize / 8) * 8
    }

    function sliceCustomArrows(arrows: AllGameArrows, moveNumber: number) {
        const newArrows: AllGameArrows = {}
        for (let i = 0; i <= moveNumber; i++) {
            if (!arrows[i]) newArrows[i] = []
            else newArrows[i] = arrows[i]
        }

        return newArrows
    }

    async function analyzeMove(previousFen: string, movement: { from: string, to: string, promotion?: PieceSymbol }, previousSacrifice: boolean, previousStaticEvals: string[][], animation: boolean, previousBestMoveSan?: string) {
        const chess = new Chess(previousFen)
        const unanalyzedMoveObj = chess.move(movement)

        const unanalyzedMove: move = {
            fen: unanalyzedMoveObj.after,
            movement: [formatSquare(movement.from), formatSquare(movement.to)],
            color: invertColor(unanalyzedMoveObj.color),
            capture: unanalyzedMoveObj.captured,
            castle: getCastle(unanalyzedMoveObj.san),
            san: unanalyzedMoveObj.san,
        }

        setAnimation(animation)
        setForward(true)
        setCustomLine(prev => ({ moveNumber: prev.moveNumber + 1, moves: [...prev.moves.slice(0, prev.moveNumber + 1), unanalyzedMove], arrows: sliceCustomArrows(prev.arrows, prev.moveNumber + 1) }))
        setAnalyzingMove(true)

        if (data.format === "fen") setPageState("analyzeCustom")

        const move = await new Promise<move>(async (resolve, reject) => {
            const signal = analyzeController.signal

            function handleAbort() {
                reject(new Error('canceled'))
                signal.removeEventListener('abort', handleAbort)
            }

            const stockfish = engineWorkerRef.current
            if (!stockfish) return

            const chess = new Chess(previousFen)
            const move = chess.move(movement)

            const analyzedMovement = await parseMove(stockfish, depth, move, chess, previousStaticEvals, previousBestMoveSan, previousSacrifice, openings, handleAbort, signal)
            resolve(analyzedMovement)
        })

        setAnimation(false)
        setAnalyzingMove(false)
        setCustomLine(prev => ({ ...prev, moveNumber: prev.moveNumber, moves: [...prev.moves.slice(0, prev.moveNumber), move] }))
    }

    function formatTime(seconds: number): string {
        const noTime = '--:--'

        const toTwoDigits = (num: number) => {
            return String(num).padStart(2, '0')
        }

        const getMinutes = (seconds: number) => {
            return [Math.floor(seconds / 60), seconds % 60]
        }

        const getHours = (minutes: number) => {
            return Math.ceil(minutes / 60)
        }

        const getDays = (hours: number) => {
            return Math.ceil(hours / 24)
        }

        const [minutes, restSeconds] = getMinutes(seconds)

        if (minutes) {
            const hours = getHours(minutes)
            if (hours > 2) {
                const days = getDays(hours)
                if (days > 2) {
                    return `${days} days`
                }
                return `${hours} ${hours > 1 ? 'hours' : 'hour'}`
            }
            return `${toTwoDigits(minutes)}:${toTwoDigits(restSeconds)}`
        }
        if (restSeconds) return `${toTwoDigits(minutes)}:${toTwoDigits(restSeconds)}`
        return noTime
    }

    const flipBoard = () => {
        setAnimation(false)
        setWhite(prev => !prev)
    }

    const setOpenedMenu = configContext.openedMenu[1]
    const boardWidthWithEval = boardSize + 28 + 8

    return (
        <div className="flex flex-col items-center justify-center select-none w-fit">
            <div ref={gameRef} tabIndex={0} className="flex flex-col outline-none gap-2">
                {/* Header Bar: Status & Quick Controls */}
                <div style={{ width: boardWidthWithEval }} className="flex flex-row justify-between items-center text-xs text-neutral-400 select-none px-0.5">
                    <span className="flex items-center gap-1.5 font-semibold tracking-wide">
                        <span className={`inline-block w-2 h-2 ${engineStatus.includes('Native') ? 'bg-[#81b64c] shadow-[0_0_8px_rgba(129,182,76,0.8)]' : 'bg-[#81b64c]/70'}`}></span>
                        <span className={engineStatus.includes('Native') ? 'text-[#81b64c]' : 'text-neutral-400'}>{engineStatus}</span>
                    </span>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={flipBoard}
                            title="Flip Board (X)"
                            className="p-1 hover:bg-white/10 text-neutral-400 hover:text-white transition-all active:scale-95"
                        >
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpenedMenu(prev => prev === "settings" ? null : "settings")}
                            title="Board Settings"
                            className="p-1 hover:bg-white/10 text-neutral-400 hover:text-white transition-all active:scale-95"
                        >
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Top Player (Opponent) */}
                <div style={{ width: boardWidthWithEval }} className="flex flex-row justify-between items-center">
                    <Name materialAdvantage={materialAdvantage} captured={captured[white ? 'white' : 'black']} white={!white}>{`${players[white ? 1 : 0].name} ${players[white ? 1 : 0].elo !== 'NOELO' ? `(${players[white ? 1 : 0].elo})` : ''}`}</Name>
                    <Clock white={!white} colorMoving={game[moveNumber]?.color}>{formatTime(time)}</Clock>
                </div>

                {/* Center Row: Evaluation Bar + Chess Board */}
                <div className="flex flex-row items-center gap-2">
                    <Evaluation
                        size={boardSize}
                        white={white}
                        advantage={analyzingMove ? previousMove?.previousStaticEvals?.[0] ?? ["cp", "0"] : move?.previousStaticEvals?.[0] ?? ['cp', "0"]}
                        whiteMoving={(analyzingMove ? previousMove?.color ?? WHITE : move?.color ?? WHITE) === WHITE}
                    />
                    <Board
                        setPlaying={setPlaying}
                        cleanArrows={cleanCurrentArrows}
                        arrows={getArrows(arrows, moveNumber, customLine)}
                        sacrifice={move?.sacrifice}
                        forward={forward}
                        moveRating={move?.moveRating}
                        bestMove={move?.bestMove}
                        previousBestMove={previousMove?.bestMove}
                        move={move?.movement}
                        nextMove={nextMove?.movement}
                        fen={move?.fen}
                        nextFen={nextMove?.fen}
                        boardSize={boardSize}
                        white={white}
                        animation={animation}
                        gameEnded={(moveNumber === game.length - 1 && customLine.moveNumber < 0) || (customLine.moveNumber >= 0 && Boolean(shownResult))}
                        capture={move?.capture}
                        nextCapture={nextMove?.capture}
                        castle={move?.castle}
                        nextCastle={nextMove?.castle}
                        setAnimation={setAnimation}
                        result={shownResult}
                        pushArrow={pushArrow}
                        analyzeMove={analyzeMove}
                        previousStaticEvals={move?.previousStaticEvals}
                        analyzingMove={analyzingMove}
                        setMaterialAdvantage={setMaterialAdvantage}
                        drag={drag}
                        setDrag={setDrag}
                        bestMoveSan={move?.bestMoveSan}
                    />
                </div>

                {/* Bottom Player (Self) */}
                <div style={{ width: boardWidthWithEval }} className="flex flex-row justify-between items-center">
                    <Name materialAdvantage={materialAdvantage} captured={captured[white ? 'black' : 'white']} white={white}>{`${players[white ? 0 : 1].name} ${players[white ? 0 : 1].elo !== 'NOELO' ? `(${players[white ? 0 : 1].elo})` : ''}`}</Name>
                    <Clock white={white} colorMoving={game[moveNumber]?.color}>{formatTime(time)}</Clock>
                </div>
            </div>
        </div>
    )
}