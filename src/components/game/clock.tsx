import { Color } from "chess.js"

export default function Clock(props: { white: boolean, colorMoving: Color, children: React.ReactNode }) {
    const { white, colorMoving } = props
    const time = props.children

    const moving = white ? colorMoving === 'w' : colorMoving === 'b'

    return (
        <div
            className={`flex items-center gap-1.5 px-3 py-1.5 font-mono font-bold text-sm md:text-base select-none transition-all duration-150 ${
                moving ? 'opacity-100 ring-2 ring-[#81b64c]/40' : 'opacity-65'
            } ${
                white ? 'bg-white text-[#211f1c] shadow-md' : 'bg-[#211f1c] text-white border border-white/10'
            }`}
        >
            <svg className={`w-3.5 h-3.5 ${white ? 'fill-[#211f1c]' : 'fill-neutral-400'}`} viewBox="0 0 24 24">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
            </svg>
            <span className="tabular-nums tracking-wide">{time}</span>
        </div>
    )
}