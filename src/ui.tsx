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
