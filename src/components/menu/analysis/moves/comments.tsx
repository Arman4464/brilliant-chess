"use client"

import RatingSVG from "@/components/svg/rating"
import Coach from "@/components/svg/coach"
import { moveRating } from "@/engine/stockfish"

const RATING_TITLES: Record<moveRating, string> = {
    brilliant: "Brilliant",
    great: "Great",
    best: "Best",
    excellent: "Excellent",
    good: "Good",
    book: "Book",
    inaccuracy: "Inaccuracy",
    mistake: "Mistake",
    miss: "Miss",
    blunder: "Blunder",
    forced: "Forced",
}

const RATING_COLORS: Record<moveRating, string> = {
    brilliant: "#26c2a3",
    great: "#5c8bb0",
    best: "#81b64c",
    excellent: "#96bc4b",
    good: "#a3b18a",
    book: "#d5a47d",
    inaccuracy: "#f7c631",
    mistake: "#ffa459",
    miss: "#ff7769",
    blunder: "#fa412d",
    forced: "#9e9d9c",
}

const RATING_DEFAULT_EXPLANATIONS: Record<moveRating, string> = {
    brilliant: "Sacrifices material to gain a decisive advantage or unstoppable tactical breakthrough!",
    great: "An energetic move that finds the only path to maintain the initiative!",
    best: "The optimal engine move, maintaining maximum position advantage.",
    excellent: "A strong move that keeps the position firmly in control.",
    good: "A solid choice that continues the plan.",
    book: "Standard opening book theory.",
    inaccuracy: "A slight inaccuracy that relinquishes part of the initiative.",
    mistake: "Overlooks a tactical threat or allows the opponent back into the game.",
    miss: "Missed a critical tactical opportunity to seize the advantage.",
    blunder: "A severe oversight that drastically shifts the game evaluation.",
    forced: "The only legal or reasonable reply.",
}

export function FormatEval(props: { evaluation: string[], white: boolean, smaller?: boolean, best?: boolean }) {
    const { evaluation, white, smaller, best } = props

    const number = (Number(evaluation[1]) / 100) * (white ? 1 : -1)

    let prevChar = ''
    if (number > 0) prevChar = '+'
    if (number < 0) prevChar = '-'

    let text = '0.00'
    if (evaluation[0] === 'mate' && evaluation[1]) {
        text = prevChar + "M" + (Math.abs(Number(evaluation[1])) - Number(Boolean(best)))
    } else if (!evaluation[1]) {
        text = white ? '0-1' : '1-0'
    } else {
        text = prevChar + Math.abs(number).toFixed(2)
    }

    const isBlackLeading = prevChar === '-'

    return (
        <span
            className={`font-extrabold rounded-md tabular-nums select-none tracking-tight inline-flex items-center justify-center ${
                smaller ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs md:text-sm'
            } ${
                isBlackLeading ? 'bg-[#262421] text-white border border-white/10' : 'bg-neutral-100 text-[#211f1c] shadow-sm'
            }`}
        >
            {text}
        </span>
    )
}

function formatBestMove(moveStr?: string) {
    if (!moveStr) return ''
    if (/^[a-h][1-8][a-h][1-8]$/.test(moveStr)) {
        return `${moveStr.slice(0, 2)}-${moveStr.slice(2, 4)}`
    }
    return moveStr
}

export default function Comments(props: {
    rating?: moveRating
    moveSan?: string
    bestMoveSan?: string
    evaluation: string[]
    white: boolean
    comment?: string
}) {
    const { rating, moveSan, bestMoveSan, evaluation, white, comment } = props

    if (!rating || !moveSan) {
        return (
            <div className="w-full px-4 pt-3 pb-2 flex items-start gap-3">
                <Coach size={44} />
                <div className="flex-1 bg-white text-[#211f1c] rounded-2xl p-3.5 shadow-md relative speech-bubble-left">
                    <p className="text-sm font-semibold text-neutral-600">
                        Navigate the move list to explore position analysis and coach feedback.
                    </p>
                </div>
            </div>
        )
    }

    const title = RATING_TITLES[rating] || rating
    const ratingColor = RATING_COLORS[rating] || '#81b64c'
    const showBestMove = bestMoveSan && bestMoveSan !== moveSan && rating !== 'best' && rating !== 'book' && rating !== 'brilliant' && rating !== 'forced'
    const explanation = comment || RATING_DEFAULT_EXPLANATIONS[rating] || ''

    return (
        <div className="w-full px-4 pt-3 pb-2 flex items-start gap-3 select-none">
            {/* Coach Avatar */}
            <Coach size={44} />

            {/* Speech Bubble */}
            <div className="flex-1 bg-white text-[#211f1c] rounded-2xl p-3.5 shadow-lg relative speech-bubble-left flex flex-col gap-2">
                {/* Header: Badge & Move SAN on left, Score Pill on right */}
                <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2">
                    <div className="flex items-center gap-2">
                        <RatingSVG draggable rating={rating} size={26} />
                        <span className="font-extrabold text-base md:text-lg" style={{ color: ratingColor }}>
                            {title}
                        </span>
                        <span className="font-bold text-neutral-800 text-sm md:text-base">
                            {moveSan}
                        </span>
                    </div>
                    <FormatEval evaluation={evaluation} white={white} />
                </div>

                {/* Explanation text */}
                <p className="text-xs md:text-sm text-neutral-700 leading-snug font-medium">
                    {explanation}
                </p>

                {/* Best move suggestion if sub-optimal */}
                {showBestMove && (
                    <div className="mt-0.5 flex items-center gap-1.5 bg-neutral-100 rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-600 w-fit">
                        <span>Best was</span>
                        <span className="font-extrabold text-[#81b64c]">{formatBestMove(bestMoveSan)}</span>
                    </div>
                )}
            </div>
        </div>
    )
}