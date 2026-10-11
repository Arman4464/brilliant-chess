"use client"

import { CustomLine } from "@/context/analyze"
import { move, moveRating, square } from "@/engine/stockfish"
import { useEffect, useRef } from "react"
import Comments from "./comments"
import { WHITE } from "chess.js"
import GameChart from "../gameChart"
import RatingSVG from "@/components/svg/rating"
import { getMoves } from "@/components/game/game"

export const RATING_TEXT_COLORS: Record<string, string> = {
    forced: "",
    brilliant: "text-[#26c2a3]",
    great: "text-[#5c8bb0]",
    best: "text-[#81b64c]",
    excellent: "text-[#96bc4b]",
    good: "text-[#a3b18a]",
    book: "text-[#d5a47d]",
    inaccuracy: "text-[#f7c631]",
    mistake: "text-[#ffa459]",
    miss: "text-[#ff7769]",
    blunder: "text-[#fa412d]",
}

function getRating(
    moveNumber: number,
    rating: moveRating | undefined,
    prevRating: moveRating | undefined,
    nextRating: moveRating | undefined,
    lastBookMove: number
): { rating: moveRating, textClass: string } | undefined {
    if (!rating) return

    if (moveNumber === lastBookMove) return { rating, textClass: RATING_TEXT_COLORS[rating] || '' }

    if (rating === 'best' && prevRating === 'inaccuracy') return { rating, textClass: RATING_TEXT_COLORS[rating] || '' }

    if (['blunder', 'mistake', 'miss', 'great', 'brilliant', 'inaccuracy', 'book'].includes(rating)) {
        return { rating, textClass: RATING_TEXT_COLORS[rating] || '' }
    }

    return
}

export function getLastBookMove(moves: move[]) {
    for (let i = moves.length - 1; i >= 0; i--) {
        if (moves[i].moveRating === 'book') return i
    }
    return -1
}

export default function Moves(props: {
    moves: move[]
    container: HTMLElement
    moveNumber: number
    setMoveNumber: (moveNumber: number) => void
    setAnimation: (animation: boolean) => void
    setForward: (forward: boolean) => void
    customLine: CustomLine
    returnedToNormalGame: square[] | null
    analyzingMove: boolean
}) {
    const { moves, container, moveNumber, setMoveNumber, setAnimation, setForward, customLine, returnedToNormalGame, analyzingMove } = props

    const moveListRef = useRef<HTMLUListElement>(null)
    const firstMoveBlack = moves[1]?.color === WHITE

    function getTurns() {
        const realMoves = moves.slice(1)
        const turns: [number, string | undefined, string | undefined][] = []
        let i = 0

        if (firstMoveBlack) {
            turns.push([1, undefined, realMoves[0].san ?? ''])
            i += 1
        }

        for (; i < realMoves.length; i += 2) {
            const turn = realMoves.slice(i, i + 2) as [move, move]
            const turnNumber = Math.ceil((i + 2) / 2)

            if (turn[1]) {
                turns.push([turnNumber, turn[0].san ?? '', turn[1].san ?? ''])
            } else {
                turns.push([turnNumber, turn[0].san ?? '', undefined])
            }
        }

        return turns
    }

    function scrollToCurrentMove() {
        if (!moveListRef.current) return
        const activeItem = moveListRef.current.querySelector('[data-active-move="true"]') as HTMLElement
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
    }

    useEffect(scrollToCurrentMove, [moveNumber])

    function handleMoveClick(number: number) {
        setMoveNumber(number)
        const numberDiff = moveNumber - number
        if (numberDiff === 1) {
            setAnimation(true)
            setForward(false)
        } else if (numberDiff === -1) {
            setAnimation(true)
            setForward(true)
        }
    }

    const lastBookMove = getLastBookMove(moves)
    const { previousMove, move } = getMoves(moves, moveNumber, customLine, returnedToNormalGame)

    return (
        <div className="flex flex-col h-full overflow-hidden select-none">
            {/* Coach Speech Bubble Card */}
            <div className="w-full flex-shrink-0">
                <Comments
                    rating={analyzingMove ? previousMove?.moveRating : move?.moveRating}
                    moveSan={analyzingMove ? previousMove?.san : move?.san}
                    bestMoveSan={analyzingMove ? previousMove?.bestMoveSan : move?.bestMoveSan}
                    evaluation={analyzingMove ? previousMove?.evaluation ?? previousMove?.previousStaticEvals?.[0] ?? ["cp", "0"] : move?.evaluation ?? move?.previousStaticEvals?.[0] ?? ["cp", "0"]}
                    white={analyzingMove ? previousMove?.color === WHITE : move?.color === WHITE}
                    comment={analyzingMove ? previousMove?.comment : move?.comment}
                />
            </div>

            {/* Scrollable Move History */}
            <ul
                ref={moveListRef}
                className="flex-1 min-h-0 overflow-y-auto px-4 py-1.5 space-y-1 w-full"
            >
                {getTurns().map((turn, i) => (
                    <li key={i} className="flex items-center text-sm py-0.5 hover:bg-white/5 transition-colors">
                        <span className="w-8 font-bold text-neutral-400 text-xs tabular-nums select-none pl-1">
                            {turn[0]}.
                        </span>
                        <div className="flex items-center flex-1 gap-1">
                            {turn.slice(1).map((san, j) => {
                                if (!san) return <div key={`${i}-${j}`} className="w-1/2" />

                                const currentMoveNumber = (i * 2) + j + (firstMoveBlack ? 0 : 1)
                                const isSelected = moveNumber === currentMoveNumber
                                const targetMove = moves[currentMoveNumber]
                                const rating = targetMove?.moveRating
                                const prevRating = moves[currentMoveNumber - 1]?.moveRating
                                const nextRating = moves[currentMoveNumber + 1]?.moveRating
                                const shownRating = getRating(currentMoveNumber, rating, prevRating, nextRating, lastBookMove)

                                return (
                                    <div
                                        key={`${i}-${j}`}
                                        data-active-move={isSelected ? "true" : "false"}
                                        className={`w-1/2 flex items-center justify-between px-2 py-1 cursor-pointer transition-all ${
                                            isSelected
                                                ? 'bg-[#81b64c]/20 text-[#81b64c] font-black ring-1 ring-[#81b64c]/30'
                                                : 'hover:bg-white/5 text-neutral-200 font-bold'
                                        }`}
                                        onClick={() => handleMoveClick(currentMoveNumber)}
                                    >
                                        <span className="truncate">{san}</span>
                                        {shownRating && (
                                            <span className="flex-shrink-0 ml-1">
                                                <RatingSVG draggable rating={shownRating.rating} size={18} />
                                            </span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </li>
                ))}
            </ul>

            {/* Bottom Evaluation Chart */}
            <div className="flex-shrink-0 w-full px-4 pt-1 pb-2 border-t border-white/5 flex justify-center">
                <GameChart
                    container={container}
                    moves={moves}
                    moveNumber={moveNumber}
                    setMoveNumber={setMoveNumber}
                    setAnimation={setAnimation}
                    setForward={setForward}
                />
            </div>
        </div>
    )
}