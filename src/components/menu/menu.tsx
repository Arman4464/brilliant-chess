"use client"

import { useContext, useEffect, useRef, useState } from "react"
import { AnalyzeContext } from "@/context/analyze"

import Lens from "../svg/lens"
import Form from "./analyze/form"
import Loading from "./loading/loading"
import GameButtons from "./analysis/gameButtons"
import Pawn from "../svg/pawn"
import SelectChessComGame from "./analyze/selectChessCom"
import Star from "../svg/star"
import BoardIcon from "../svg/boardIcon"
import Summary from "./analysis/summary/summary"
import Moves from "./analysis/moves/moves"

export type platform = "chessCom"

export default function Menu() {
    const [username, setUsername] = useState<{ platform: platform, username: string }>({ platform: "chessCom", username: "" })
    const [selected, select] = useState(0)

    const analyzeContext = useContext(AnalyzeContext)

    const [tab, setTab] = analyzeContext.tab
    const [pageState] = analyzeContext.pageState
    const [data, setData] = analyzeContext.data
    const [game] = analyzeContext.game
    const [players] = analyzeContext.players
    const [moveNumber, setMoveNumber] = analyzeContext.moveNumber
    const [analyzeController] = analyzeContext.analyzeController
    const [analyzingMove] = analyzeContext.analyzingMove
    const setAnimation = analyzeContext.animation[1]
    const setForward = analyzeContext.forward[1]
    const [customLine, setCustomLine] = analyzeContext.customLine
    const [returnedToNormalGame] = analyzeContext.returnedToNormalGame
    const [depth, setDepth] = analyzeContext.depth

    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        switch (pageState) {
            case 'default':
                setTab('analyze')
                break
            case 'loading':
                setTab('analyze')
                break
            case 'analyze':
                setTab('summary')
                break
            case 'analyzeCustom':
                setTab('moves')
                break
        }
    }, [pageState])

    useEffect(() => {
        if (pageState !== "default") return
        if (username.username) {
            setTab('selectGame')
        } else {
            setTab('analyze')
        }
    }, [username])

    const { format } = data

    useEffect(() => {
        if (pageState !== 'analyze') return
        setTab('moves')
    }, [moveNumber])

    function stopSelecting() {
        setUsername({ platform: 'chessCom', username: '' })
    }

    interface Tab {
        label: string
        state: typeof tab
        icon: (className: string) => React.ReactNode
        show: boolean
        onClick: () => void
    }

    const tabs: Tab[] = [
        {
            label: `New Game`,
            state: "analyze",
            icon: (className: string) => <Lens class={className} size={18} />,
            show: true,
            onClick: () => {
                if (pageState === 'analyze' || pageState === 'analyzeCustom') {
                    setData({ format: "fen", string: "" })
                }
                if (tab === 'selectGame') stopSelecting()
            }
        },
        {
            label: "Choose Game",
            state: "selectGame",
            icon: (className: string) => <Pawn class={className} size={18} />,
            show: tab === 'selectGame',
            onClick: () => { }
        },
        {
            label: "Summary",
            state: "summary",
            icon: (className: string) => <Star class={className} size={18} />,
            show: pageState === 'analyze',
            onClick: () => { }
        },
        {
            label: "Moves",
            state: 'moves',
            icon: (className: string) => <BoardIcon class={className} size={18} />,
            show: pageState === 'analyze' || pageState === "analyzeCustom",
            onClick: () => { }
        }
    ]

    return (
        <div
            ref={menuRef}
            className="w-full lg:w-[420px] xl:w-[440px] h-[calc(100vh-28px)] max-h-[820px] bg-[#262421] border border-white/10 shadow-2xl flex flex-col overflow-hidden select-none flex-shrink-0"
        >
            {/* Top Review Header Tabs */}
            <menu className="flex items-center bg-black/20 border-b border-white/10 px-1 select-none flex-shrink-0">
                {tabs.map((t, i) => {
                    if (!t.show) return null
                    const isSelected = tab === t.state
                    return (
                        <button
                            role="tab"
                            key={i}
                            onClick={() => {
                                setTab(t.state)
                                t.onClick()
                            }}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs md:text-sm font-bold transition-all border-b-2 ${
                                isSelected
                                    ? 'text-white border-[#81b64c] bg-white/5'
                                    : 'text-neutral-400 border-transparent hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {t.icon(isSelected ? "fill-white" : "fill-neutral-400")}
                            <span>{t.label}</span>
                        </button>
                    )
                })}
            </menu>

            {/* Tab Body */}
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
                {pageState === 'default' && tab === 'analyze' ? (
                    <Form
                        setData={setData}
                        selectGame={(username: string, platform: platform) => {
                            setUsername({ platform, username })
                        }}
                        depth={[depth, setDepth]}
                        selected={[selected, select]}
                    />
                ) : null}

                {pageState === 'default' && tab === 'selectGame' && username.platform === "chessCom" && username.username ? (
                    <SelectChessComGame
                        stopSelecting={stopSelecting}
                        username={username.username}
                        depth={depth}
                    />
                ) : null}

                {pageState === 'loading' && tab === 'analyze' ? (
                    <Loading format={format} analyzeController={analyzeController} />
                ) : null}

                {pageState === 'analyze' && tab === 'summary' ? (
                    <Summary
                        setAnimation={setAnimation}
                        setForward={setForward}
                        setMoveNumber={setMoveNumber}
                        moveNumber={moveNumber}
                        players={players}
                        moves={game}
                        container={menuRef.current as HTMLElement}
                    />
                ) : null}

                {pageState === 'analyze' && tab === 'moves' ? (
                    <Moves
                        container={menuRef.current as HTMLElement}
                        moves={game}
                        moveNumber={moveNumber}
                        setMoveNumber={setMoveNumber}
                        analyzingMove={analyzingMove}
                        setAnimation={setAnimation}
                        setForward={setForward}
                        customLine={customLine}
                        returnedToNormalGame={returnedToNormalGame}
                    />
                ) : null}

                {pageState === 'analyzeCustom' && tab === 'moves' ? (
                    <Moves
                        container={menuRef.current as HTMLElement}
                        moves={[game[0], ...customLine.moves]}
                        moveNumber={customLine.moveNumber + 1}
                        setMoveNumber={moveNumber => setCustomLine(prev => ({ ...prev, moveNumber: moveNumber - 1 }))}
                        analyzingMove={analyzingMove}
                        setAnimation={setAnimation}
                        setForward={setForward}
                        customLine={customLine}
                        returnedToNormalGame={returnedToNormalGame}
                    />
                ) : null}
            </div>

            {/* Docked Controls in Moves view */}
            {(pageState === 'analyze' || pageState === 'analyzeCustom') && tab === 'moves' && (
                <div className="flex-shrink-0">
                    <GameButtons />
                </div>
            )}
        </div>
    )
}