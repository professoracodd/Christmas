// Small hand-drawn line icons (no emoji, no icon font)
type P = { size?: number; className?: string }
const base = (size = 20, className = '') => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  className: `icon ${className}`, 'aria-hidden': true,
})

export const Gift = ({ size, className }: P) => (
  <svg {...base(size, className)}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>
)
export const Star = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>
)
export const Sparkle = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" /></svg>
)
export const Plus = ({ size, className }: P) => <svg {...base(size, className)}><path d="M12 5v14M5 12h14" /></svg>
export const Check = ({ size, className }: P) => <svg {...base(size, className)}><path d="m5 12 5 5L20 7" /></svg>
export const Close = ({ size, className }: P) => <svg {...base(size, className)}><path d="M6 6l12 12M18 6 6 18" /></svg>
export const Pencil = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>
)
export const Trash = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
)
export const LinkOut = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
)
export const Users = ({ size, className }: P) => (
  <svg {...base(size, className)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2a5 5 0 0 1 5.5 5.8" /></svg>
)
export const Phone = ({ size, className }: P) => (
  <svg {...base(size, className)}><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18h2" /></svg>
)
export const List = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></svg>
)
export const Logout = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" /></svg>
)
export const Message = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M4 5h16v11H9l-5 4z" /></svg>
)
export const Copy = ({ size, className }: P) => (
  <svg {...base(size, className)}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>
)
export const Refresh = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4" /></svg>
)
export const Snowflake = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" /></svg>
)

// Pastel gift box drawn for items with no picture
export const GiftArt = () => (
  <svg viewBox="0 0 120 120" className="gift-art" aria-hidden="true">
    <circle cx="60" cy="62" r="50" fill="#ffd9e2" opacity=".55" />
    <rect x="26" y="52" width="68" height="46" rx="8" fill="#ffffff" stroke="#f48fb1" strokeWidth="3" />
    <rect x="21" y="40" width="78" height="16" rx="6" fill="#f48fb1" />
    <rect x="53" y="40" width="14" height="58" fill="#93f1fd" />
    <path d="M60 40c-6-14-24-16-24-6 0 7 14 6 24 6zM60 40c6-14 24-16 24-6 0 7-14 6-24 6z" fill="#ffe087" stroke="#cfa924" strokeWidth="2.5" strokeLinejoin="round" />
    <circle cx="22" cy="24" r="3" fill="#ffe087" /><circle cx="100" cy="30" r="2.5" fill="#93f1fd" /><circle cx="98" cy="100" r="2" fill="#f48fb1" />
  </svg>
)
