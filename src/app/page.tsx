import Game from "@/components/game/game"
import Menu from "@/components/menu/menu"
import Nav from "@/components/nav/nav"
import AnalyzeContextProvider from "@/context/analyze"
import ConfigContextProvider from "@/context/config"
import ErrorsContextProvider from "@/context/errors"
import PageErrors from "@/components/errors/pageErrors"

export default function Home() {
  return (
    <ConfigContextProvider>
      <ErrorsContextProvider>
        <PageErrors />
        <Nav />
        <main className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-4 lg:gap-6 p-2 lg:p-4 h-full w-full overflow-x-hidden overflow-y-auto lg:overflow-hidden select-none">
          <AnalyzeContextProvider>
            <Game />
            <Menu />
          </AnalyzeContextProvider>
        </main>
      </ErrorsContextProvider>
    </ConfigContextProvider>
  )
}
