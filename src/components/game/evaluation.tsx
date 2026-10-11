"use client"

export default function Evaluation(props: { size: number, white: boolean, advantage: string[], whiteMoving: boolean, navTop?: boolean }) {
    const { size, white, advantage, whiteMoving } = props

    const OLD_PERCENTS = [-400, 400]
    const NEW_PERCENTS = [5, 95]

    const advantageAmount = Number(advantage[1]) * (whiteMoving ? 1 : -1)

    const rawPercent = ((advantageAmount - OLD_PERCENTS[0]) * (NEW_PERCENTS[1] - NEW_PERCENTS[0])) / (OLD_PERCENTS[1] - OLD_PERCENTS[0]) + NEW_PERCENTS[0]
    let percent = 50
    if (advantage[0] === 'mate') {
        if (advantage[1]) {
            percent = advantageAmount >= 0 ? 100 : 0
        } else {
            percent = whiteMoving ? 0 : 100
        }
    } else {
        percent = Math.min(Math.max(rawPercent, NEW_PERCENTS[0]), NEW_PERCENTS[1])
    }

    const whiteWinning = advantageAmount >= 0
    const absScore = Math.abs(advantageAmount) / 100

    let displayAdvantage = '0.0'
    if (advantage[0] === 'mate') {
        displayAdvantage = advantage[1] ? 'M' + Math.abs(advantageAmount) : (whiteMoving ? '0-1' : '1-0')
    } else {
        displayAdvantage = absScore.toFixed(1)
    }

    // Determine the height of the white bar
    // If the board is flipped (white === false), White is at the top, Black is at the bottom.
    const whiteBarHeight = white ? percent : (100 - percent)

    return (
        <div
            style={{ height: size }}
            className="w-7 bg-[#262421] overflow-hidden flex flex-col justify-end relative shadow-inner select-none flex-shrink-0 border border-white/5"
        >
            {/* White evaluation fill */}
            <div
                style={{
                    height: `${whiteBarHeight}%`,
                    transition: 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className="w-full bg-white relative"
            />

            {/* Score label anchored cleanly */}
            <div className="absolute inset-0 flex flex-col justify-between items-center py-2 px-0.5 pointer-events-none">
                {/* Top score label (for whoever is leading on top) */}
                <div
                    className={`text-[10px] font-extrabold tracking-tight transition-opacity duration-200 ${(white ? !whiteWinning : whiteWinning) && absScore > 0 ? 'opacity-100 text-[#262421]' : 'opacity-0 text-white'}`}
                >
                    {displayAdvantage}
                </div>

                {/* Bottom score label (for whoever is leading on bottom) */}
                <div
                    className={`text-[10px] font-extrabold tracking-tight transition-opacity duration-200 ${(white ? whiteWinning : !whiteWinning) || absScore === 0 ? 'opacity-100 text-[#262421]' : 'opacity-0 text-white'}`}
                >
                    {displayAdvantage}
                </div>
            </div>
        </div>
    )
}