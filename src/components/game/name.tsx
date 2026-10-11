import { PieceSymbol } from "chess.js"
import Profile from "../svg/profile"
import CapturedPieces from "./capturedPieces"

export default function Name(props: { white: boolean, children: React.ReactNode, captured: PieceSymbol[], materialAdvantage: number }) {
    const { white, captured, materialAdvantage } = props
    const rawName = String(props.children || '')

    // Parse username and rating if formatted like "Player (1234)"
    const match = rawName.match(/^(.*?)\s*(\(\d+\)|\(NOELO\))?$/)
    const displayName = match && match[1] ? match[1].trim() : rawName
    const eloBadge = match && match[2] && match[2] !== '(NOELO)' ? match[2] : null

    return (
        <div className="flex items-center gap-2.5 flex-grow min-w-0 select-none">
            {/* Player Avatar */}
            <div
                className={`w-9 h-9 overflow-hidden flex items-end justify-center flex-shrink-0 shadow-sm ${
                    white ? 'bg-[#dbd9d6]' : 'bg-[#45423e]'
                }`}
            >
                <Profile
                    width={34}
                    height={34}
                    class={white ? 'fill-[#ffffff]' : 'fill-[#211f1c]'}
                />
            </div>

            {/* Name + Rating + Captured pieces */}
            <div className="flex flex-col justify-center min-w-0">
                <div className="flex items-center gap-1.5 truncate">
                    <span className="font-bold text-white text-sm md:text-[15px] truncate max-w-[180px] md:max-w-[260px]">
                        {displayName || 'Player'}
                    </span>
                    {eloBadge && (
                        <span className="text-neutral-400 font-semibold text-xs tabular-nums">
                            {eloBadge}
                        </span>
                    )}
                </div>
                <div className="mt-0.5">
                    <CapturedPieces advantage={materialAdvantage} white={white} pieces={captured} />
                </div>
            </div>
        </div>
    )
}