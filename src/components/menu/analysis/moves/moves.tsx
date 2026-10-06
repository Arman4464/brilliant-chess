import { CustomLine } from "@/context/analyze"
import { move, moveRating, square } from "@/engine/stockfish"
import { useEffect, useRef, useState } from "react"
import Comments, { FormatEval } from "./comments"
import { WHITE } from "chess.js"
import GameChart from "../gameChart"
import RatingSVG from "@/components/svg/rating"
import { getMoves } from "@/components/game/game"

export const RATING_TEXT_COLORS = {
    forced: "",
    brilliant: "text-highlightBrilliant",
    great: "text-highlightGreat",
    best: "text-highlightBest",
    excellent: "text-highlightExcellent",
    good: "text-highlightGood",
    book: "text-highlightBook",
    inaccuracy: "text-highlightInaccuracy",
    mistake: "text-highlightMistake",
    miss: "text-highlightMiss",
    blunder: "text-highlightBlunder",
}

function getRating(moveNumber: number, rating: moveRating | undefined, prevRating: moveRating | undefined, nextRating: moveRating | undefined, lastBookMove: number): { rating: moveRating, textClass: string } | undefined {
    if (!rating) return

    if (moveNumber === lastBookMove) return { rating, textClass: RATING_TEXT_COLORS[rating] }

    if (rating === 'best' && prevRating === 'inaccuracy') return { rating, textClass: RATING_TEXT_COLORS[rating] }

    if (rating === 'blunder' || rating === 'mistake' || rating === 'miss' || rating === 'great' || rating === 'brilliant') return { rating, textClass: RATING_TEXT_COLORS[rating] }

    return
}

export function getLastBookMove(moves: move[]) {
    for (let i = moves.length - 1; i >= 0; i--) {
        if (moves[i].moveRating === 'book') return i
    }

    return -1
}

