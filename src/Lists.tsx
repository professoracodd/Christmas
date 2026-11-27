import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, admin, Profile, Item, ITEM_COLS, money } from './supabase'
import { WishCard, Banner, toneFor, StoreGroups, SearchBox, matches, byRank, groupRank, wishTag } from './ui'
import { Check, ChevronLeft, Gift, Sparkle, Star, Trash } from './Icons'

type Kid = { id: string; display_name: string }

// Shared lists for parents and gift buyers. Kids never see purchase status (the database blocks it too).
// Home shows the nutcracker with a button per kid; each kid's page has the progress bar and a "Still needed" filter.
export default function Lists({ me, isOwner = false }: { me: Profile; isOwner?: boolean }) {
  const [kids, setKids] = useState<Kid[]>([])
  const [items, setItems] = useState<Item[] | null>(null)
  const [bought, setBought] = useState<Record<string, boolean>>({})
  const [buyer, setBuyer] = useState<Record<string, string | null>>({})   // item id -> profile id of who bought it
  const [names, setNames] = useState<Record<string, string>>({})          // owner only: profile id -> name
  const [kidId, setKidId] = useState<string | null>(null)
  const [view, setView] = useState<'needed' | 'bought'>('needed')
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const timer = useRef<number>()

  async function load() {
    const [k, i, s] = await Promise.all([
      supabase.from('profiles').select('id, display_name').eq('family_id', me.family_id).eq('role', 'child').order('created_at'),
      supabase.from('wish_list_items').select(ITEM_COLS).eq('family_id', me.family_id).order('created_at', { ascending: false }),
      supabase.from('purchase_status').select('item_id, status, purchased_by').eq('family_id', me.family_id),
    ])
    if (k.error || i.error || s.error) setErr('Could not load the lists. Check your connection and try again.')
    else setErr('')
    setKids((k.data as Kid[]) || [])
    setItems((i.data as Item[]) || [])
    setBought(Object.fromEntries((s.data || []).map((r: any) => [r.item_id, r.status === 'purchased'])))
    setBuyer(Object.fromEntries((s.data || []).map((r: any) => [r.item_id, r.purchased_by ?? null])))
    if (isOwner) {
      const { data: ppl } = await supabase.from('profiles').select('id, display_name').eq('family_id', me.family_id)
      setNames(Object.fromEntries((ppl || []).map((p: any) => [p.id, p.display_name])))
    }
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

  // Who may undo: whoever bought it, or Mom (the owner) for anyone's. The database enforces the same rule.
  const canUndo = (i: Item) => isOwner || buyer[i.id] === me.id
  const boughtBy = (i: Item) => {
    const b = buyer[i.id]
    if (b === me.id) return 'Bought by you'
    if (isOwner) return b ? `Bought by ${names[b] ?? 'someone'}` : 'Bought (before names were saved)'
    return 'Bought by another'
  }

  async function toggle(i: Item) {
    const next = !bought[i.id]
    if (!next) {
      if (!canUndo(i)) return setErr('You did not buy this.')
      const who = buyer[i.id] && buyer[i.id] !== me.id ? `${names[buyer[i.id]!] ?? 'Someone else'} bought this. ` : ''
      if (!confirm(`${who}Mark "${i.name}" as still needed? Others will see it as available again.`)) return
    }
    setBusy(i.id); setErr('')
    const prevBuyer = buyer[i.id] ?? null
    setBought((b) => ({ ...b, [i.id]: next })); setBuyer((m) => ({ ...m, [i.id]: next ? me.id : null }))
    const { error } = await supabase.from('purchase_status').update({ status: next ? 'purchased' : 'available' }).eq('item_id', i.id)
    if (error) {
      setErr(!next ? 'You did not buy this.' : 'Could not update. Please try again.')
      setBought((b) => ({ ...b, [i.id]: !next })); setBuyer((m) => ({ ...m, [i.id]: prevBuyer }))
      load()
    }
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
                <button key={k.id} className={`kid-pick ${toneFor(kidIndex[k.id] ?? 0)}`} onClick={() => { setView('needed'); setQ(''); setKidId(k.id) }}>
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
  const needed = mine.filter((i) => !bought[i.id] && matches(i, q)).sort(byRank)
  const neededAll = mine.filter((i) => !bought[i.id]).length
  const mineFirst = (i: Item) => (buyer[i.id] === me.id ? 0 : 1)
  const boughtAll = mine.filter((i) => bought[i.id])
  const boughtList = boughtAll.filter((i) => matches(i, q)).sort((a, b) => mineFirst(a) - mineFirst(b))
  const got = mine.filter((i) => bought[i.id]).length
  const pct = mine.length ? Math.round((got / mine.length) * 100) : 0
  const stillCost = mine.filter((i) => !bought[i.id]).reduce((s, i) => s + (Number(i.estimated_price) || 0), 0)
  // What this shopper has bought: for this kid, and across every list
  const sum = (list: Item[]) => list.reduce((s, i) => s + (Number(i.estimated_price) || 0), 0)
  const myHere = boughtAll.filter((i) => buyer[i.id] === me.id)
  const myAll = all.filter((i) => bought[i.id] && buyer[i.id] === me.id)
  const noPrice = myAll.filter((i) => i.estimated_price === null).length

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
        <button className={`chip${view === 'needed' ? ' on' : ''}`} aria-pressed={view === 'needed'} onClick={() => setView('needed')}>Still needed ({neededAll})</button>
        <button className={`chip${view === 'bought' ? ' on' : ''}`} aria-pressed={view === 'bought'} onClick={() => setView('bought')}>Bought ({boughtAll.length})</button>
      </div>
      {mine.length > 0 && <SearchBox value={q} onChange={setQ} count={(view === 'needed' ? needed : boughtList).length} total={view === 'needed' ? neededAll : boughtAll.length} />}

      {items !== null && (view === 'needed' ? needed : boughtList).length === 0 && (
        <div className="empty">
          <div className="empty-art"><Gift size={30} /></div>
          <h3>{mine.length === 0 ? 'No wishes yet' : q ? `No wishes match "${q}"` : view === 'needed' ? 'Everything is bought!' : 'Nothing bought yet'}</h3>
          <p>{mine.length === 0 ? `When ${kid?.display_name ?? 'they'} adds wishes, they show up here.`
            : q ? 'Try a different word.' : view === 'needed' ? 'Nothing left on this list.' : 'Tap "I bought this" on a gift and it moves here.'}</p>
        </div>
      )}

      {view === 'needed' ? (
        <StoreGroups key="needed" items={needed} openAll={!!q} priority={groupRank}
          summary={(list) => {
            const m = list.filter((i) => i.must_have).length, t = list.filter((i) => i.top_choice && !i.must_have).length
            return [`${list.length} still needed`, m ? `${m} can't live without` : '', t ? `${t} top ${t === 1 ? 'choice' : 'choices'}` : ''].filter(Boolean).join(' · ')
          }}
          render={(i) => (
            <WishCard key={i.id} item={i}
              top={wishTag(i) ?? <span className="tag plain"><Sparkle size={14} /> Still wished for</span>}
              actions={<>{removeBtn(i)}<button className="pill primary" disabled={busy === i.id} onClick={() => toggle(i)}><Check size={16} /> I bought this</button></>}
            />
          )} />
      ) : (<>
        {myAll.length > 0 && (
          <section className="spend" aria-label="What you have spent">
            <div className="spend-row"><span>Your gifts for {kid?.display_name}</span><strong>{money(sum(myHere))}</strong></div>
            <small>{myHere.length} {myHere.length === 1 ? 'gift' : 'gifts'}</small>
            {myAll.length !== myHere.length && (
              <div className="spend-row all"><span>All your gifts</span><strong>{money(sum(myAll))}</strong></div>
            )}
            {noPrice > 0 && <small>{noPrice} of your gifts {noPrice === 1 ? 'has' : 'have'} no price listed, so {noPrice === 1 ? "it isn't" : "they aren't"} counted.</small>}
          </section>
        )}
        <StoreGroups key="bought" items={boughtList} openAll={!!q}
          summary={(list) => {
            const you = list.filter((i) => buyer[i.id] === me.id).length, other = list.length - you
            return [you ? `${you} bought by you` : '', other ? `${other} bought by another` : ''].filter(Boolean).join(' · ')
          }}
          priority={(list) => list.filter((i) => buyer[i.id] === me.id).length}
          render={(i) => (
            <WishCard key={i.id} item={i}
              top={<span className="tag mint"><Check size={14} /> {boughtBy(i)}</span>}
              actions={<>{removeBtn(i)}{canUndo(i)
                ? <button className="pill soft" disabled={busy === i.id} onClick={() => toggle(i)}>Undo, still needed</button>
                : <span className="muted">Only the buyer can undo</span>}</>}
            />
          )} />
      </>)}
    </>
  )
}
