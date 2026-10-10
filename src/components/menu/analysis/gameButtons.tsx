"use client"

import { useContext, useEffect } from "react"
import { AnalyzeContext } from "@/context/analyze"

export default function GameButtons() {
    const analyzeContext = useContext(AnalyzeContext)

    const [playing] = analyzeContext.playing
    const gameController = analyzeContext.gameController

    // Global keyboard navigation: Left (prev), Right (next), Space (play/pause)
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            // Do not trigger if typing in an input or textarea
            const target = e.target as HTMLElement
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
                return
            }

            if (e.key === 'ArrowLeft') {
                e.preventDefault()
                gameController.back()
            } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                gameController.forward()
            } else if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault()
                if (playing) {
                    gameController.pause()
                } else {
                    gameController.play()
                }
            } else if (e.key === 'Home') {
                e.preventDefault()
                gameController.first()
            } else if (e.key === 'End') {
                e.preventDefault()
                gameController.last()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [playing, gameController])

    return (
        <div className="w-full px-4 py-2 flex items-center justify-center gap-1.5 select-none bg-black/15 border-t border-white/5">
            {/* First Move */}
            <button
                type="button"
                onClick={() => gameController.first()}
                title="First Move (Home)"
                className="w-10 h-10 rounded-lg bg-[#312e2b] hover:bg-[#3d3a36] text-neutral-300 hover:text-white flex items-center justify-center active:scale-95 transition-all shadow-sm"
            >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
            </button>

            {/* Previous Move */}
            <button
                type="button"
                onClick={() => gameController.back()}
                title="Previous Move (Left Arrow)"
                className="w-12 h-10 rounded-lg bg-[#312e2b] hover:bg-[#3d3a36] text-neutral-300 hover:text-white flex items-center justify-center active:scale-95 transition-all shadow-sm"
            >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                </svg>
            </button>

            {/* Play / Pause */}
            <button
                type="button"
                onClick={() => playing ? gameController.pause() : gameController.play()}
                title={playing ? "Pause (Space)" : "Auto-Play (Space)"}
                className="w-14 h-10 rounded-lg bg-[#81b64c] hover:bg-[#8cc352] text-white flex items-center justify-center active:scale-95 transition-all shadow-md font-bold"
            >
                {playing ? (
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                ) : (
                    <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                )}
            </button>

            {/* Next Move */}
            <button
                type="button"
                onClick={() => gameController.forward()}
                title="Next Move (Right Arrow)"
                className="w-12 h-10 rounded-lg bg-[#312e2b] hover:bg-[#3d3a36] text-neutral-300 hover:text-white flex items-center justify-center active:scale-95 transition-all shadow-sm"
            >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
            </button>

            {/* Last Move */}
            <button
                type="button"
                onClick={() => gameController.last()}
                title="Last Move (End)"
                className="w-10 h-10 rounded-lg bg-[#312e2b] hover:bg-[#3d3a36] text-neutral-300 hover:text-white flex items-center justify-center active:scale-95 transition-all shadow-sm"
            >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
            </button>
        </div>
    )
}