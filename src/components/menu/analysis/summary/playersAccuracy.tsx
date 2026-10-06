import { players, AnalyzeContext } from "@/context/analyze";
import Profile from "../../../svg/profile";
import { move, position } from "@/engine/stockfish";
import { Dispatch, SetStateAction, useEffect, useContext } from "react";
import RatingBox from "./ratingBox";
import { Chess, Color } from "chess.js";

export interface accuracyPhases {
    opening: { w: number[], b: number[] },
    middlegame: { w: number[], b: number[] },
    endgame: { w: number[], b: number[] }
}

function isEndOpening(position: position) {
    let nonDeveloppedBlack = 0, nonDeveloppedWhite = 0
    for (const square of position[0]) {
        if (square?.color === 'w') continue
        if (square?.type === 'n' || square?.type === 'b' || square?.type === 'q') nonDeveloppedBlack++
    }
    for (const square of position[position.length - 1]) {
        if (square?.color === 'b') continue
        if (square?.type === 'n' || square?.type === 'b' || square?.type === 'q') nonDeveloppedWhite++
    }

    const developpedBlack = 5 - nonDeveloppedBlack
    const developpedWhite = 5 - nonDeveloppedWhite

    if (developpedBlack >= 3 && developpedWhite >= 2) return true
    if (developpedWhite >= 3 && developpedBlack >= 2) return true
    if (developpedBlack >= 4) return true
    if (developpedWhite >= 4) return true
}

function isEndMiddlegame(position: position) {
    let whitePieces = 0, blackPieces = 0
    for (const row of position) {
        for (const square of row) {
            if (square?.type === 'r' || square?.type === 'n' || square?.type === 'b' || square?.type === 'q') {
                if (square.color === 'w') whitePieces++
                else blackPieces++
            }
        }
    }

    if (whitePieces <= 2 && blackPieces <= 2) return true
    if (whitePieces <= 1 || blackPieces <= 1) return true
}

export function avg(arr: number[]) {
    if (arr.length === 0) return 100
    // CAPS2 power-mean aggregation calibrated against official review data:
    // Exponent p = 0.35 with 50% power mean and 50% arithmetic mean aligns
    // directly with Chess.com's grading curve while preserving 100% anchors.
    const p = 0.35
    const sumP = arr.reduce((acc, cur) => acc + Math.pow(Math.max(cur, 0.5), p), 0)
    const powerMeanVal = Math.pow(sumP / arr.length, 1 / p)
    const arithMeanVal = arr.reduce((acc, cur) => acc + cur, 0) / arr.length
    return 0.50 * powerMeanVal + 0.50 * arithMeanVal
}

function pushAccuracyPhase(arr: accuracyPhases, value: number, phase: 'opening'|'middlegame'|'endgame', color: Color) {
    arr[phase][color].push(value)
}

function pushAccuracy(arr: { w: number[], b: number[] }, value: number, color: Color) {
    arr[color].push(value)
}

