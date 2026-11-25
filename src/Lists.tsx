import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, Profile, Item, ITEM_COLS, money } from './supabase'
import { WishCard, Banner, toneFor } from './ui'
import { Check, Gift, Sparkle } from './Icons'

type Kid = { id: string; display_name: string }

// Shared list for parents and gift buyers. Kids never see purchase status (the database blocks it too).
export default function Lists({ me }: { me: Profile }) {
  const [kids, setKids] = useState<Kid[]>([])
  const [items, setItems] = useState<Item[] | null>(null)
  const [bought, setBought] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState<string>('all')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const timer = useRef<number>()

  async function load() {
    const [k, i, s] = await Promise.all([
      supabase.from('profiles').select('id, display_name').eq('family_id', me.family_id).eq('role', 'child').order('created_at'),
      supabase.from('wish_list_items').select(ITEM_COLS).eq('family_id', me.family_id).order('created_at', { ascending: false }),
      supabase.from('purchase_status').select('item_id, status').eq('family_id', me.family_id),
    ])
    if (k.error || i.error || s.error) setErr('Could not load the lists. Check your connection and try again.')
    else setErr('')
    setKids((k.data as Kid[]) || [])
    setItems((i.data as Item[]) || [])
    setBought(Object.fromEntries((s.data || []).map((r: any) => [r.item_id, r.status === 'purchased'])))
  }

  useEffect(() => {
    load()
    // Live updates: when anyone adds a wish or marks one bought, refresh (batched)
    const refresh = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(load, 400) }
    const ch = supabase.channel('family-lists')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wish_list_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_status' }, refresh)
      .subscribe()
    const onFocus = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onFocus)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onFocus); window.clearTimeout(timer.current) }
  }, [])

  async function toggle(i: Item) {
    const next = !bought[i.id]
    if (!next && !confirm(`Mark "${i.name}" as still needed? Others will see it as available again.`)) return
    setBusy(i.id)
    setBought((b) => ({ ...b, [i.id]: next }))
    const { error } = await supabase.from('purchase_status').update({ status: next ? 'purchased' : 'available' }).eq('item_id', i.id)
    if (error) { setErr('Could not update. Please try again.'); setBought((b) => ({ ...b, [i.id]: !next })) }
    setBusy(null)
  }

  const kidIndex = useMemo(() => Object.fromEntries(kids.map((k, n) => [k.id, n])), [kids])
  const kidName = (id: string) => kids.find((k) => k.id === id)?.display_name ?? 'Kid'
  const all = items ?? []
  const shown = all.filter((i) => filter === 'all' ? true : filter === 'needed' ? !bought[i.id] : i.child_id === filter)
    .sort((a, b) => Number(!!bought[a.id]) - Number(!!bought[b.id]))
  const got = all.filter((i) => bought[i.id]).length
  const pct = all.length ? Math.round((got / all.length) * 100) : 0
  const stillCost = all.filter((i) => !bought[i.id]).reduce((s, i) => s + (Number(i.estimated_price) || 0), 0)

  const chips = [{ id: 'all', label: 'All wishes' }, ...kids.map((k) => ({ id: k.id, label: k.display_name })), { id: 'needed', label: 'Still needed' }]

  return (
    <>
      <section className="hero">
        <div className="hero-row">
          <div className="avatar" aria-hidden="true"><Gift size={28} /></div>
          <div>
            <h1>Wish Lists</h1>
            <p>{items === null ? 'Loading…' : `${all.length} ${all.length === 1 ? 'wish' : 'wishes'} from ${kids.map((k) => k.display_name).join(' & ') || 'the kids'}`}</p>
          </div>
        </div>
        {all.length > 0 && (
          <div className="progress-box">
            <div className="progress-label">
              <span><strong>{got} of {all.length}</strong> gifts bought</span>
              {stillCost > 0 && <span className="muted">{money(stillCost)} still on the lists</span>}
            </div>
            <div className="track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Gifts bought">
              <div className="fill" style={{ width: `${Math.max(pct, pct ? 6 : 0)}%` }} />
            </div>
          </div>
        )}
      </section>

      <Banner err={err} />

      <div className="chips" role="group" aria-label="Filter wishes">
        {chips.map((c) => (
          <button key={c.id} className={`chip${filter === c.id ? ' on' : ''}`} aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>{c.label}</button>
        ))}
      </div>

      <div className="wish-grid">
        {shown.map((i) => {
          const done = !!bought[i.id]
          return (
            <WishCard key={i.id} item={i} faded={done}
              top={<>
                <span className={`tag ${toneFor(kidIndex[i.child_id] ?? 0)}`}>{kidName(i.child_id)}</span>
                {done ? <span className="tag mint"><Check size={14} /> Bought</span> : <span className="tag plain"><Sparkle size={14} /> Still wished for</span>}
              </>}
              actions={done
                ? <button className="pill soft" disabled={busy === i.id} onClick={() => toggle(i)}>Undo, still needed</button>
                : <button className="pill primary" disabled={busy === i.id} onClick={() => toggle(i)}><Check size={16} /> I bought this</button>}
            />
          )
        })}
      </div>

      {items !== null && shown.length === 0 && (
        <div className="empty">
          <div className="empty-art"><Gift size={30} /></div>
          <h3>{all.length === 0 ? 'No wishes yet' : filter === 'needed' ? 'Everything is bought!' : 'Nothing on this list yet'}</h3>
          <p>{all.length === 0 ? 'When the kids add wishes from their links, they show up here.' : 'Try another filter above.'}</p>
        </div>
      )}
    </>
  )
}
