import { ConfigContext } from "@/context/config"
import { useContext, useEffect } from "react"

type boardThemeLabel = "Green" | "Brown" | "Blue" | "Gray" | "Red" | "Purple" | "Orange"

interface boardTheme {
    label: boardThemeLabel,
    black: string,
    white: string,
    highlight: string,
}

export const boardThemes: boardTheme[] = [
    { label: "Green", black: "#779556", white: "#ebecd0", highlight: "#ffff33" },
    { label: "Brown", black: "#b58863", white: "#f0d9b5", highlight: "#ffff33" },
    { label: "Blue", black: "#4d6d92", white: "#ececd7", highlight: "#00a5ff" },
    { label: "Gray", black: "#4f4f4f", white: "#e3e3e3", highlight: "#ffff33" },
    { label: "Red", black: "#ba5546", white: "#f0d8bf", highlight: "#f8f893" },
    { label: "Purple", black: "#8877b7", white: "#efefef", highlight: "#7dacc9" },
    { label: "Orange", black: "#d08b18", white: "#fce4b2", highlight: "#ffff33" },
]

export default function Themes() {
    const configContext = useContext(ConfigContext)

    const [boardTheme, setBoardTheme] = configContext.boardTheme

    useEffect(() => {
        const boardTheme = Number(localStorage.getItem('boardTheme'))
        if (boardThemes[boardTheme] != null) {
            setBoardTheme(boardTheme)
        } else {
            localStorage.setItem('boardTheme', '0')
            setBoardTheme(0)
        }
    }, [])

    function changeBoardTheme(boardThemeIndex: number) {
        setBoardTheme(boardThemeIndex)
        localStorage.setItem('boardTheme', String(boardThemeIndex))
    }

    return (
        <section className="border-b border-white/5 pb-2">
            <div className="px-3 py-1.5 bg-white/5 border-b border-white/10 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Board Theme
            </div>
            {boardThemes.map((theme, i) => {
                const isSelected = boardTheme === i
                return (
                    <button
                        onClick={() => changeBoardTheme(i)}
                        type="button"
                        key={i}
                        className={`flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors w-full cursor-pointer text-left ${isSelected ? 'bg-white/5' : ''}`}
                    >
                        <div className="flex items-center gap-2.5">
                            <div className="grid grid-cols-2 w-fit">
                                {Array.from({ length: 4 }).map((_, j) => {
                                    const isEvenCol = j % 2 === 0
                                    const isEvenRow = Math.floor(j / 2) % 2 === 0

                                    const squareColor = isEvenCol ? (isEvenRow ? theme.white : theme.black) : (isEvenRow ? theme.black : theme.white)

                                    return <div key={j} style={{ backgroundColor: squareColor }} className="h-4 w-4" />
                                })}
                            </div>
                            <span className="font-semibold text-sm text-neutral-200">{theme.label}</span>
                        </div>
                        {isSelected ? (
                            <div className="w-5 h-5 bg-[#81b64c] flex items-center justify-center text-white">
                                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                </svg>
                            </div>
                        ) : (
                            <div className="w-5 h-5 border border-white/10" />
                        )}
                    </button>
                )
            })}
        </section>
    )
}