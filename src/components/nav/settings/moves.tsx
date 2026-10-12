import { ConfigContext } from "@/context/config"
import { useContext, useEffect, useState } from "react"
import { boardThemes } from "./themes"
import { BISHOP, ROOK, WHITE } from "chess.js"
import PieceSVG from "@/components/svg/piece"
import SoundMax from "@/components/svg/soundMax"
import SoundMute from "@/components/svg/sound-mute"

export default function Moves() {
    const [animateMovesMoved, setAnimateMovesMoved] = useState(false)

    const configContext = useContext(ConfigContext)

    const [boardTheme] = configContext.boardTheme
    const [showLegalMoves, setShowLegalMoves] = configContext.showLegalMoves
    const [animateMoves, setAnimateMoves] = configContext.animateMoves
    const [boardSounds, setBoardSounds] = configContext.boardSounds

    useEffect(() => {
        setInterval(() => {
            setAnimateMovesMoved(prev => !prev)
        }, 2000)
    }, [])

    useEffect(() => {
        const showLegalMoves = localStorage.getItem('showLegalMoves')
        if (!showLegalMoves) return
        const numberShowLegalMoves = Number(showLegalMoves)
        if (!isNaN(numberShowLegalMoves)) {
            setShowLegalMoves(Boolean(numberShowLegalMoves))
        } else {
            localStorage.setItem('showLegalMoves', '1')
            setShowLegalMoves(true)
        }
    }, [])

    function toggleShowLegalMoves() {
        const newShowLegalMoves = !showLegalMoves

        localStorage.setItem('showLegalMoves', String(Number(newShowLegalMoves)))

        setShowLegalMoves(newShowLegalMoves)
    }

    useEffect(() => {
        const animateMoves = localStorage.getItem('animateMoves')
        if (!animateMoves) return
        const numberAnimateMoves = Number(animateMoves)
        if (!isNaN(numberAnimateMoves)) {
            setAnimateMoves(Boolean(numberAnimateMoves))
        } else {
            localStorage.setItem('animateMoves', '1')
            setAnimateMoves(true)
        }
    }, [])

    function toggleAnimateMoves() {
        const newAnimateMoves = !animateMoves

        localStorage.setItem('animateMoves', String(Number(newAnimateMoves)))

        setAnimateMoves(newAnimateMoves)
    }

    useEffect(() => {
        const boardSounds = localStorage.getItem('boardSounds')
        if (!boardSounds) return
        const numberBoardSounds = Number(boardSounds)
        if (!isNaN(numberBoardSounds)) {
            setBoardSounds(Boolean(numberBoardSounds))
        } else {
            localStorage.setItem('boardSounds', '1')
            setBoardSounds(true)
        }
    }, [])

    function toggleBoardSounds() {
        const newBoardSounds = !boardSounds

        localStorage.setItem('boardSounds', String(Number(newBoardSounds)))

        setBoardSounds(newBoardSounds)
    }

    return (
        <section className="border-b border-white/5 pb-2">
            <div className="px-3 py-1.5 bg-white/5 border-b border-white/10 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Moves & Board
            </div>
            <button
                onClick={toggleShowLegalMoves}
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
                                    {i === 2 ? <>
                                        <PieceSVG className="absolute z-10 top-0 left-0" piece={BISHOP} size={16} color={WHITE} />
                                        <div className="w-full h-full opacity-50 absolute top-0 left-0" style={{ backgroundColor: boardThemes[boardTheme].highlight }} />
                                    </> : null}
                                    {i === 1 && showLegalMoves ? <div className="absolute w-full h-full top-0 left-0 flex justify-center items-center pointer-events-auto"><div className="bg-black opacity-[25%] w-[30%] h-[30%]" /></div> : null }
                                </div>
                            )
                        })}
                    </div>
                    <span className="font-semibold text-sm text-neutral-200">Show legal moves</span>
                </div>
                <div className={`w-8 h-4 transition-colors relative flex items-center px-0.5 ${showLegalMoves ? 'bg-[#81b64c]' : 'bg-neutral-700'}`}>
                    <div className={`w-3 h-3 bg-white transition-transform ${showLegalMoves ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
            </button>

            <button
                onClick={toggleAnimateMoves}
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
                                    {i === 2 ? <>
                                        <PieceSVG style={{transform: animateMovesMoved ? 'translateX(16px)' : '', transition: animateMoves ? '150ms' : '', transitionTimingFunction: animateMoves ? 'linear' : ''}} className="absolute z-10 top-0 left-0" piece={ROOK} size={16} color={WHITE} />
                                        <div className="w-full h-full opacity-50 absolute top-0 left-0" style={{ backgroundColor: boardThemes[boardTheme].highlight }} />
                                    </> : null}
                                    {i === 3 ? <div className="w-full h-full opacity-50 absolute top-0 left-0" style={{ backgroundColor: boardThemes[boardTheme].highlight }} /> : null}
                                </div>
                            )
                        })}
                    </div>
                    <span className="font-semibold text-sm text-neutral-200">Animate moves</span>
                </div>
                <div className={`w-8 h-4 transition-colors relative flex items-center px-0.5 ${animateMoves ? 'bg-[#81b64c]' : 'bg-neutral-700'}`}>
                    <div className={`w-3 h-3 bg-white transition-transform ${animateMoves ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
            </button>

            <button
                onClick={toggleBoardSounds}
                type="button"
                className="flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors w-full cursor-pointer text-left"
            >
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 flex justify-center items-center text-neutral-300">
                        <SoundMax display={boardSounds} size={22} />
                        <SoundMute display={!boardSounds} size={22} />
                    </div>
                    <span className="font-semibold text-sm text-neutral-200">Board sounds</span>
                </div>
                <div className={`w-8 h-4 transition-colors relative flex items-center px-0.5 ${boardSounds ? 'bg-[#81b64c]' : 'bg-neutral-700'}`}>
                    <div className={`w-3 h-3 bg-white transition-transform ${boardSounds ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
            </button>
        </section>
    )
}