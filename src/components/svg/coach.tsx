export default function Coach(props: { size?: number, className?: string }) {
    const size = props.size || 48
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 64 64"
            className={props.className || "flex-shrink-0"}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Background circle */}
            <circle cx="32" cy="32" r="30" fill="#2d2a26" stroke="#423e39" strokeWidth="2" />
            {/* Hoodie */}
            <path d="M16 54C16 43 23 37 32 37C41 37 48 43 48 54V58H16V54Z" fill="#a83232" />
            <path d="M26 39L32 47L38 39H26Z" fill="#872323" />
            {/* Neck */}
            <rect x="29" y="32" width="6" height="7" fill="#ffdbac" rx="2" />
            {/* Face */}
            <circle cx="32" cy="24" r="10" fill="#ffdbac" />
            {/* Beard */}
            <path d="M25 24C25 29 28 33 32 33C36 33 39 29 39 24C39 24 37 28 32 28C27 28 25 24 25 24Z" fill="#4a3728" />
            {/* Hair */}
            <path d="M22 22C22 17 26 14 32 14C38 14 42 17 42 22C42 19 39 16 32 16C25 16 22 19 22 22Z" fill="#4a3728" />
            {/* Glasses */}
            <rect x="25" y="21" width="5" height="4" rx="1.5" stroke="#1f1e1d" strokeWidth="1.5" fill="none" />
            <rect x="34" y="21" width="5" height="4" rx="1.5" stroke="#1f1e1d" strokeWidth="1.5" fill="none" />
            <line x1="30" y1="23" x2="34" y2="23" stroke="#1f1e1d" strokeWidth="1.5" />
            {/* Smile */}
            <path d="M30 29Q32 31 34 29" stroke="#1f1e1d" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
    )
}
