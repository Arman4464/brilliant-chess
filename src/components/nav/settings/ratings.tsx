import { capitalizeFirst } from "@/components/menu/analyze/selectChessCom"
import { ConfigContext, defaultUsedRatings, usedRatings } from "@/context/config"
import { useContext, useEffect } from "react"
import { boardThemes } from "./themes"
import { QUEEN, WHITE } from "chess.js"
import PieceSVG from "@/components/svg/piece"
import { moveRating } from "@/engine/stockfish"
import RatingSVG from "@/components/svg/rating"

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
    "forced",
]

function serializeRatings(usedRatings: usedRatings) {
    const serializedRatings: (0|1)[] = []
    for (const rating of ratings) {
        if (usedRatings[rating as keyof typeof usedRatings]) serializedRatings.push(1)
        else serializedRatings.push(0)
    }
    return serializedRatings.join('')
}

function unserializeRatings(serializedUsedRatings: string) {
    const unserializedRatings: usedRatings = {...defaultUsedRatings}
    const serializedRatings = serializedUsedRatings.split('').map(Number)
    if (serializedRatings.length !== ratings.length) throw new Error('Invalid serialized ratings')

    for (const [i, rating] of ratings.entries()) {
        if (isNaN(serializedRatings[i])) throw new Error('Invalid serialized ratings')

        if (serializedRatings[i]) unserializedRatings[rating as keyof typeof unserializedRatings] = true
        else unserializedRatings[rating as keyof typeof unserializedRatings] = false
    }
    return unserializedRatings
}

export default function Ratings() {
    const configContext = useContext(ConfigContext)
    
    const [usedRatings, setUsedRatings] = configContext.usedRatings
    const [boardTheme] = configContext.boardTheme
    const [highlightByRating, setHighlightByRating] = configContext.highlightByRating

    useEffect(() => {
        const serializedUsedRatings = localStorage.getItem('usedRatings')
        if (!serializedUsedRatings) return
        try {
            const usedRatings = unserializeRatings(serializedUsedRatings)
            setUsedRatings(usedRatings)
        } catch {
            localStorage.setItem('usedRatings', serializeRatings(defaultUsedRatings))
            setUsedRatings(defaultUsedRatings)
        }
    }, [])

    useEffect(() => {
        const highlightByRating = localStorage.getItem('highlightByRating')
        if (!highlightByRating) return
        const numberHighlightByRating = Number(highlightByRating)
        if (!isNaN(numberHighlightByRating)) {
            setHighlightByRating(Boolean(numberHighlightByRating))
        } else {
            localStorage.setItem('highlightByRating', '1')
            setHighlightByRating(true)
        }
    }, [])

    function toggleHighlightByRating() {
        const newHighlightByRating = !highlightByRating

        localStorage.setItem('highlightByRating', String(Number(newHighlightByRating)))

        setHighlightByRating(newHighlightByRating)
    }

    return (
        <section className="border-b border-white/5 pb-2">
            <div className="px-3 py-1.5 bg-white/5 border-b border-white/10 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Move Ratings
            </div>
            <button
                onClick={toggleHighlightByRating}
                type="button"
                className="flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors w-full cursor-pointer text-left"
            >
                <div className="flex items-center gap-2.5">
                    <div className="grid grid-cols-2 w-fit">
                        {Array.from({ length: 4 }).map((_, i) => {
                            const isEvenCol = i % 2 === 0
                            const isEvenRow = Math.floor(i / 2) % 2 === 0

                            const squareColor = isEvenCol ? (isEvenRow ? boardThemes[boardTheme].white : boardThemes[boardTheme].black) : (isEvenRow ? boardThemes[boardTheme].black : boardThemes[boardTheme].white)

                            return (
                                <div key={i} style={{ backgroundColor: squareColor }} className="h-4 w-4 relative">
                                    {i === 2 || i === 3 ? <div className="w-full h-full absolute top-0 left-0 opacity-50" style={{backgroundColor: highlightByRating ? 'var(--highlightGreat)' : boardThemes[boardTheme].highlight}} /> : null}
                                    {i === 3 ? (
                                        <>
                                            <PieceSVG className="absolute z-10 top-0 left-0" piece={QUEEN} size={16} color={WHITE} />
                                            <RatingSVG rating="great" size={10} className="absolute top-0 right-0 translate-x-1/2 translate-y-[-50%]" />
                                        </>
                                    ) : null}
                                </div>
                            )
                        })}
                    </div>
                    <span className="font-semibold text-sm text-neutral-200">Highlight by rating</span>
                </div>
                <div className={`w-8 h-4 transition-colors relative flex items-center px-0.5 ${highlightByRating ? 'bg-[#81b64c]' : 'bg-neutral-700'}`}>
                    <div className={`w-3 h-3 bg-white transition-transform ${highlightByRating ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
            </button>
            {ratings.map((rating, i) => {
                function toggleRating() {
                    const newUsedRatings = {
                        ...usedRatings,
                        [rating]: !usedRatings[rating as keyof typeof usedRatings]
                    }
                    setUsedRatings(newUsedRatings)
                    localStorage.setItem('usedRatings', serializeRatings(newUsedRatings))
                }

                const isActive = Boolean(usedRatings[rating as keyof typeof usedRatings])

                return (
                    <button
                        onClick={toggleRating}
                        type="button"
                        key={i}
                        className="flex items-center justify-between px-3 py-1.5 hover:bg-white/5 transition-colors w-full cursor-pointer text-left"
                    >
                        <div className="flex items-center gap-2.5">
                            <RatingSVG rating={rating} size={22} className="w-6 h-6 flex justify-center items-center flex-shrink-0" />
                            <span className="font-semibold text-sm text-neutral-200">{capitalizeFirst(rating)}</span>
                        </div>
                        <div className={`w-8 h-4 transition-colors relative flex items-center px-0.5 ${isActive ? 'bg-[#81b64c]' : 'bg-neutral-700'}`}>
                            <div className={`w-3 h-3 bg-white transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                    </button>
                )
            })}
        </section>
    )
}