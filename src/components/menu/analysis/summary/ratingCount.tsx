"use client"

import RatingSVG from "@/components/svg/rating"
import { move, moveRating } from "@/engine/stockfish"
import { useEffect, useState } from "react"

const ratings: moveRating[] = [
    "brilliant",
    "great",
    "best",
    "excellent",
    "good",
    "book",
    "inaccuracy",
    "mistake",
    "miss",
    "blunder",
]

function title(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

const ratingColorMap: Record<moveRating, string> = {
    brilliant: '#26c2a3',
    great: '#5c8bb0',
    best: '#81b64c',
    excellent: '#96bc4b',
    good: '#a3b18a',
    book: '#d5a47d',
    inaccuracy: '#f7c631',
    mistake: '#ffa459',
    miss: '#ff7769',
    blunder: '#fa412d',
    forced: '#9e9d9c',
}

export default function RatingCount(props: { moves: move[] }) {
    const [counter, setCounter] = useState<{ w: Record<string, number>, b: Record<string, number> }>({ w: {}, b: {} })
    const { moves } = props

    useEffect(() => {
        const newCounter: { w: Record<string, number>, b: Record<string, number> } = { w: {}, b: {} }
        ratings.forEach(r => {
            newCounter.w[r] = 0
            newCounter.b[r] = 0
        })

        moves.forEach((move) => {
            if (!move.moveRating) return
            const rating = move.moveRating as string
            if (rating === 'forced') return
            const key = rating.includes('book') ? 'book' : rating

            const playerColor = move.playedBy || (move.color === 'w' ? 'b' : 'w')

            if (newCounter[playerColor] && newCounter[playerColor][key] !== undefined) {
                newCounter[playerColor][key]++
            }
        })
        setCounter(newCounter)
    }, [moves])

    return (
        <div className="w-full px-4 py-1 flex flex-col gap-1 select-none">
            {ratings.map(rating => {
                const titleRating = title(rating)
                const color = ratingColorMap[rating] || '#ffffff'
                const wCount = counter.w[rating] ?? 0
                const bCount = counter.b[rating] ?? 0

                // If both are 0, we can still show or dim slightly
                const hasMoves = wCount > 0 || bCount > 0

                return (
                    <div
                        key={rating}
                        className={`grid grid-cols-[80px_1fr_1fr] items-center py-1 hover:bg-white/5 transition-colors ${
                            hasMoves ? 'opacity-100' : 'opacity-40'
                        }`}
                    >
                        {/* Rating Name & Icon */}
                        <div className="flex items-center gap-1.5">
                            <RatingSVG draggable className="select-none flex-shrink-0" rating={rating} size={18} />
                            <span className="font-semibold text-xs text-neutral-300">{titleRating}</span>
                        </div>

                        {/* White count */}
                        <div className="flex justify-center">
                            <span
                                className="font-extrabold text-sm md:text-base tabular-nums select-none"
                                style={{ color: wCount > 0 ? color : 'rgb(163, 163, 163)' }}
                            >
                                {wCount}
                            </span>
                        </div>

                        {/* Black count */}
                        <div className="flex justify-center">
                            <span
                                className="font-extrabold text-sm md:text-base tabular-nums select-none"
                                style={{ color: bCount > 0 ? color : 'rgb(163, 163, 163)' }}
                            >
                                {bCount}
                            </span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}