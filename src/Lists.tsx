import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, admin, Profile, Item, ITEM_COLS, money } from './supabase'
import { WishCard, Banner, toneFor, StoreGroups } from './ui'
import { Check, ChevronLeft, Gift, Sparkle, Trash } from './Icons'

type Kid = { id: string; display_name: string }

// Shared lists for parents and gift buyers. Kids never see purchase status (the database blocks it too).
// Home shows the nutcracker with a button per kid; each kid's page has the progress bar and a "Still needed" filter.
export default function Lists({ me, isOwner = false }: { me: Profile; isOwner?: boolean }) {
  const [kids, setKids] = useState<Kid[]>([])
  const [items, setItems] = useState<Item[] | null>(null)
  const [bought, setBought] = useState<Record<string, boolean>>({})
  const [kidId, setKidId] = useState<string | null>(null)
  const [view, setView] = useState<'needed' | 'bought'>('needed')
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

  // The home screen shows the whole nutcracker picture
  useEffect(() => {
    document.body.classList.toggle('home-view', kidId === null)
    window.scrollTo(0, 0)
    return () => document.body.classList.remove('home-view')
  }, [kidId])

  async function toggle(i: Item) {
    const next = !bought[i.id]
    if (!next && !confirm(`Mark "${i.name}" as still needed? Others will see it as available again.`)) return
    setBusy(i.id)
    setBought((b) => ({ ...b, [i.id]: next }))
    const { error } = await supabase.from('purchase_status').update({ status: next ? 'purchased' : 'available' }).eq('item_id', i.id)
    if (error) { setErr('Could not update. Please try again.'); setBought((b) => ({ ...b, [i.id]: !next })) }
    setBusy(null)
  }

  // Owner only: take a wish off a kid's list
  async function removeWish(i: Item) {
    const who = kids.find((k) => k.id === i.child_id)?.display_name ?? 'their'
    if (!confirm(`Remove "${i.name}" from ${who}'s list? It will be gone for everyone, including ${who}.`)) return
    setBusy(i.id); setErr('')
    try { await admin({ action: 'delete_item', item_id: i.id }); setItems((list) => (list ?? []).filter((x) => x.id !== i.id)) }
    catch (x: any) { setErr(x.message) }
    setBusy(null)
  }
  const removeBtn = (i: Item) => isOwner
    ? <button className="pill ghost danger" disabled={busy === i.id} onClick={() => removeWish(i)} aria-label={`Remove ${i.name} from the list`}><Trash size={16} /> Remove</button>
    : null

  const kidIndex = useMemo(() => Object.fromEntries(kids.map((k, n) => [k.id, n])), [kids])
  const all = items ?? []
  const stillNeeded = (id: string) => all.filter((i) => i.child_id === id && !bought[i.id]).length

  // ---------- Home ----------
  if (kidId === null) {
    return (
      <>
        <Banner err={err} />
        <section className="home-panel" aria-label="Choose a wish list">
          <h1>Whose list?</h1>
          <div className="kid-picks">
            {kids.map((k) => {
              const n = stillNeeded(k.id)
              return (
                <button key={k.id} className={`kid-pick ${toneFor(kidIndex[k.id] ?? 0)}`} onClick={() => { setView('needed'); setKidId(k.id) }}>
                  <span className="kid-initial" aria-hidden="true">{k.display_name.slice(0, 1).toUpperCase()}</span>
                  <span className="kid-text">
                    <strong>{k.display_name}</strong>
                    <small>{items === null ? 'Loading…' : n === 0 ? 'All set' : `${n} still needed`}</small>
                  </span>
                </button>
              )
            })}
            {items !== null && kids.length === 0 && <p className="muted">No kids on the list yet.</p>}
          </div>
        </section>
      </>
    )
  }

  // ---------- One kid's list ----------
  const kid = kids.find((k) => k.id === kidId)
  const mine = all.filter((i) => i.child_id === kidId)
  const needed = mine.filter((i) => !bought[i.id])
  const boughtList = mine.filter((i) => bought[i.id])
  const got = mine.filter((i) => bought[i.id]).length
  const pct = mine.length ? Math.round((got / mine.length) * 100) : 0
  const stillCost = mine.filter((i) => !bought[i.id]).reduce((s, i) => s + (Number(i.estimated_price) || 0), 0)

  return (
    <>
      <button className="back" onClick={() => setKidId(null)}><ChevronLeft size={18} /> All lists</button>
      <section className="kid-head">
        <div className="avatar small" aria-hidden="true">{kid?.display_name.slice(0, 1).toUpperCase()}</div>
        <div className="kid-head-main">
          <div className="kid-head-row">
            <h1>{kid?.display_name}'s List</h1>
            {mine.length > 0 && <span className="kid-count"><strong>{got} of {mine.length}</strong> bought</span>}
          </div>
          {mine.length > 0 ? (
            <div className="track slim" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${got} of ${mine.length} gifts bought`}>
              <div className="fill" style={{ width: `${Math.max(pct, pct ? 6 : 0)}%` }} />
            </div>
          ) : <p className="muted">No wishes yet</p>}
          {stillCost > 0 && <span className="muted tiny">{money(stillCost)} still on the list</span>}
        </div>
      </section>

      <Banner err={err} />

      <div className="chips" role="group" aria-label="Filter wishes">
        <button className={`chip${view === 'needed' ? ' on' : ''}`} aria-pressed={view === 'needed'} onClick={() => setView('needed')}>Still needed ({needed.length})</button>
        <button className={`chip${view === 'bought' ? ' on' : ''}`} aria-pressed={view === 'bought'} onClick={() => setView('bought')}>Bought ({boughtList.length})</button>
      </div>

      {items !== null && (view === 'needed' ? needed : boughtList).length === 0 && (
        <div className="empty">
          <div className="empty-art"><Gift size={30} /></div>
          <h3>{mine.length === 0 ? 'No wishes yet' : view === 'needed' ? 'Everything is bought!' : 'Nothing bought yet'}</h3>
          <p>{mine.length === 0 ? `When ${kid?.display_name ?? 'they'} adds wishes, they show up here.`
            : view === 'needed' ? 'Nothing left on this list.' : 'Tap "I bought this" on a gift and it moves here.'}</p>
        </div>
      )}

      {view === 'needed' ? (
        <StoreGroups key="needed" items={needed}
          summary={(list) => `${list.length} still needed`}
          render={(i) => (
            <WishCard key={i.id} item={i}
              top={<span className="tag plain"><Sparkle size={14} /> Still wished for</span>}
              actions={<>{removeBtn(i)}<button className="pill primary" disabled={busy === i.id} onClick={() => toggle(i)}><Check size={16} /> I bought this</button></>}
            />
          )} />
      ) : (
        <StoreGroups key="bought" items={boughtList}
          summary={(list) => `${list.length} bought`}
          render={(i) => (
            <WishCard key={i.id} item={i}
              top={<span className="tag mint"><Check size={14} /> Bought</span>}
              actions={<>{removeBtn(i)}<button className="pill soft" disabled={busy === i.id} onClick={() => toggle(i)}>Undo, still needed</button></>}
            />
          )} />
      )}
    </>
  )
}
