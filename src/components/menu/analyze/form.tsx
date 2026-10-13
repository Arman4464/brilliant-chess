"use client"

import { useContext, useEffect, useRef, useState } from "react"
import Arrow from "../../svg/arrow"
import Image from "next/image"
import { Data } from "@/context/analyze"
import { platform } from "../menu"
import { ErrorsContext } from "@/context/errors"
import { pushPageError } from "@/components/errors/pageErrors"

function extractGameId(input: string): string | null {
    const trimmed = input.trim()
    const urlMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?chess\.com\/(?:analysis\/)?game\/(?:live|daily)\/(\d+)/i)
    if (urlMatch) return urlMatch[1]
    if (/^\d{8,14}$/.test(trimmed)) return trimmed
    return null
}

type format = [string, string, string]

export const FORMATS: format[] = [
    ["Chess.com", `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/images/chesscom.svg`, "platform"],
    ["PGN", `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/images/pgn.svg`, "format"],
    ["FEN", `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/images/json.svg`, "format"],
]

type type = [string, string, number]

export const TYPES: type[] = [
    ["Fast", `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/images/quick.svg`, 18],
    ["Standard", `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/images/standard.svg`, 22],
    ["Deep", `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/images/deep.svg`, 26],
]

export default function Form(props: {
    setData: (data: Data) => void
    selectGame: (username: string, platform: platform) => void
    depth: [number, (depth: number) => void]
    selected: [number, (selected: number) => void]
}) {
    const { setData, selectGame } = props

    const [isSelecting, setSelecting] = useState(false)
    const [value, setValue] = useState("")
    const [loadingGame, setLoadingGame] = useState(false)
    const [selected, select] = props.selected
    const [depth, setDepth] = props.depth

    const errorsContext = useContext(ErrorsContext)
    const setErrors = errorsContext.errors[1]

    const formRef = useRef<HTMLFormElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const shiftPressed = useRef(false)

    useEffect(() => {
        const previousDepth = localStorage.getItem('depth')
        if (!previousDepth) return

        const previousDepthNumber = Number(previousDepth)
        if (TYPES.some(type => type[2] === previousDepthNumber)) {
            setDepth(previousDepthNumber)
        } else {
            setDepth(18)
            localStorage.setItem('depth', String(18))
        }
    }, [])

    useEffect(() => {
        const previousSelected = localStorage.getItem('format')
        if (!previousSelected) return

        const previousSelectedNumber = Number(previousSelected)
        if (FORMATS[previousSelectedNumber] != null) {
            select(previousSelectedNumber)
        } else {
            select(0)
            localStorage.setItem('format', String(0))
        }
    }, [])

    useEffect(() => {
        setValue("")
        setSelecting(false)
    }, [])

    useEffect(() => {
        switch (FORMATS[selected][0]) {
            case "Chess.com":
                const previousChesscomUserName = localStorage.getItem('chesscom') ?? ''
                setValue(previousChesscomUserName)
                break
            default:
                setValue("")
        }
    }, [selected])

    async function analyze(e: React.FormEvent) {
        e.preventDefault()

        switch (FORMATS[selected][0]) {
            case "Chess.com":
                const gameId = extractGameId(value)
                if (gameId) {
                    setLoadingGame(true)
                    try {
                        let pgn = ''
                        // 1. Try local server endpoint if running with backend
                        try {
                            const response = await fetch(`/api/game?id=${gameId}`)
                            if (response.ok) {
                                const resData = await response.json()
                                if (resData.pgn) pgn = resData.pgn
                            }
                        } catch {}

                        // 2. Direct fallback for Chess.com live game callback
                        if (!pgn) {
                            try {
                                const cbRes = await fetch(`https://www.chess.com/callback/live/game/${gameId}`)
                                if (cbRes.ok) {
                                    const cbData = await cbRes.json()
                                    if (cbData?.game?.pgn) pgn = cbData.game.pgn
                                }
                            } catch {}
                        }

                        if (!pgn) {
                            throw new Error("Could not load game by URL/ID on static hosting. Please paste the game PGN directly or enter your username.")
                        }
                        setData({ format: "pgn", string: pgn })
                    } catch (err: any) {
                        pushPageError(setErrors, "Failed to load game", err.message || "Please check the game ID/URL")
                    } finally {
                        setLoadingGame(false)
                    }
                    return
                }

                if (!value.trim()) return
                selectGame(value.trim(), "chessCom")
                localStorage.setItem('chesscom', value.trim())
                break
            case "PGN":
                if (!value.trim()) return
                setData({ format: "pgn", string: value })
                break
            case "FEN":
                if (!value.trim()) return
                setData({ format: "fen", string: value })
                break
        }
    }

    function changeSelected(i: number) {
        select(i)
        setSelecting(false)
        localStorage.setItem('format', String(i))
        inputRef.current?.focus()
    }

    function changeDepth(depth: number) {
        setDepth(depth)
        localStorage.setItem('depth', String(depth))
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !shiftPressed.current) {
            e.preventDefault()
            formRef.current?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        }
        if (e.key === 'Shift') {
            shiftPressed.current = true
        }
    }

    function handleKeyUp(e: React.KeyboardEvent) {
        if (e.key === 'Shift') {
            shiftPressed.current = false
        }
    }

    function isAPlatform(i: number) {
        return FORMATS[i][2] === "platform"
    }

    const detectedGameId = extractGameId(value)
    const isPlatform = isAPlatform(selected)

    const inputPlaceholder = isPlatform ?
        "Enter Chess.com username or Game URL / ID" :
        `Paste your ${FORMATS[selected][0]} notation here...`

    const analyzeValue = loadingGame ?
        "Loading Game..." :
        isPlatform ?
            (detectedGameId ? "Load Game" : "List Games") :
            "Analyze"

    return (
        <form ref={formRef} onSubmit={analyze} className="flex flex-col items-center gap-4 w-full px-5 py-6 select-none">
            {/* Input textarea */}
            <div className="w-full relative">
                <textarea
                    spellCheck={false}
                    rows={isPlatform ? 2 : 4}
                    value={value}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.currentTarget.value)}
                    ref={inputRef}
                    placeholder={inputPlaceholder}
                    className="w-full px-3.5 py-3 text-sm md:text-base font-semibold border border-white/10 bg-[#1e1d1a] text-white placeholder-neutral-500 focus:outline-none focus:border-[#81b64c] transition-colors resize-none shadow-inner"
                />
            </div>

            {/* Platform & Depth Settings Toggle */}
            <div className="w-full flex flex-col gap-2">
                <button
                    type="button"
                    onClick={e => {
                        e.preventDefault()
                        setSelecting(prev => !prev)
                    }}
                    className="w-full h-12 px-4 bg-[#1e1d1a] hover:bg-white/5 border border-white/10 text-white font-bold text-sm md:text-base flex items-center justify-between transition-colors shadow-sm"
                >
                    <div className="flex items-center gap-2.5">
                        <Image draggable={false} alt="icon" src={FORMATS[selected][1]} width={22} height={22} />
                        <span>{FORMATS[selected][0]}</span>
                    </div>
                    <div className={`transition-transform duration-200 ${isSelecting ? "rotate-180" : ""}`}>
                        <Arrow class="fill-neutral-400" />
                    </div>
                </button>

                {isSelecting && (
                    <div className="flex flex-col gap-3 p-3 bg-black/25 border border-white/5 mt-1 animate-fadeIn">
                        <div>
                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block mb-2">Input Source</span>
                            <div className="grid grid-cols-3 gap-2">
                                {FORMATS.map((format, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => changeSelected(i)}
                                        className={`flex items-center justify-center gap-1.5 h-10 text-xs font-bold transition-all ${
                                            selected === i
                                                ? 'bg-[#81b64c] text-white shadow-md'
                                                : 'bg-[#1e1d1a] text-neutral-300 hover:text-white hover:bg-white/10 border border-white/5'
                                        }`}
                                    >
                                        <Image draggable={false} alt="format" src={format[1]} width={16} height={16} />
                                        <span>{format[0]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block mb-2">Engine Depth</span>
                            <div className="grid grid-cols-3 gap-2">
                                {TYPES.map((type, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => changeDepth(type[2])}
                                        className={`flex items-center justify-center gap-1.5 h-10 text-xs font-bold transition-all ${
                                            depth === type[2]
                                                ? 'bg-[#81b64c] text-white shadow-md'
                                                : 'bg-[#1e1d1a] text-neutral-300 hover:text-white hover:bg-white/10 border border-white/5'
                                        }`}
                                    >
                                        <Image draggable={false} alt="type" src={type[1]} width={16} height={16} />
                                        <span>{type[0]} ({type[2]})</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Big Green CTA button */}
            <button
                type="submit"
                disabled={loadingGame}
                className="w-full h-14 mt-2 bg-[#81b64c] hover:bg-[#8cc352] active:scale-[0.98] text-white font-black text-lg shadow-lg transition-all flex items-center justify-center cursor-pointer select-none disabled:opacity-50"
            >
                {analyzeValue}
            </button>
        </form>
    )
}