export default function Moves(props: { moves: move[], container: HTMLElement, moveNumber: number, setMoveNumber: (moveNumber: number) => void, setAnimation: (animation: boolean) => void, setForward: (forward: boolean) => void, customLine: CustomLine, returnedToNormalGame: square[] | null, analyzingMove: boolean }) {
    const { moves, container, moveNumber, setMoveNumber, setAnimation, setForward, customLine, returnedToNormalGame, analyzingMove } = props

    const [movesHeight, setMovesHeight] = useState(0)

    const componentRef = useRef<HTMLDivElement>(null)
    const commentsRef = useRef<HTMLDivElement>(null)
    const moveListRef = useRef<HTMLUListElement>(null)
    const gameChartRef = useRef<HTMLDivElement>(null)

    const firstMoveBlack = moves[1]?.color === WHITE

    function getTurns() {
        const realMoves = moves.slice(1)

        const turns: [number, string | undefined, string | undefined][] = []
        let i = 0

        if (firstMoveBlack) {
            turns.push([1, undefined, realMoves[0].san ?? ''])
            i += 1
        }

        for (; i < realMoves.length; i += 2) {
            const turn = realMoves.slice(i, i + 2) as [move, move]
            const turnNumber = Math.ceil((i + 2) / 2)

            if (turn[1]) {
                turns.push([turnNumber, turn[0].san ?? '', turn[1].san ?? ''])
            } else {
                turns.push([turnNumber, turn[0].san ?? '', undefined])
            }
        }

        return turns
    }

    function scrollToCurrentMove() {
        if (!moveListRef.current) return

        const moveListRow = moveListRef.current.getElementsByTagName('li')[0]
        if (!moveListRow) return

        const turnHeight = moveListRow.offsetHeight

        const gap = 4

        moveListRef.current.scrollTo({
            behavior: moveNumber ? "smooth" : "instant",
            top: (turnHeight * Math.floor((moveNumber - 1) / 2)) + (gap * (Math.floor((moveNumber - 1) / 2))),
        })
    }

    useEffect(scrollToCurrentMove, [moveNumber])

    useEffect(scrollToCurrentMove, [])

    function resizeMoves() {
        if (!componentRef.current || !commentsRef.current || !moveListRef.current || !gameChartRef.current) return

        const totalHeight = componentRef.current.offsetHeight

        const commentsHeight = commentsRef.current.offsetHeight
        const gameChartHeight = gameChartRef.current.offsetHeight

        const newMovesHeight = totalHeight - (commentsHeight + gameChartHeight)

        setMovesHeight(newMovesHeight)
        moveListRef.current.style.height = newMovesHeight ? `${newMovesHeight}px` : '100%'
    }

    useEffect(() => {
        resizeMoves()

        window.addEventListener('resize', resizeMoves)

        return () => window.removeEventListener('resize', resizeMoves)
    }, [])

    useEffect(() => {
        resizeMoves()
    }, [moveNumber])

    function handleMoveClick(number: number) {
        setMoveNumber(number)

        const numberDiff = moveNumber - number

        if (numberDiff === 1) {
            setAnimation(true)
            setForward(false)
        } else if (numberDiff === -1) {
            setAnimation(true)
            setForward(true)
        }
    }

    const lastBookMove = getLastBookMove(moves)

    const { previousMove, move } = getMoves(moves, moveNumber, customLine, returnedToNormalGame)

    return (
        <div ref={componentRef} className="flex flex-col gap-3 items-center h-full">
            <div ref={commentsRef} className="w-full flex flex-col items-center">
                <Comments rating={analyzingMove ? previousMove?.moveRating : move?.moveRating} moveSan={analyzingMove ? previousMove?.san : move?.san} bestMoveSan={analyzingMove ? previousMove?.bestMoveSan : move?.bestMoveSan} evaluation={analyzingMove ? previousMove?.evaluation ?? previousMove?.previousStaticEvals?.[0] ?? ["cp", "0"] : move?.evaluation ?? move?.previousStaticEvals?.[0] ?? ["cp", "0"]} white={analyzingMove ? previousMove?.color === WHITE : move?.color === WHITE} />
            </div>
            <div style={{ display: previousMove ? '' : 'none' }} className="bg-backgroundBoxDarker w-full">
                <div className="w-[85%] font-extrabold text-highlightBest mx-auto flex flex-row items-center gap-2 py-2">
                    <FormatEval best smaller evaluation={previousMove?.previousStaticEvals?.[0] ?? ["cp", "0"]} white={(previousMove?.color ?? WHITE) === WHITE} />
                    <RatingSVG rating="best" size={22} />
                    {previousMove?.bestMoveSan} is best
                </div>
            </div>
            <ul style={{height: (movesHeight || '100%')}} ref={moveListRef} className="gap-y-1 overflow-y-auto overflow-x-hidden w-[85%] select-none flex flex-col">
                {getTurns().map((turn, i) => (
                    <li key={i} className="flex flex-row text-foregroundGrey items-center w-full">
                        <span className="font-bold w-[33px]">{turn[0]}.</span>
                        <div className="flex flex-row text-lg font-extrabold flex-grow">
                            {turn.slice(1).map((move, j) => {
                                if (!move) return <div key={`${i}-${j}`} className="w-1/2" />

                                const currentMoveNumber = (i * 2) + j + (firstMoveBlack ? 0 : 1)

                                const isSelected = moveNumber === currentMoveNumber

                                const rating = moves[currentMoveNumber].moveRating

                                const prevRating = moves[currentMoveNumber - 1]?.moveRating
                                const nextRating = moves[currentMoveNumber + 1]?.moveRating

                                const shownRating = getRating(currentMoveNumber, rating, prevRating, nextRating, lastBookMove)

                                const fgColorClass = shownRating ? shownRating.textClass : isSelected ? 'text-foregroundHighlighted' : ''

                                return (
                                    <div key={`${i}-${j}`} className="w-1/2 flex flex-row gap-1 items-center">
                                        <button type="button" onClick={() => handleMoveClick(currentMoveNumber)} className="w-[22px] outline-none">{shownRating ? <RatingSVG draggable rating={shownRating.rating} size={22} /> : null}</button>
                                        <button type="button" onClick={() => handleMoveClick(currentMoveNumber)} className={`rounded-borderRoundness outline-none border-b-2 text-left px-2 w-fit ${isSelected ? 'bg-backgroundBoxBox border-backgroundBoxBoxHover' : 'border-transparent'} ${fgColorClass}`}>{move}</button>
                                    </div>
                                )
                            })}
                        </div>
                    </li>
                ))}
            </ul>
            <div ref={gameChartRef}>
                <GameChart container={container} moves={moves} moveNumber={moveNumber} setMoveNumber={setMoveNumber} setAnimation={setAnimation} setForward={setForward} />
            </div>
        </div>
    )
}