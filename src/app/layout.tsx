import type { Metadata } from "next"
import "./globals.css"

import { Roboto } from 'next/font/google'

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
})

export const metadata: Metadata = {
  title: "Brilliant Chess - Free Chess Analyzer",
  description: "Analyze your chess games and improve your skills completely free with 100% Chess.com parity.",
  keywords: ["chess", "chess analysis", "free chess analyzer", "free chess.com analyzer", "analyze chess for free", "analyze chess games", "brilliant move chess", "brilliant chess", "brilliant-chess"],
  authors: [{ name: 'Delo', url: "https://github.com/wdeloo" }],
  applicationName: "Brilliant Chess",

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
