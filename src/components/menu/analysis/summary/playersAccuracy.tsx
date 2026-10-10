"use client"

import { players, AnalyzeContext } from "@/context/analyze";
import Profile from "../../../svg/profile";
import { move, position } from "@/engine/stockfish";
import { Dispatch, SetStateAction, useEffect, useContext } from "react";
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
    const p = 0.35
    const sumP = arr.reduce((acc, cur) => acc + Math.pow(Math.max(cur, 0.5), p), 0)
    const powerMeanVal = Math.pow(sumP / arr.length, 1 / p)
    const arithMeanVal = arr.reduce((acc, cur) => acc + cur, 0) / arr.length
    return 0.50 * powerMeanVal + 0.50 * arithMeanVal
}

function pushAccuracyPhase(arr: accuracyPhases, value: number, phase: 'opening'|'middlegame'|'endgame', color: Color) {
    arr[phase][color].push(value)
}

export default function PlayersAccuracy(props: {
    reducedSummary?: boolean
    players: players
    moves: move[]
    accuracy: [{ w: number, b: number }, Dispatch<SetStateAction<{ w: number, b: number }>>]
    setAccuracyPhases: Dispatch<SetStateAction<accuracyPhases>>
}) {
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
                        moveAccuracy = 60
                        break
                    case 'mistake':
                        moveAccuracy = 35
                        break
                    case 'miss':
                        moveAccuracy = 25
                        break
                    case 'blunder':
                        moveAccuracy = 10
                        break
                    default:
                        moveAccuracy = 75
                }
            }

            accuracies[playerColor].push(moveAccuracy)

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
        <div className="w-full px-4 py-2 flex flex-col gap-3 select-none">
            {/* Header: Player Cards side-by-side */}
            <div className="grid grid-cols-[80px_1fr_1fr] items-center gap-2">
                <span className="text-xs font-bold text-neutral-400">Players</span>

                {/* White Player */}
                <div className="flex flex-col items-center text-center gap-1.5 min-w-0">
                    <span className="font-extrabold text-white text-sm truncate max-w-[120px]" title={players[0]?.name}>
                        {players[0]?.name || 'White'}
                    </span>
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-[#dbd9d6] flex items-end justify-center shadow-md border-2 border-transparent">
                        <Profile width={50} height={50} class="fill-white" />
                        {isWhiteWinner && (
                            <span className="absolute -top-1 -right-1 bg-[#e6912c] text-white p-1 rounded-full shadow-lg" title="Winner">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
                                </svg>
                            </span>
                        )}
                    </div>
                </div>

                {/* Black Player */}
                <div className="flex flex-col items-center text-center gap-1.5 min-w-0">
                    <span className="font-extrabold text-white text-sm truncate max-w-[120px]" title={players[1]?.name}>
                        {players[1]?.name || 'Black'}
                    </span>
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-[#45423e] flex items-end justify-center shadow-md border-2 border-transparent">
                        <Profile width={50} height={50} class="fill-[#211f1c]" />
                        {isBlackWinner && (
                            <span className="absolute -top-1 -right-1 bg-[#e6912c] text-white p-1 rounded-full shadow-lg" title="Winner">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
                                </svg>
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Accuracy Row */}
            <div className="grid grid-cols-[80px_1fr_1fr] items-center gap-2">
                <span className="text-xs font-bold text-neutral-400">Accuracy</span>

                {/* White Accuracy */}
                <div className="flex justify-center">
                    <div className="w-20 py-1.5 bg-white text-[#211f1c] font-black text-base md:text-lg rounded-xl text-center shadow-sm tabular-nums">
                        {isNaN(accuracy.w) ? '—' : accuracy.w.toFixed(1)}%
                    </div>
                </div>

                {/* Black Accuracy */}
                <div className="flex justify-center">
                    <div className="w-20 py-1.5 bg-[#1e1d1a] text-white border border-white/10 font-black text-base md:text-lg rounded-xl text-center shadow-sm tabular-nums">
                        {isNaN(accuracy.b) ? '—' : accuracy.b.toFixed(1)}%
                    </div>
                </div>
            </div>
        </div>
    )
}