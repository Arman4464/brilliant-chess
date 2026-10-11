import type { Metadata } from "next"
import "./globals.css"

import { Roboto } from 'next/font/google'

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
})

export const metadata: Metadata = {
  title: "Chessmate - Professional Chess Game Review",
  description: "Analyze your chess games with 100% Chess.com Game Review parity, CAPS2 accuracy scoring, and native Stockfish analysis.",
  keywords: ["chess", "chess analysis", "chessmate", "game review", "free chess analysis", "brilliant move chess", "stockfish"],
  authors: [{ name: 'Arman', url: "https://github.com/Arman4464/chessmate" }],
  applicationName: "Chessmate",

  icons: {
    icon: "favicon.ico"
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-[#312E2B] text-[#dedede] ${roboto.className}`}>
        {children}
      </body>
    </html>
  )
}
