export default function LoadingBar(props: { progress: number, transitionTime?: number, height?: string, className?: string }) {
    const { progress, transitionTime = 150, height = "h-2", className = "" } = props;
    const clamped = Math.max(0, Math.min(100, progress));

    return (
        <div className={`w-full bg-[#161512] border border-white/10 relative overflow-hidden ${height} ${className}`}>
            <div
                style={{
                    width: `${clamped}%`,
                    transition: `width ${transitionTime}ms cubic-bezier(0.4, 0, 0.2, 1)`
                }}
                className="h-full bg-gradient-to-r from-[#81b64c] via-[#96bc4b] to-[#a3cc4e] shadow-[0_0_12px_rgba(129,182,76,0.5)] relative overflow-hidden"
            >
                {/* Active scan shimmer */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse w-full" />
            </div>
        </div>
    );
}