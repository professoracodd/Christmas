import { ReactNode, useEffect, useRef, useState } from 'react'
import { Item, money, siteName } from './supabase'
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
export function StoreGroups({ items, render, summary }: { items: Item[]; render: (i: Item) => ReactNode; summary?: (list: Item[]) => ReactNode }) {
  const groups = new Map<string, Item[]>()
  for (const i of items) { const s = storeOf(i); groups.set(s, [...(groups.get(s) ?? []), i]) }
  const names = [...groups.keys()].sort((a, b) => (a === 'Other wishes' ? 1 : b === 'Other wishes' ? -1 : groups.get(b)!.length - groups.get(a)!.length || a.localeCompare(b)))
  const single = names.length === 1
  return (
    <div className="stores">
      {names.map((name) => {
        const list = groups.get(name)!
        return (
          <details key={name} className="store" open={single}>
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
