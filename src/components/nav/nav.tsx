"use client"

import Image from "next/image"
import GitHub from "../svg/github"
import { useContext, useEffect, useRef } from "react"
import Settings from "./settings/settings"
import { ConfigContext } from "@/context/config"
import Link from "next/link"

export const DONATE_URL = "https://www.paypal.com/donate/?hosted_button_id=S8SWJBNYZ2WFW"

export default function Nav() {
    const configContext = useContext(ConfigContext)

    const [openedMenu, setOpenedMenu] = configContext.openedMenu
    const boardMenuSettingsRef = configContext.boardMenuSettingsRef

    const navRef = useRef<HTMLElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    function openSettings() {
        setOpenedMenu(prev => prev === "settings" ? null : "settings")
    }

    function closeMenu() {
        setOpenedMenu(null)
    }

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node) &&
                !boardMenuSettingsRef.current?.contains(e.target as Node) &&
                !(e.target as HTMLElement).closest('[data-settings-btn]')
            ) {
                closeMenu()
            }
        }

        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    return (
        <nav ref={navRef} className="flex md:flex-col flex-row md:w-36 w-full md:h-screen h-14 bg-[#262421] border-r md:border-r-white/5 border-b md:border-b-0 border-white/5 select-none relative z-40 flex-shrink-0">
            {/* Top Brand Logo */}
            <div className="flex md:flex-col flex-row md:justify-between justify-between items-center w-full h-full md:p-3 px-3 py-2">
                <div className="flex md:flex-col flex-row items-center md:items-start md:gap-4 gap-2 w-full">
                    <Link
                        href="/"
                        className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 transition-all text-white font-extrabold text-base md:text-lg group"
                    >
                        <div className="relative w-7 h-7 flex-shrink-0 flex items-center justify-center">
                            <Image
                                priority
                                height={28}
                                width={28}
                                alt="Chessmate"
                                src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/images/logo.svg`}
                                className="transition-transform group-hover:scale-105"
                            />
                        </div>
                        <div className="flex flex-col leading-tight">
                            <span className="tracking-tight text-white font-black text-sm md:text-base">Chess<span className="text-[#81b64c]">mate</span></span>
                            <span className="text-[10px] text-neutral-400 font-semibold tracking-wider hidden md:block">GAME REVIEW</span>
                        </div>
                    </Link>

                    {/* Navigation Actions */}
                    <div className="flex md:flex-col flex-row md:gap-1 gap-1 md:w-full">
                        <Link
                            href="/"
                            className="flex items-center gap-2.5 px-3 py-2 bg-[#81b64c]/15 text-[#81b64c] font-bold text-xs md:text-sm transition-all md:w-full"
                        >
                            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 14H7v-4h4v4zm0-6H7V7h4v4zm6 6h-4v-4h4v4zm0-6h-4V7h4v4z"/>
                            </svg>
                            <span className="hidden md:inline">Review</span>
                        </Link>

                        <button
                            data-settings-btn="true"
                            onClick={openSettings}
                            type="button"
                            className={`flex items-center gap-2.5 px-3 py-2 font-bold text-xs md:text-sm transition-all md:w-full text-left ${openedMenu === 'settings' ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                            </svg>
                            <span className="hidden md:inline">Settings</span>
                        </button>
                    </div>
                </div>

                {/* Bottom External Links & Status */}
                <div className="flex md:flex-col flex-row items-center md:items-start md:gap-1 gap-1 md:w-full md:border-t md:border-white/5 md:pt-3">
                    <Link
                        target="_blank"
                        href="https://github.com/Arman4464/brilliant-chess"
                        className="flex items-center gap-2.5 px-3 py-1.5 text-neutral-400 hover:text-white hover:bg-white/5 transition-all text-xs font-semibold md:w-full"
                    >
                        <GitHub class="w-4 h-4 fill-current" />
                        <span className="hidden md:inline">GitHub</span>
                    </Link>
                </div>
            </div>

            {/* Settings Flyout / Popover */}
            {openedMenu === 'settings' && (
                <div
                    ref={menuRef}
                    className="absolute md:left-full md:top-3 top-14 left-2 z-50 p-3 bg-[#262421] border border-white/10 shadow-2xl min-w-[320px] max-w-[360px] max-h-[85vh] overflow-y-auto backdrop-blur-md"
                >
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                        <span className="font-bold text-white text-sm">Settings</span>
                        <button
                            onClick={closeMenu}
                            className="text-neutral-400 hover:text-white text-xs px-2 py-1 bg-white/5 hover:bg-white/10 transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                    <Settings hidden={false} />
                </div>
            )}
        </nav>
    )
}