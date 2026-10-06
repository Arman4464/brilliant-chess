import BestMoves from "./bestMoves";
import Moves from "./moves";
import Ratings from "./ratings";
import Themes from "./themes";

export default function Settings({ hidden }: { hidden: boolean }) {
    return (
        <div className="flex flex-col gap-2" style={{ display: hidden ? 'none' : '' }}>
            <Themes />
            <Ratings />
            <Moves />
            <BestMoves />
        </div>
    )
}