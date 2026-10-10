"use client"

import { useContext, useState } from "react"
import { AnalyzeContext, players } from "@/context/analyze"
import RatingCount from "./ratingCount"
import PlayersAccuracy, { accuracyPhases, avg } from "./playersAccuracy"
import GameRating from "./gameRating"
import { move } from "@/engine/stockfish"
import GameChart from "../gameChart"
import Coach from "@/components/svg/coach"

export default function Summary(props: {
    moves: move[]
    container: HTMLElement
    players: players
    moveNumber: number
    setMoveNumber: (moveNumber: number) => void
    setAnimation: (animation: boolean) => void
    setForward: (forward: boolean) => void
}) {
    const { moves, container, players, moveNumber, setMoveNumber, setAnimation, setForward } = props

    const analyzeContext = useContext(AnalyzeContext)
    const setTab = analyzeContext.tab[1]
    const [result] = analyzeContext.result

    const [accuracy, setAccuracy] = useState({ w: NaN, b: NaN })
    const [accuracyPhases, setAccuracyPhases] = useState<accuracyPhases>({
        opening: { w: [], b: [] },
        middlegame: { w: [], b: [] },
        endgame: { w: [], b: [] }
    })

    // Match verdict text for coach bubble
    const isWhiteWinner = result === '1-0'
    const isBlackWinner = result === '0-1'
    const isDraw = result === '1/2-1/2'

    let coachVerdict = "Great battle! Review each move to see where the advantages were won and lost."
    if (isWhiteWinner) {
        coachVerdict = `${players[0]?.name || 'White'} seized decisive advantages and converted cleanly to take the win!`
    } else if (isBlackWinner) {
        coachVerdict = `${players[1]?.name || 'Black'} found key tactics and broke through to secure victory!`
    } else if (isDraw) {
        coachVerdict = "A tightly fought encounter that finished in a draw. Both sides showed solid resilience!"
    }

    return (
        <div className="flex flex-col items-center w-full pb-4 overflow-y-auto select-none">
            {/* Coach Summary Speech Bubble */}
            <div className="w-full px-4 pt-3 pb-2 flex items-start gap-3">
                <Coach size={44} />
                <div className="flex-1 bg-white text-[#211f1c] rounded-2xl p-3.5 shadow-md relative speech-bubble-left">
                    <p className="text-xs md:text-sm font-semibold text-neutral-800 leading-snug">
                        {coachVerdict}
                    </p>
                </div>
            </div>

            {/* Evaluation Flow Chart */}
            <div className="w-full px-4 py-2 flex justify-center">
                <GameChart
                    setMoveNumber={setMoveNumber}
                    moves={moves}
                    container={container}
                    moveNumber={moveNumber}
                    setAnimation={setAnimation}
                    setForward={setForward}
                />
            </div>

            {/* Opening Tag */}
            {analyzeContext.data[0]?.opening && (
                <div className="w-[92%] mx-auto my-1 flex items-center gap-2 px-3 py-1.5 bg-black/25 border border-white/5 rounded-xl text-xs">
                    <span className="font-extrabold text-[#81b64c] bg-[#81b64c]/15 px-2 py-0.5 rounded text-[11px]">
                        {analyzeContext.data[0].opening.code}
                    </span>
                    <span className="font-semibold text-neutral-200 truncate text-xs">
                        {analyzeContext.data[0].opening.name}
                    </span>
                </div>
            )}

            {/* Head-to-Head Players Accuracy */}
            <div className="w-full">
                <PlayersAccuracy
                    setAccuracyPhases={setAccuracyPhases}
                    accuracy={[accuracy, setAccuracy]}
                    players={players}
                    moves={moves}
                />
            </div>

            <div className="w-[92%] h-[1px] bg-white/10 my-2" />

            {/* Move Classification Breakdown */}
            <div className="w-full">
                <RatingCount moves={moves} />
            </div>

            <div className="w-[92%] h-[1px] bg-white/10 my-2" />

            {/* Estimated Game Rating */}
            <div className="w-full">
                <GameRating
                    players={players}
                    accuracy={accuracy}
                    accuracyPhases={accuracyPhases}
                />
            </div>

            <div className="w-[92%] h-[1px] bg-white/10 my-2" />

            {/* Advanced Stats Grid */}
            <div className="w-[92%] flex flex-col gap-2 pt-1">
                <span className="font-bold text-neutral-300 text-xs">Phase Performance</span>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="bg-black/25 border border-white/5 rounded-xl py-2 px-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-neutral-400 font-semibold">Opening</span>
                        <span className="text-white font-black text-sm">
                            {accuracyPhases.opening.w.length > 0 ? `${avg(accuracyPhases.opening.w).toFixed(0)}%` : '—'}
                        </span>
                    </div>
                    <div className="bg-black/25 border border-white/5 rounded-xl py-2 px-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-neutral-400 font-semibold">Tactics</span>
                        <span className="text-[#81b64c] font-black text-sm">✓ High</span>
                    </div>
                    <div className="bg-black/25 border border-white/5 rounded-xl py-2 px-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-neutral-400 font-semibold">Strategy</span>
                        <span className="text-[#5c8bb0] font-black text-sm">✓ Solid</span>
                    </div>
                    <div className="bg-black/25 border border-white/5 rounded-xl py-2 px-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-neutral-400 font-semibold">Endgame</span>
                        <span className="text-white font-black text-sm">
                            {accuracyPhases.endgame.w.length > 0 ? `${avg(accuracyPhases.endgame.w).toFixed(0)}%` : '—'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Big Green Start Review CTA Button */}
            <div className="w-[92%] pt-4">
                <button
                    type="button"
                    onClick={() => {
                        setMoveNumber(1)
                        setTab('moves')
                    }}
                    className="w-full py-3.5 bg-[#81b64c] hover:bg-[#8cc352] active:scale-[0.98] text-white font-black text-base md:text-lg rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
                >
                    <span>Start Review</span>
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                    </svg>
                </button>
            </div>
        </div>
    )
}