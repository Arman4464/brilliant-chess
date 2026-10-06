import RatingSVG from "@/components/svg/rating";
import { move, moveRating } from "@/engine/stockfish";
import { useEffect, useState } from "react";

const ratings: moveRating[] = [
    "brilliant", // text-highlightBrilliant
    "great", // text-highlightGreat
    "book", // text-highlightBook
    "best", // text-highlightBest
    "excellent", // text-highlightExcellent
    "good", // text-highlightGood
    "inaccuracy", // text-highlightInaccuracy
    "mistake", // text-highlightMistake
    "miss", // text-highlightMiss
    "blunder", // text-highlightBlunder
]

function title(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

const ratingColorMap: Record<moveRating, string> = {
    brilliant: 'var(--highlightBrilliant)',
    great: 'var(--highlightGreat)',
    book: 'var(--highlightBook)',
    best: 'var(--highlightBest)',
    excellent: 'var(--highlightExcellent)',
    good: 'var(--highlightGood)',
    inaccuracy: 'var(--highlightInaccuracy)',
    mistake: 'var(--highlightMistake)',
    miss: 'var(--highlightMiss)',
    blunder: 'var(--highlightBlunder)',
    forced: '#ffffff',
}

export default function RatingCount(props: { moves: move[] }) {
    const [counter, setCounter] = useState<{ w: { [key: string]: number }, b: { [key: string]: number } }>({ w: {}, b: {} })
    const { moves } = props

    useEffect(() => {
        const newCounter: { w: { [key: string]: number }, b: { [key: string]: number } } = { w: {}, b: {} }
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
        <div className="w-[85%] flex flex-col gap-1.5 justify-center">
            {ratings.map(rating => {
                const titleRating = title(rating)
                const color = ratingColorMap[rating] || '#ffffff'

                return (
                    <div key={rating} className="flex flex-row items-center justify-between py-0.5">
                        <span className="font-semibold text-white/80 text-[14px]">{titleRating}</span>
                        <div className="flex flex-row items-center font-bold text-[17px] w-[160px] reduceSummary:w-[262px] justify-between">
                            <span className="w-14 text-center select-none" style={{ color }}>{counter.w[rating] ?? 0}</span>
                            <div className="flex items-center justify-center w-8 select-none">
                                <RatingSVG draggable className="select-none" rating={rating} size={24} />
                            </div>
                            <span className="w-14 text-center select-none" style={{ color }}>{counter.b[rating] ?? 0}</span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}