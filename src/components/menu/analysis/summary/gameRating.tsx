"use client"

import { moveRating } from "@/engine/stockfish"
import { avg } from "./playersAccuracy"
import RatingSVG from "@/components/svg/rating"
import { players } from "@/context/analyze"

function topElo(elo: number) {
    const MAX_ELO = 3000
    if (elo > MAX_ELO) return `${MAX_ELO}+`
    if (elo < 200) return '200'
    return String(elo)
}

export function getPerformanceRating(accuracy: number, playerElo?: string | number): number {
    if (isNaN(accuracy) || accuracy <= 0) return 0

    const parsedElo = typeof playerElo === 'number' ? playerElo : parseInt(String(playerElo), 10)
    const hasValidElo = !isNaN(parsedElo) && parsedElo > 100 && parsedElo < 3500

    if (hasValidElo) {
        const eloWeight = 0.25
        const accuracyPerformance = 800 + (accuracy - 65) * 40
        const rawPerf = eloWeight * parsedElo + (1 - eloWeight) * accuracyPerformance
        const rounded = Math.round(rawPerf / 50) * 50
        return Math.max(100, Math.min(3200, rounded))
    }

    let rating = 300
    if (accuracy >= 98) rating = 2800
    else if (accuracy >= 95) rating = 2400
    else if (accuracy >= 90) rating = 2050
    else if (accuracy >= 85) rating = 1750
    else if (accuracy >= 80) rating = 1450
    else if (accuracy >= 75) rating = 1200
    else if (accuracy >= 70) rating = 1000
    else if (accuracy >= 65) rating = 800
    else if (accuracy >= 60) rating = 650
    else if (accuracy >= 50) rating = 500
    else rating = 350

    return rating
}

function getRatingPhase(accuracy: number[]) {
    const avgAccuracy = avg(accuracy)
    if (accuracy.length < 3) return { rating: null, accuracy: null }

    let rating: moveRating
    if (avgAccuracy >= 95) rating = 'great'
    else if (avgAccuracy >= 90) rating = 'best'
    else if (avgAccuracy >= 80) rating = 'excellent'
    else if (avgAccuracy >= 60) rating = 'good'
    else if (avgAccuracy >= 40) rating = 'inaccuracy'
    else if (avgAccuracy >= 20) rating = 'mistake'
    else rating = 'blunder'

    return { rating, accuracy: avgAccuracy.toFixed(1) }
}

function RatingIcon(props: { ratingPhase: { rating: moveRating | null, accuracy: string | null }, titleText: string }) {
    const { titleText, ratingPhase } = props
    const { rating, accuracy } = ratingPhase

    if (!rating || !accuracy) return <span className="text-neutral-500 font-bold text-sm">—</span>

    return <RatingSVG draggable rating={rating} size={22} title={titleText + ': ' + accuracy} />
}

export default function GameRating(props: {
    reducedSummary?: boolean
    players?: players
    accuracy: { w: number, b: number }
    accuracyPhases: {
        opening: { w: number[], b: number[] }
        middlegame: { w: number[], b: number[] }
        endgame: { w: number[], b: number[] }
    }
}) {
    const { accuracy, accuracyPhases, players } = props

    const whiteRating = topElo(players?.[0]?.performanceRating ?? getPerformanceRating(accuracy.w, players?.[0]?.elo))
    const blackRating = topElo(players?.[1]?.performanceRating ?? getPerformanceRating(accuracy.b, players?.[1]?.elo))

    return (
        <div className="w-full px-4 py-2 flex flex-col gap-2.5 select-none">
            {/* Performance Rating Row */}
            <div className="grid grid-cols-[80px_1fr_1fr] items-center gap-2">
                <span className="text-xs font-bold text-neutral-400">Game Rating</span>

                {/* White Rating */}
                <div className="flex justify-center">
                    <div className="w-20 py-1.5 bg-white text-[#211f1c] font-black text-base md:text-lg text-center shadow-sm tabular-nums">
                        {whiteRating}
                    </div>
                </div>

                {/* Black Rating */}
                <div className="flex justify-center">
                    <div className="w-20 py-1.5 bg-[#1e1d1a] text-white border border-white/10 font-black text-base md:text-lg text-center shadow-sm tabular-nums">
                        {blackRating}
                    </div>
                </div>
            </div>

            {/* Opening Phase */}
            <div className="grid grid-cols-[80px_1fr_1fr] items-center py-1">
                <span className="text-xs font-bold text-neutral-300">Opening</span>
                <div className="flex justify-center">
                    <RatingIcon ratingPhase={getRatingPhase(accuracyPhases.opening.w)} titleText="White Opening" />
                </div>
                <div className="flex justify-center">
                    <RatingIcon ratingPhase={getRatingPhase(accuracyPhases.opening.b)} titleText="Black Opening" />
                </div>
            </div>

            {/* Midgame Phase */}
            <div className="grid grid-cols-[80px_1fr_1fr] items-center py-1">
                <span className="text-xs font-bold text-neutral-300">Middlegame</span>
                <div className="flex justify-center">
                    <RatingIcon ratingPhase={getRatingPhase(accuracyPhases.middlegame.w)} titleText="White Middlegame" />
                </div>
                <div className="flex justify-center">
                    <RatingIcon ratingPhase={getRatingPhase(accuracyPhases.middlegame.b)} titleText="Black Middlegame" />
                </div>
            </div>

            {/* Endgame Phase */}
            <div className="grid grid-cols-[80px_1fr_1fr] items-center py-1">
                <span className="text-xs font-bold text-neutral-300">Endgame</span>
                <div className="flex justify-center">
                    <RatingIcon ratingPhase={getRatingPhase(accuracyPhases.endgame.w)} titleText="White Endgame" />
                </div>
                <div className="flex justify-center">
                    <RatingIcon ratingPhase={getRatingPhase(accuracyPhases.endgame.b)} titleText="Black Endgame" />
                </div>
            </div>
        </div>
    )
}