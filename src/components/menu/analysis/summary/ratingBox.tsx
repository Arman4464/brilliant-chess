export default function RatingBox(props: {children: React.ReactNode, white?: boolean, width?: number, fontSize?: number, paddingY?: number}) {
    return (
        <div style={{ width: props.width ?? 64, fontSize: props.fontSize ?? 17 }} className={`h-9 min-h-[36px] flex items-center justify-center font-bold select-none tracking-tight ${props.white ? "bg-white text-[#312e2b] shadow-sm" : "bg-[#262421] text-white border border-white/10"}`}>
            {props.children}
        </div>
    )
}