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
    ["Chess.com", `${process.env.NEXT_PUBLIC_BASE_PATH}/images/chesscom.svg`, "platform"],
    ["PGN", `${process.env.NEXT_PUBLIC_BASE_PATH}/images/pgn.svg`, "format"],
    ["FEN", `${process.env.NEXT_PUBLIC_BASE_PATH}/images/json.svg`, "format"],
]

type type = [string, string, number]

export const TYPES: type[] = [
    ["Fast", `${process.env.NEXT_PUBLIC_BASE_PATH}/images/quick.svg`, 18],
    ["Standard", `${process.env.NEXT_PUBLIC_BASE_PATH}/images/standard.svg`, 22],
    ["Deep", `${process.env.NEXT_PUBLIC_BASE_PATH}/images/deep.svg`, 26],
]

export default function Form(props: { setData: (data: Data) => void, selectGame: (username: string, platform: platform ) => void, depth: [number, (depth: number) => void], selected: [number, (selected: number) => void] }) {
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
                    try {
                        setLoadingGame(true)
                        const res = await fetch(`/api/game?id=${gameId}`)
                        if (!res.ok) throw new Error(String(res.status))
                        const json = await res.json()
                        if (json.pgn) {
                            setData({
                                format: "pgn",
                                string: json.pgn,
                                performanceRatings: {
                                    white: json.white?.performanceRating,
                                    black: json.black?.performanceRating,
                                },
                                accuracies: json.accuracies || (json.white?.accuracy ? { white: json.white.accuracy, black: json.black?.accuracy } : undefined)
                            })
                            return
                        }
                        throw new Error("Game PGN not available")
                    } catch {
                        await pushPageError(setErrors, `Could not load Game #${gameId}`, "Check the Game ID or your internet connection.")
                    } finally {
                        setLoadingGame(false)
                    }
                    return
                }
                localStorage.setItem("chesscom", value)
                selectGame(value, "chessCom")
                break
            case "PGN":
                setData({ format: "pgn", string: value })
                break
            case "FEN":
                setData({ format: "fen", string: value })
                break
        }
    }

    function changeSelected(i: number) {
        select(i)
        setSelecting(false)

        localStorage.setItem('format', String(i))

        const input = inputRef.current
        input?.focus()
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
        "Enter Chess.com user or Game ID / URL" :
        `Paste your ${FORMATS[selected][0]} code here`

    const analyzeValue = loadingGame ?
        "Loading Game..." :
        isPlatform ?
            (detectedGameId ? "Load Game" : "List games") :
            "Analyze"

    return (
        <form ref={formRef} onSubmit={analyze} className="flex flex-col items-center gap-4">
            <textarea spellCheck={false} rows={1} value={value} onKeyDown={handleKeyDown} onKeyUp={handleKeyUp} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e?.currentTarget.value)} ref={inputRef} placeholder={inputPlaceholder} className="w-[85%] px-2 py-[13px] flex items-center transition-colors text-xl font-bold rounded-borderRoundness border-border hover:border-borderHighlighted focus:border-borderHighlighted border-solid border-[1px] bg-backgroundBoxBox outline-none placeholder:text-placeholder placeholder:font-normal resize-none" />
            <div className="w-[85%] flex flex-col gap-2">
                <button type="button" className="flex flex-row gap-1 items-center justify-center w-full h-14 rounded-borderRoundness text-xl bg-backgroundBoxBox hover:bg-backgroundBoxBoxHover hover:text-foregroundHighlighted transition-colors font-bold relative" onClick={e => { e.preventDefault(); setSelecting(isSelecting => !isSelecting) }}>
                    <Image draggable={false} alt="icon" src={FORMATS[selected][1]} width={28} height={28} />
                    {FORMATS[selected][0]}
                    <div className={`absolute h-full right-6 top-0 flex flex-row items-center ${isSelecting ? "" : "rotate-180"}`}><Arrow class="fill-foregroundGrey" /></div>
                </button>
                <div className="flex flex-col gap-2" style={{ display: isSelecting ? "" : "none" }}>
                    <h6 className="mt-2 font-bold flex flex-row gap-1"><Image alt="formats" src={`${process.env.NEXT_PUBLIC_BASE_PATH}/images/formats.svg`} width={18} height={18} />Game Formats</h6>
                    <ul className="grid grid-cols-3 gap-2">
                        {FORMATS.map((format, i) => {
                            return (
                                <li key={i}>
                                    <button type="button" onClick={() => changeSelected(i)} className={`flex flex-row items-center justify-center gap-1.5 h-11 w-full hover:text-foregroundHighlighted rounded-borderRoundness text-sm bg-backgroundBoxBox hover:bg-backgroundBoxBoxHover transition-colors font-bold border-backgroundBoxBoxHighlighted ${selected === i ? "border-[2px]" : ""}`}>
                                        <Image draggable={false} alt="format" src={format[1]} width={20} height={20} className="h-5 w-auto" priority />
                                        <span>{format[0]}</span>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                    <h6 className="mt-2 font-bold flex flex-row gap-2"><Image priority alt="depth" src={`${process.env.NEXT_PUBLIC_BASE_PATH}/images/type.svg`} width={20} height={20} />Analysis Type</h6>
                    <ul className="grid grid-cols-3 gap-2">
                        {TYPES.map((type, i) => {
                            return (
                                <li key={i}>
                                    <button title={`Depth: ${type[2]}`} type="button" onClick={() => changeDepth(type[2])} className={`flex flex-row items-center justify-center gap-1.5 h-11 w-full hover:text-foregroundHighlighted rounded-borderRoundness text-sm bg-backgroundBoxBox hover:bg-backgroundBoxBoxHover transition-colors font-bold border-backgroundBoxBoxHighlighted ${depth === type[2] ? "border-[2px]" : ""}`}>
                                        <Image draggable={false} alt="format" src={type[1]} width={20} height={20} className="h-5 w-auto" priority />
                                        <span>{type[0]}</span>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            </div>
            <input type="submit" className="w-[85%] h-16 cursor-pointer rounded-borderExtraRoundness text-2xl bg-backgroundBoxBoxHighlighted hover:bg-backgroundBoxBoxHighlightedHover transition-all font-extrabold hover:shadow-shadowBoxBoxHighlighted" value={analyzeValue} />
        </form>
    )
}