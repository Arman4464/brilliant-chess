import { useContext, useEffect, useRef, useState } from "react"
import Lens from "../../svg/lens"
import LoadingBar from "./loadingBar"
import { AnalyzeContext } from "@/context/analyze"

export default function Loading(props: { format: string, analyzeController?: AbortController }) {
    const [ellipsis, setEllipsis] = useState('')

    const analyzeContext = useContext(AnalyzeContext)
    const [progress] = analyzeContext.progress
    const [analysisProgress] = analyzeContext.analysisProgress
    const [players] = analyzeContext.players

    const ellipsisRef = useRef(ellipsis)
    const { format, analyzeController } = props

    useEffect(() => {
        ellipsisRef.current = ellipsis
    }, [ellipsis])

    useEffect(() => {
        function animateEllipsis() {
            const ellipsis = ellipsisRef.current
            if (ellipsis.length >= 3) {
                setEllipsis('')
            } else {
                setEllipsis(ellipsis + '.')
            }
        }

        const ellipsisInterval = setInterval(animateEllipsis, 300)
        return () => clearInterval(ellipsisInterval)
    }, [])

    function cancel() {
        analyzeController?.abort()
    }

    const currentPct = Math.round(
        analysisProgress.progress > 0
            ? analysisProgress.progress
            : progress > 0
                ? progress
                : 0
    )

    const totalMoves = analysisProgress.totalMoves || 0
    const currentMove = analysisProgress.currentMove || 0
    const moveSan = analysisProgress.moveSan || ''
    const moveColor = analysisProgress.moveColor
    const stage = analysisProgress.stage || 'Analyzing moves with Multi-PV 2...'
    const elapsedSeconds = analysisProgress.elapsedSeconds || 0
    const etaSeconds = analysisProgress.etaSeconds
    const speed = analysisProgress.speed

    // Format remaining time nicely
    function formatEta(): string {
        if (currentPct >= 100) return 'Review complete'
        if (etaSeconds === undefined || etaSeconds === null) {
            return currentMove > 0 ? 'Estimating...' : 'Calculating...'
        }
        if (etaSeconds <= 0) return 'Wrapping up...'
        if (etaSeconds < 4) return '< 4s remaining'
        if (etaSeconds >= 60) {
            const m = Math.floor(etaSeconds / 60)
            const s = etaSeconds % 60
            return `~${m}m ${s.toString().padStart(2, '0')}s remaining`
        }
        return `~${etaSeconds}s remaining`
    }

    // Format elapsed seconds as m:ss
    function formatElapsed(secs: number): string {
        const m = Math.floor(secs / 60)
        const s = secs % 60
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    const whiteName = players[0]?.name && players[0]?.name !== 'White' ? players[0].name : ''
    const blackName = players[1]?.name && players[1]?.name !== 'Black' ? players[1].name : ''
    const matchup = whiteName && blackName ? `${whiteName} vs ${blackName}` : `${format.toUpperCase()} Game`

    return (
        <div className="flex flex-col flex-grow h-full bg-[#262421] select-none">
            {/* Header Status Bar */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between flex-shrink-0 bg-[#211f1c]">
                <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-[#81b64c] shadow-[0_0_8px_rgba(129,182,76,0.9)] animate-pulse"></span>
                    <span className="text-sm font-bold text-white tracking-wider">
                        ANALYZING GAME{ellipsis}
                    </span>
                </div>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 bg-white/5 border border-white/10 text-[#81b64c]">
                    DEPTH 18 • MULTI-PV 2
                </span>
            </div>

            {/* Scrollable Center Body */}
            <div className="flex-1 p-5 flex flex-col justify-between gap-4 overflow-y-auto min-h-0">
                {/* Hero Percentage & Progress Card */}
                <div className="bg-[#211f1c] border border-white/10 p-5 flex flex-col gap-4 shadow-lg">
                    <div className="flex items-baseline justify-between">
                        <div className="flex items-baseline gap-2">
                            <span className="text-5xl font-extrabold text-white tracking-tight font-mono">
                                {currentPct}%
                            </span>
                            <span className="text-xs text-neutral-400 font-medium">completed</span>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-semibold text-neutral-300">
                                {totalMoves > 0 ? `Move ${currentMove} of ${totalMoves}` : 'Initializing'}
                            </div>
                            <div className="text-[11px] text-neutral-500 truncate max-w-[150px]">
                                {matchup}
                            </div>
                        </div>
                    </div>

                    {/* High-tech Sharp Progress Bar */}
                    <LoadingBar progress={currentPct} transitionTime={150} height="h-2.5" />

                    <div className="flex justify-between items-center text-[11px] text-neutral-400 font-mono">
                        <span>0%</span>
                        <span className="text-neutral-500">Stockfish 19 Engine</span>
                        <span>100%</span>
                    </div>
                </div>

                {/* Position & Notation Live Card */}
                <div className="bg-[#211f1c] border border-white/10 p-4 flex flex-col gap-3 shadow-md">
                    <div className="flex items-center justify-between text-xs text-neutral-400 border-b border-white/5 pb-2">
                        <span className="font-semibold tracking-wider text-[11px] text-neutral-400">
                            POSITION STATUS
                        </span>
                        {totalMoves > 0 && (
                            <span className="font-mono text-[11px] bg-white/5 px-2 py-0.5 border border-white/10 text-neutral-300">
                                Ply {currentMove} / {totalMoves}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-3">
                            {moveSan ? (
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`w-3 h-3 border border-white/20 inline-block ${
                                            moveColor === 'w' ? 'bg-white' : 'bg-neutral-800'
                                        }`}
                                        title={moveColor === 'w' ? 'White move' : 'Black move'}
                                    />
                                    <span className="text-xl font-bold font-mono text-[#81b64c]">
                                        {moveSan}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Lens class="animate-spin fill-[#81b64c]" size={18} />
                                    <span className="text-sm font-semibold text-neutral-300">
                                        Evaluating position...
                                    </span>
                                </div>
                            )}
                        </div>

                        <span className="text-xs text-neutral-400 italic text-right max-w-[180px] truncate">
                            {stage}
                        </span>
                    </div>
                </div>

                {/* Time & Speed Metrics Grid */}
                <div className="grid grid-cols-2 gap-3">
                    {/* Time Left Card */}
                    <div className="bg-[#211f1c] border border-white/10 p-3.5 flex flex-col gap-1 shadow-sm">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-neutral-400 uppercase">
                            <svg className="w-3 h-3 text-[#81b64c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                                <polyline points="12 6 12 12 16 14" strokeWidth="2" />
                            </svg>
                            <span>Est. Remaining</span>
                        </div>
                        <div className="text-base font-bold font-mono text-white tracking-tight mt-0.5">
                            {formatEta()}
                        </div>
                    </div>

                    {/* Elapsed & Speed Card */}
                    <div className="bg-[#211f1c] border border-white/10 p-3.5 flex flex-col gap-1 shadow-sm">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-neutral-400 uppercase">
                            <svg className="w-3 h-3 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <span>Elapsed • Speed</span>
                        </div>
                        <div className="text-base font-bold font-mono text-neutral-200 tracking-tight mt-0.5">
                            {formatElapsed(elapsedSeconds)}
                            {speed && speed > 0 ? (
                                <span className="text-xs font-normal text-neutral-400 ml-1.5">
                                    • {speed} pos/s
                                </span>
                            ) : null}
                        </div>
                    </div>
                </div>

                {/* Cancel Action */}
                <div className="pt-2">
                    <button
                        onClick={cancel}
                        type="button"
                        className="w-full py-2.5 px-4 bg-[#1e1c19] hover:bg-[#2c2925] border border-white/10 text-neutral-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <line x1="18" y1="6" x2="6" y2="18" strokeWidth="2" strokeLinecap="round" />
                            <line x1="6" y1="6" x2="18" y2="18" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <span>Cancel Analysis</span>
                    </button>
                </div>
            </div>
        </div>
    )
}