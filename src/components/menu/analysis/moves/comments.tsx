import RatingSVG from "@/components/svg/rating"
import { moveRating } from "@/engine/stockfish"

const RATING_FORMATS_GUIDE = {
    _isA_Move: 'is a _ move',
    _isAn_Move: 'is an _ move',
    _is_: 'is _',
    _isAn_: 'is an _',
    _isA_: 'is a _',
}

const RATING_FORMATS = {
    book: RATING_FORMATS_GUIDE._isA_Move,
    forced: RATING_FORMATS_GUIDE._is_,
    brilliant: RATING_FORMATS_GUIDE._is_,
    great: RATING_FORMATS_GUIDE._isA_Move,
    best: RATING_FORMATS_GUIDE._is_,
    excellent: RATING_FORMATS_GUIDE._is_,
    good: RATING_FORMATS_GUIDE._is_,
    inaccuracy: RATING_FORMATS_GUIDE._isAn_,
    mistake: RATING_FORMATS_GUIDE._isA_,
    miss: RATING_FORMATS_GUIDE._isA_,
    blunder: RATING_FORMATS_GUIDE._isA_,
}

export function FormatEval(props: {evaluation: string[], white: boolean, smaller?: boolean, best?: boolean}) {
    const { evaluation, white, smaller, best } = props

    const number = (Number(evaluation[1]) / 100) * (white ? 1 : -1)
            
    let prevChar = ''
    if (number > 0) prevChar = '+'
    if (number < 0) prevChar = '-'

    return (
        <div style={{ fontSize: smaller ? "14px" : "", padding: smaller ? "2px" : "", width: smaller ? "46px" : "", backgroundColor: prevChar === '-' ? 'var(--evaluationBarBlack)' : 'var(--evaluationBarWhite)', color: prevChar === '-' ? 'var(--foreground)' : 'var(--foregroundBlack)', filter: prevChar === '-' ? '' : 'brightness(0.9)'}} className="rounded-borderRoundness py-1 font-extrabold w-[61px] text-center">
            {(() => {
                if (evaluation[0] === 'mate' && evaluation[1]) {
                    return prevChar + "M" + (Math.abs(Number(evaluation[1])) - Number(Boolean(best)))
                } else if (!evaluation[1]) {
                    if (white) return '0-1'
                    else return '1-0'
                } else {
                    return prevChar + Math.abs(number).toFixed(2)
                }
            })()}
        </div>
    )
}

export default function Comments(props: { rating?: moveRating, moveSan?: string, bestMoveSan?: string, evaluation: string[], white: boolean }) {
    const { rating, moveSan, bestMoveSan, evaluation, white } = props

    if (!rating || !moveSan) {
        return (
            <div className="bg-white w-[85%] rounded-borderExtraRoundness p-4 font-bold text-base text-neutral-700 shadow-sm flex items-center justify-between">
                <span>Navigate moves to review position analysis</span>
            </div>
        )
    }

    const showBestMove = bestMoveSan && bestMoveSan !== moveSan && rating !== 'best' && rating !== 'book' && rating !== 'brilliant' && rating !== 'forced'

    return (
        <div style={{backgroundColor: "#ffffff"}} className="w-[85%] p-4 rounded-borderExtraRoundness text-foregroundBlack text-lg font-bold flex flex-col justify-between gap-3 shadow-sm">
            <div className="flex flex-row justify-between items-center">
                <div className="flex flex-row items-center gap-2">
                    <RatingSVG draggable rating={rating} size={32} />
                    <span>{moveSan} {RATING_FORMATS[rating]?.replace('_', rating) || rating}</span>
                </div>
                <FormatEval evaluation={evaluation} white={white} />
            </div>
            {showBestMove && (
                <div className="text-sm font-semibold text-neutral-600 bg-neutral-100 rounded-md px-2.5 py-1 w-fit flex items-center gap-1.5">
                    <span>Best was</span>
                    <span className="font-bold text-highlightBest">{bestMoveSan}</span>
                </div>
            )}
        </div>
    )
}