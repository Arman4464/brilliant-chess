import { moveRating } from "@/engine/stockfish"
import { avg } from "./playersAccuracy"
import RatingBox from "./ratingBox"
import RatingSVG from "@/components/svg/rating"
import { players } from "@/context/analyze"

function topElo(elo: number) {
    const MAX_ELO = 3000

    if (elo > MAX_ELO) return `${MAX_ELO}+`
    if (elo < 200) return '200'
    else return String(elo)
}

export function getPerformanceRating(accuracy: number, playerElo?: string | number): number {
    if (isNaN(accuracy) || accuracy <= 0) return 0

    const parsedElo = typeof playerElo === 'number' ? playerElo : parseInt(String(playerElo), 10)
    const hasValidElo = !isNaN(parsedElo) && parsedElo > 100 && parsedElo < 3500

    if (hasValidElo) {
        // Calibrated Chess.com Performance Rating Model:
        // Blends player's baseline rating with accuracy-based performance bracket
        const eloWeight = 0.25
        const accuracyPerformance = 800 + (accuracy - 65) * 40
        const rawPerf = eloWeight * parsedElo + (1 - eloWeight) * accuracyPerformance
        const rounded = Math.round(rawPerf / 50) * 50
        return Math.max(100, Math.min(3200, rounded))
    }

    // Fallback when Elo is not known (graduated scale matching Chess.com)
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
    if (avgAccuracy >= 95) {
        rating = 'great'
    } else if (avgAccuracy >= 90) {
        rating = 'best'
    } else if (avgAccuracy >= 80) {
        rating = 'excellent'
    } else if (avgAccuracy >= 60) {
        rating = 'good'
    } else if (avgAccuracy >= 40) {
        rating = 'inaccuracy'
    } else if (avgAccuracy >= 20) {
        rating = 'mistake'
    } else {
        rating = 'blunder'
    }

    return { rating, accuracy: avgAccuracy.toFixed(1) }
}

function RatingIcon(props: { ratingPhase: {rating: moveRating|null, accuracy: string|null}, titleText: string }) {
    const { titleText, ratingPhase } = props
    const { rating, accuracy } = ratingPhase

    if (!rating || !accuracy) return <span className="text-xl" title="Not enough moves to evaluate this phase.">-</span>

    return <RatingSVG draggable rating={rating} size={30} title={titleText + ': ' + accuracy} />
}

export default function GameRating(props: { reducedSummary: boolean, players?: players, accuracy: { w: number, b: number }, accuracyPhases: { opening: { w: number[], b: number[] }, middlegame: { w: number[], b: number[] }, endgame: { w: number[], b: number[] } } }) {
    const { accuracy, accuracyPhases, reducedSummary, players } = props

    return (
        <div className="w-[85%] flex flex-col items-end gap-3">
            <div className="flex flex-row w-full justify-between items-center">
                <span className="font-semibold text-white/80 text-[14px]">Game Rating</span>
                <div className="flex flex-row reduceSummary:w-[262px] reduceSummary:min-w-[262px] min-w-[160px] w-[160px] justify-between">
                    <RatingBox fontSize={reducedSummary ? 18 : undefined} width={reducedSummary ? 64 : undefined} paddingY={reducedSummary ? 4 : undefined} white>{topElo(players?.[0]?.performanceRating ?? getPerformanceRating(accuracy.w, players?.[0]?.elo))}</RatingBox>
                    <RatingBox fontSize={reducedSummary ? 18 : undefined} width={reducedSummary ? 64 : undefined} paddingY={reducedSummary ? 4 : undefined}>{topElo(players?.[1]?.performanceRating ?? getPerformanceRating(accuracy.b, players?.[1]?.elo))}</RatingBox>
                </div>
            </div>
            <div className="flex flex-row w-full justify-between items-center">
                <span className="font-bold text-foregroundGrey reduceSummary:text-lg text-base">Opening</span>
                <div className="flex flex-row reduceSummary:w-[262px] w-[160px] justify-between">
                    <div className="reduceSummary:w-20 w-16 flex items-center justify-center select-none"><RatingIcon ratingPhase={getRatingPhase(accuracyPhases.opening.w)} titleText="Opening Accuracy" /></div>
                    <div className="reduceSummary:w-20 w-16 flex items-center justify-center select-none"><RatingIcon ratingPhase={getRatingPhase(accuracyPhases.opening.b)} titleText="Opening Accuracy" /></div>
                </div>
            </div>
            <div className="flex flex-row w-full justify-between items-center">
                <span className="font-bold text-foregroundGrey reduceSummary:text-lg text-base">Midgame</span>
                <div className="flex flex-row reduceSummary:w-[262px] w-[160px] justify-between">
                    <div className="reduceSummary:w-20 w-16 flex items-center justify-center select-none"><RatingIcon ratingPhase={getRatingPhase(accuracyPhases.middlegame.w)} titleText="Middlegame Accuracy" /></div>
                    <div className="reduceSummary:w-20 w-16 flex items-center justify-center select-none"><RatingIcon ratingPhase={getRatingPhase(accuracyPhases.middlegame.b)} titleText="Middlegame Accuracy" /></div>
                </div>
            </div>
            <div className="flex flex-row w-full justify-between items-center">
                <span className="font-bold text-foregroundGrey reduceSummary:text-lg text-base">Endgame</span>
                <div className="flex flex-row reduceSummary:w-[262px] w-[160px] justify-between">
                    <div className="reduceSummary:w-20 w-16 flex items-center justify-center select-none"><RatingIcon ratingPhase={getRatingPhase(accuracyPhases.endgame.w)} titleText="Endgame Accuracy" /></div>
                    <div className="reduceSummary:w-20 w-16 flex items-center justify-center select-none"><RatingIcon ratingPhase={getRatingPhase(accuracyPhases.endgame.b)} titleText="Endgame Accuracy" /></div>
                </div>
            </div>
        </div>
    )
}