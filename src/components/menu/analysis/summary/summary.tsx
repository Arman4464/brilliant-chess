import { useContext, useEffect, useRef, useState } from "react";
import { AnalyzeContext, players } from "@/context/analyze";
import RatingCount from "./ratingCount";
import PlayersAccuracy, { accuracyPhases, avg } from "./playersAccuracy";
import GameRating from "./gameRating";
import { move } from "@/engine/stockfish";
import GameChart from "../gameChart";
import { reduceSummary } from "../../../../../tailwind.config";

export default function Summary(props: { moves: move[], container: HTMLElement, players: players, moveNumber: number, setMoveNumber: (moveNumber: number) => void, setAnimation: (animation: boolean) => void, setForward: (forward: boolean) => void }) {
    const { moves, container, players, moveNumber, setMoveNumber, setAnimation, setForward } = props

    const [reducedSummary, setReducedSummary] = useState(false)
    const analyzeContext = useContext(AnalyzeContext)
    const setTab = analyzeContext.tab[1]
    const [result] = analyzeContext.result

    const componentRef = useRef<HTMLDivElement>(null)

    const [accuracy, setAccuracy] = useState({ w: NaN, b: NaN })
    const [accuracyPhases, setAccuracyPhases] = useState<accuracyPhases>({ opening: { w: [], b: [] }, middlegame: { w: [], b: [] }, endgame: { w: [], b: [] } })

    useEffect(() => {
        const observer = new ResizeObserver(entries => {
            entries.forEach(() => {
                setReducedSummary(window.innerWidth < reduceSummary)
            })
        })

        const component = componentRef.current

        if (!component) return

        observer.observe(component)
    }, [])

    return (
        <div ref={componentRef} className="flex flex-col gap-3 items-center w-full pt-1">
            <GameChart setMoveNumber={setMoveNumber} moves={moves} container={container} moveNumber={moveNumber} setAnimation={setAnimation} setForward={setForward} />
            {analyzeContext.data[0]?.opening && (
                <div className="w-[85%] flex items-center justify-between px-3.5 py-2 bg-white/5 border border-white/10 rounded-[8px] text-xs text-white/90">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <span className="font-extrabold text-[#81b64c] bg-[#81b64c]/10 px-2 py-0.5 rounded text-xs">{analyzeContext.data[0].opening.code}</span>
                        <span className="font-semibold text-white/90 truncate text-xs">{analyzeContext.data[0].opening.name}</span>
                    </div>
                </div>
            )}
            <PlayersAccuracy reducedSummary={reducedSummary} setAccuracyPhases={setAccuracyPhases} accuracy={[accuracy, setAccuracy]} players={players} moves={moves} />
            <hr className="border-t border-white/10 w-[85%] my-1" />
            <RatingCount moves={moves} />
            <hr className="border-t border-white/10 w-[85%] my-1" />
            <GameRating players={players} reducedSummary={reducedSummary} accuracy={accuracy} accuracyPhases={accuracyPhases} />
            <hr className="border-t border-white/10 w-[85%] my-1" />

            {/* Advanced Stats Preview */}
            <div className="w-[85%] flex flex-col gap-2 pt-1">
                <div className="flex flex-row justify-between items-center">
                    <span className="font-semibold text-white/80 text-[14px]">Advanced Stats</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold text-white/70">
                    <div className="bg-white/5 border border-white/10 rounded-[6px] py-2 px-1 flex flex-col items-center gap-1">
                        <span className="text-[11px] text-white/60">Opening</span>
                        <span className="text-white font-bold text-sm">
                            {accuracyPhases.opening.w.length > 0 ? `${avg(accuracyPhases.opening.w).toFixed(0)}%` : '—'}
                        </span>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-[6px] py-2 px-1 flex flex-col items-center gap-1">
                        <span className="text-[11px] text-white/60">Tactics</span>
                        <span className="text-[#81b64c] font-bold text-sm">✓ High</span>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-[6px] py-2 px-1 flex flex-col items-center gap-1">
                        <span className="text-[11px] text-white/60">Strategy</span>
                        <span className="text-[#749bbf] font-bold text-sm">✓ Solid</span>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-[6px] py-2 px-1 flex flex-col items-center gap-1">
                        <span className="text-[11px] text-white/60">Endgame</span>
                        <span className="text-white font-bold text-sm">
                            {accuracyPhases.endgame.w.length > 0 ? `${avg(accuracyPhases.endgame.w).toFixed(0)}%` : '—'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Bottom Review Action Buttons */}
            <div className="w-[85%] flex flex-col gap-2 pt-2 mb-4">
                <button
                    onClick={() => {
                        setMoveNumber(1)
                        setTab('moves')
                    }}
                    className="w-full py-3.5 bg-[#81b64c] hover:bg-[#8cc352] active:scale-[0.98] text-white font-extrabold text-[18px] rounded-[8px] shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
                >
                    Start Review
                </button>
            </div>
        </div>
    )
}