import { ReactNode, useEffect, useRef, useState } from 'react'
import { Item, money, siteName, BASE } from './supabase'
import { Close, GiftArt, LinkOut } from './Icons'

// Bottom sheet / dialog built on <dialog> (keyboard focus and Esc handled by the browser)
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }} aria-label={title}>
      <div className="sheet-body">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Close size={18} /></button>
        </div>
        {open && children}
      </div>
    </dialog>
  )
}

// Picture for a wish: the store photo when there is one, a drawn gift box otherwise
export function WishImage({ src, alt }: { src: string | null; alt: string }) {
  const [bad, setBad] = useState(false)
  useEffect(() => setBad(false), [src])
  return (
    <div className="wish-img">
      {src && !bad ? <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <GiftArt />}
    </div>
  )
}

export function WishCard({ item, top, actions, faded }: { item: Item; top?: ReactNode; actions?: ReactNode; faded?: boolean }) {
  return (
    <article className={`wish${faded ? ' faded' : ''}`}>
      {top && <div className="wish-top">{top}</div>}
      <WishImage src={item.image_url} alt={item.link_title || item.name} />
      <div className="wish-main">
        <div className="wish-title">
          <h3>{item.name}</h3>
          {item.estimated_price !== null && <span className="price">{money(item.estimated_price)}</span>}
        </div>
        {item.description && <p className="desc">{item.description}</p>}
        {item.product_url && (
          <a className="store-link" href={item.product_url} target="_blank" rel="noopener noreferrer">
            <LinkOut size={15} /> {item.link_site || siteName(item.product_url)}
          </a>
        )}
      </div>
      {actions && <div className="wish-actions">{actions}</div>}
    </article>
  )
}

export function Banner({ err, note }: { err?: string; note?: string }) {
  return <>
    {err && <p className="error" role="alert">{err}</p>}
    {note && <p className="notice" role="status">{note}</p>}
  </>
}

const KID_TONES = ['pink', 'blue', 'gold', 'mint']
export const toneFor = (index: number) => KID_TONES[index % KID_TONES.length]

// ---------- Store sections ----------
// Friendly store names from the link (Amazon short links count as Amazon). No link: "Other wishes".
const STORE_NAMES: Record<string, string> = {
  'amazon': 'Amazon', 'a.co': 'Amazon', 'amzn.to': 'Amazon', 'amzn.com': 'Amazon', 'target': 'Target', 'walmart': 'Walmart',
  'etsy': 'Etsy', 'ebay': 'eBay', 'bestbuy': 'Best Buy', 'hottopic': 'Hot Topic', 'boxlunch': 'BoxLunch', 'barnesandnoble': 'Barnes & Noble',
  'crunchyroll': 'Crunchyroll', 'funko': 'Funko', 'lego': 'LEGO', 'costco': 'Costco', 'kohls': "Kohl's", 'shein': 'SHEIN', 'temu': 'Temu',
  'gamestop': 'GameStop', 'nintendo': 'Nintendo', 'apple': 'Apple', 'sephora': 'Sephora', 'ulta': 'Ulta', 'michaels': 'Michaels',
}
export function storeOf(i: Item): string {
  if (!i.product_url) return 'Other wishes'
  try {
    const host = new URL(i.product_url).hostname.toLowerCase().replace(/^(www|m|smile)\./, '')
    if (STORE_NAMES[host]) return STORE_NAMES[host]
    const parts = host.split('.')
    const main = parts.length > 2 && parts[parts.length - 2].length <= 3 ? parts[parts.length - 3] : parts[parts.length - 2] ?? parts[0]
    return STORE_NAMES[main] ?? (i.link_site && i.link_site.length <= 30 && !i.link_site.includes('.') ? i.link_site : main.charAt(0).toUpperCase() + main.slice(1))
  } catch { return 'Other wishes' }
}

// Collapsible section per store. Bigger stores first; "Other wishes" last.
export function StoreGroups({ items, render, summary, priority, openAll }: { items: Item[]; render: (i: Item) => ReactNode; summary?: (list: Item[]) => ReactNode; priority?: (list: Item[]) => number; openAll?: boolean }) {
  const groups = new Map<string, Item[]>()
  for (const i of items) { const s = storeOf(i); groups.set(s, [...(groups.get(s) ?? []), i]) }
  const pr = (n: string) => (priority ? priority(groups.get(n)!) : 0)
  const names = [...groups.keys()].sort((a, b) => pr(b) - pr(a) || (a === 'Other wishes' ? 1 : b === 'Other wishes' ? -1 : groups.get(b)!.length - groups.get(a)!.length || a.localeCompare(b)))
  return (
    <div className="stores">
      {names.map((name) => {
        const list = groups.get(name)!
        return (
          <details key={name + (openAll ? '-open' : '')} className="store" open={openAll || undefined}>
            <summary>
              <span className="store-badge" aria-hidden="true">{name === 'Other wishes' ? '+' : name.charAt(0)}</span>
              <span className="store-name"><strong>{name}</strong><small>{summary ? summary(list) : `${list.length} ${list.length === 1 ? 'wish' : 'wishes'}`}</small></span>
              <svg className="store-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
            <div className="wish-grid store-items">{list.map(render)}</div>
          </details>
        )
      })}
    </div>
  )
}

// ---------- Search, ranking and the "Can't live without" / "Top choice" tags ----------
const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean)
// Every typed word must appear somewhere in the wish (name, notes, store, link title)
export function matches(i: Item, q: string) {
  const w = words(q)
  if (!w.length) return true
  const hay = [i.name, i.description, i.link_title, i.link_site, siteName(i.product_url)].join(' ').toLowerCase()
  return w.every((x) => hay.includes(x))
}
// Can't live without first, then top choices
export const wishRank = (i: Item) => (i.must_have ? 2 : 0) + (i.top_choice ? 1 : 0)
export const byRank = (a: Item, b: Item) => wishRank(b) - wishRank(a)
export const groupRank = (list: Item[]) => Math.max(0, ...list.map(wishRank))

export function SearchBox({ value, onChange, count, total }: { value: string; onChange: (v: string) => void; count: number; total: number }) {
  return (
    <div className="search">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search wishes" aria-label="Search wishes" enterKeyHint="search" />
      {value && <button type="button" className="search-clear" onClick={() => onChange('')} aria-label="Clear search"><Close size={16} /></button>}
      {value && <span className="search-count" role="status">{count} of {total}</span>}
    </div>
  )
}

export const CeCeTrio = ({ size = 26 }: { size?: number }) => (
  <span className="cece-trio" aria-hidden="true">
    {[0, 1, 2].map((n) => <img key={n} src={`${BASE}cece.png`} alt="" width={size} height={size} />)}
  </span>
)
export const MustHaveTag = () => <span className="tag must"><CeCeTrio size={20} /> Can't live without</span>
export const TopTag = () => <span className="tag gold"><img className="tag-cece" src={`${BASE}cece.png`} alt="" width="18" height="18" /> Top choice</span>
export const wishTag = (i: Item) => (i.must_have ? <MustHaveTag /> : i.top_choice ? <TopTag /> : undefined)