export default function PlayersAccuracy(props: { reducedSummary: boolean, players: players, moves: move[], accuracy: [{ w: number, b: number }, Dispatch<SetStateAction<{ w: number, b: number }>>], setAccuracyPhases: Dispatch<SetStateAction<accuracyPhases>> }) {
    const { players, setAccuracyPhases, moves } = props
    const [accuracy, setAccuracy] = props.accuracy

    const analyzeContext = useContext(AnalyzeContext)
    const [gameResult] = analyzeContext.result
    const isWhiteWinner = gameResult === '1-0'
    const isBlackWinner = gameResult === '0-1'

    useEffect(() => {
        const accuracies: { w: number[], b: number[] } = { w: [], b: [] }
        const accuraciesPhases: accuracyPhases = { opening: { w: [], b: [] }, middlegame: { w: [], b: [] }, endgame: { w: [], b: [] } }

        let currentPhase: 'opening'|'middlegame'|'endgame' = 'opening'
        for (const move of moves) {
            if (!move.moveRating) continue
            // Forced moves are excluded from the game accuracy calculation on Chess.com
            if (move.moveRating === 'forced') continue

            const board = new Chess(move.fen).board()
            const playerColor = move.playedBy || (move.color === 'w' ? 'b' : 'w')
            const rating = move.moveRating

            let moveAccuracy: number = move.accuracy ?? NaN
            if (isNaN(moveAccuracy)) {
                switch (rating) {
                    case 'brilliant': case 'great': case 'best': case 'book':
                        moveAccuracy = 100
                        break
                    case 'excellent':
                        moveAccuracy = 93
                        break
                    case 'good':
                        moveAccuracy = 82
                        break
                    case 'inaccuracy':
                        moveAccuracy = 58
                        break
                    case 'mistake':
                        moveAccuracy = 30
                        break
                    case 'miss':
                        moveAccuracy = 18
                        break
                    case 'blunder':
                        moveAccuracy = 0
                        break
                }
            }

            if (isNaN(moveAccuracy)) continue

            pushAccuracy(accuracies, moveAccuracy, playerColor)

            switch (currentPhase) {
                case 'opening':
                    pushAccuracyPhase(accuraciesPhases, moveAccuracy, 'opening', playerColor)
                    if (isEndOpening(board)) currentPhase = 'middlegame'
                    break
                case 'middlegame':
                    pushAccuracyPhase(accuraciesPhases, moveAccuracy, 'middlegame', playerColor)
                    if (isEndMiddlegame(board)) currentPhase = 'endgame'
                    break
                case 'endgame':
                    pushAccuracyPhase(accuraciesPhases, moveAccuracy, 'endgame', playerColor)
                    break
            }
        }
        const avgW = players[0]?.accuracy !== undefined 
            ? players[0].accuracy 
            : (accuracies.w.length > 0 ? avg(accuracies.w) : 100)
        const avgB = players[1]?.accuracy !== undefined 
            ? players[1].accuracy 
            : (accuracies.b.length > 0 ? avg(accuracies.b) : 100)
        const newAccuracy = { w: avgW, b: avgB }

        setAccuracy(newAccuracy)
        setAccuracyPhases(accuraciesPhases)
    }, [moves, players])

    return (
        <div className="w-[85%] flex flex-col items-end gap-3">
            <div className="reduceSummary:w-[262px] w-[160px] flex flex-row justify-between font-extrabold">
                <div className="reduceSummary:w-20 w-16 flex flex-row justify-center whitespace-nowrap overflow-visible"><span className="text-white text-[15px] font-bold">{players[0].name}</span></div>
                <div className="reduceSummary:w-20 w-16 flex flex-row justify-center whitespace-nowrap overflow-visible"><span className="text-white text-[15px] font-bold">{players[1].name}</span></div>
            </div>
            <div className="flex flex-row w-full justify-between items-center">
                <span className="font-semibold text-white/80 text-[14px]">Players</span>
                <div className="flex flex-row reduceSummary:w-[262px] w-[160px] justify-between">
                    <div className="relative reduceSummary:h-20 reduceSummary:w-20 h-16 w-16 flex flex-row justify-center items-end bg-backgroundProfileWhite rounded-[6px]">
                        <Profile width={props.reducedSummary ? 58 : 70} height={props.reducedSummary ? 58 : 70} class="fill-foregroundProfileWhite" />
                        {isWhiteWinner && (
                            <span className="absolute -top-1.5 -right-1.5 bg-[#e6912c] text-white p-0.5 rounded-full shadow-md" title="Winner">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
                                </svg>
                            </span>
                        )}
                    </div>
                    <div className="relative reduceSummary:h-20 reduceSummary:w-20 h-16 w-16 flex flex-row justify-center items-end bg-backgroundProfileBlack rounded-[6px]">
                        <Profile width={props.reducedSummary ? 58 : 70} height={props.reducedSummary ? 58 : 70} class="fill-foregroundProfileBlack" />
                        {isBlackWinner && (
                            <span className="absolute -top-1.5 -right-1.5 bg-[#e6912c] text-white p-0.5 rounded-full shadow-md" title="Winner">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
                                </svg>
                            </span>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex flex-row w-full justify-between items-center">
                <span className="font-semibold text-white/80 text-[14px]">Accuracy</span>
                <div className="flex flex-row reduceSummary:w-[262px] w-[160px] justify-between">
                    <RatingBox fontSize={props.reducedSummary ? 18 : undefined} width={props.reducedSummary ? 64 : undefined} paddingY={props.reducedSummary ? 4 : undefined} white>{accuracy.w.toFixed(1)}</RatingBox>
                    <RatingBox fontSize={props.reducedSummary ? 18 : undefined} width={props.reducedSummary ? 64 : undefined} paddingY={props.reducedSummary ? 4 : undefined}>{accuracy.b.toFixed(1)}</RatingBox>
                </div>
            </div>
        </div>
    )
}