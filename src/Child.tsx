import { useEffect, useRef, useState, FormEvent } from 'react'
import { supabase, Profile, Item, ITEM_COLS, siteName } from './supabase'
import { findPicture, uploadPhoto, isUploadedPhoto } from './pictures'
import { Sheet, WishCard, WishImage, Banner } from './ui'
import { Camera, Close, LinkOut, Pencil, Plus, Trash, Sparkle } from './Icons'

// photo: the picture is one the kid uploaded (kept even without a link)
const blank = { notes: '', price: '', url: '', image_url: '', link_title: '', link_site: '', photo: false }

// One "Notes" box for the kids. The list still needs a short title, so it comes from the store page's name
// when there is a link, otherwise from the first line of the notes (the rest become the details).
function splitNotes(notes: string, linkTitle: string, url: string) {
  const text = notes.trim()
  if (linkTitle) return { name: linkTitle.slice(0, 200), description: text || null }
  if (text) {
    const [first, ...rest] = text.split('\n')
    const head = first.trim()
    if (head.length > 200) return { name: head.slice(0, 197) + '...', description: text }
    return { name: head, description: rest.join('\n').trim() || null }
  }
  if (url) return { name: `Something from ${siteName(url) || 'this link'}`, description: null }
  return null
}
function joinNotes(i: Item) {
  if (i.link_title && i.name === i.link_title.slice(0, 200)) return i.description || ''
  if (i.name.startsWith('Something from ') && !i.description) return ''
  if (i.description && i.description.startsWith(i.name.replace(/\.\.\.$/, ''))) return i.description
  return [i.name, i.description].filter(Boolean).join('\n')
}
type Form = typeof blank

export default function Child({ me }: { me: Profile }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [form, setForm] = useState<Form>(blank)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [looking, setLooking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lookNote, setLookNote] = useState('')
  const lastLooked = useRef('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkMsg, setBulkMsg] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('wish_list_items').select(ITEM_COLS)
      .eq('child_id', me.id).order('created_at', { ascending: false })
    if (error) setErr('Could not load your list. Pull down to refresh.')
    setItems((data as Item[]) || [])
  }
  useEffect(() => { load() }, [])

  function edit(i?: Item) {
    setErr('')
    lastLooked.current = i?.product_url || ''
    setForm(i ? {
      notes: joinNotes(i), price: i.estimated_price?.toString() || '', url: i.product_url || '',
      image_url: i.image_url || '', link_title: i.link_title || '', link_site: i.link_site || '', photo: isUploadedPhoto(i.image_url),
    } : blank)
    setLookNote('')
    setEditing(i ? i.id : 'new')
  }

  // When a link is pasted, fetch the store's picture and name (fails quietly if the store blocks it)
  async function lookUp(raw: string) {
    const url = raw.trim()
    if (!/^https?:\/\/\S+\.\S+/i.test(url) || url === lastLooked.current) return
    lastLooked.current = url
    setLooking(true); setLookNote('')
    const r = await findPicture(url)
    setForm((f) => f.url.trim() !== url ? f : {
      ...f, link_title: r.title || '', link_site: r.site || '',
      // a photo the kid uploaded wins over the store picture
      ...(f.photo ? {} : { image_url: r.image || '' }),
    })
    if (!r.image) setLookNote("Couldn't get a picture from that store. Tap Add a photo to use a screenshot or picture instead.")
    setLooking(false)
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setErr(''); setUploading(true)
    try {
      const src = await uploadPhoto(file, me.id)
      setForm((f) => ({ ...f, image_url: src, photo: true })); setLookNote('')
    } catch (x: any) { setErr(x.message) }
    setUploading(false)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setErr('')
    const url = form.url.trim()
    if (url && !/^https?:\/\//i.test(url)) return setErr('The link should start with http:// or https://')
    const price = form.price.trim() === '' ? null : Number(form.price.replace(/[$,]/g, ''))
    if (price !== null && (isNaN(price) || price < 0)) return setErr('Price should be a number like 25 or 24.99')
    const keepPreview = url && url === lastLooked.current
    const parts = splitNotes(form.notes, keepPreview ? form.link_title : '', url)
    if (!parts) return setErr('Write a note about what you want, or paste a link.')
    const row = {
      ...parts, estimated_price: price, product_url: url || null,
      image_url: form.photo || keepPreview ? form.image_url || null : null,
      link_title: keepPreview ? form.link_title || null : null,
      link_site: keepPreview ? form.link_site || null : null,
    }
    setSaving(true)
    const { error } = editing === 'new'
      ? await supabase.from('wish_list_items').insert({ ...row, child_id: me.id, family_id: me.family_id })
      : await supabase.from('wish_list_items').update(row).eq('id', editing)
    setSaving(false)
    if (error) return setErr('Could not save. Please try again.')
    setEditing(null); load()
  }

  // Paste many links at once (e.g. copied from an Amazon wish list): each becomes a wish with its picture and name
  const linksIn = (text: string) => [...new Set((text.match(/https?:\/\/[^\s<>"')]+/gi) || []).map((u) => u.replace(/[.,;]+$/, '')))]
  async function addAll() {
    const have = new Set((items || []).map((i) => i.product_url))
    const links = linksIn(bulkText).filter((u) => !have.has(u)).slice(0, 25)
    if (!links.length) return setBulkMsg(linksIn(bulkText).length ? 'Those links are already on your list.' : 'Paste at least one link that starts with http.')
    setBulkBusy(true)
    let added = 0
    for (const [n, url] of links.entries()) {
      setBulkMsg(`Adding ${n + 1} of ${links.length}…`)
      const p = await findPicture(url)
      const site = p.site || siteName(url)
      const { error } = await supabase.from('wish_list_items').insert({
        child_id: me.id, family_id: me.family_id, product_url: url.slice(0, 2000),
        name: (p.title || `Something from ${site || 'this link'}`).slice(0, 200),
        link_title: p.title ? p.title.slice(0, 300) : null, link_site: site ? site.slice(0, 100) : null,
        image_url: p.image, description: null, estimated_price: null,
      })
      if (!error) added++
    }
    setBulkBusy(false); load()
    if (added === links.length) { setBulkOpen(false); setBulkText(''); setBulkMsg('') }
    else setBulkMsg(`Added ${added} of ${links.length}. The rest could not be saved.`)
  }

  async function remove(i: Item) {
    if (!confirm(`Take "${i.name}" off your list?`)) return
    await supabase.from('wish_list_items').delete().eq('id', i.id)
    load()
  }

  const set = (k: keyof Form) => (e: any) => setForm({ ...form, [k]: e.target.value })
  const count = items?.length ?? 0

  return (
    <>
      <section className="hero">
        <div className="hero-row">
          <div className="avatar" aria-hidden="true">{me.display_name.slice(0, 1).toUpperCase()}</div>
          <div>
            <h1>{me.display_name}'s Wish List</h1>
            <p>{items === null ? 'Loading…' : count === 0 ? 'Nothing here yet. Add your first wish!' : `${count} ${count === 1 ? 'wish' : 'wishes'} on your list`}</p>
          </div>
        </div>
      </section>

      {!editing && <Banner err={err} />}

      <div className="wish-grid">
        {items?.map((i) => (
          <WishCard key={i.id} item={i} actions={<>
            <button className="pill soft" onClick={() => edit(i)}><Pencil size={16} /> Change</button>
            <button className="pill ghost danger" onClick={() => remove(i)} aria-label={`Delete ${i.name}`}><Trash size={16} /> Delete</button>
          </>} />
        ))}
      </div>

      {items !== null && count === 0 && (
        <div className="empty">
          <div className="empty-art"><Sparkle size={30} /></div>
          <h3>Your list is empty</h3>
          <p>Tap <strong>Add a wish</strong> to tell Santa what you'd love this year.</p>
        </div>
      )}

      <div className="fab-wrap">
        <button className="fab" onClick={() => edit()}><Plus size={22} /> Add a wish</button>
        <button className="fab fab-small" onClick={() => { setBulkMsg(''); setBulkOpen(true) }}><LinkOut size={18} /> Add links</button>
      </div>

      <Sheet open={bulkOpen} title="Add several links" onClose={() => !bulkBusy && setBulkOpen(false)}>
        <div className="form">
          <label className="field"><span>Paste links</span>
            <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={6} disabled={bulkBusy}
              placeholder={'Paste one or more store links here.\nOn Amazon: open your list, tap an item, Share, Copy link, then paste. Repeat for each item.'} />
            <small>{(() => { const n = linksIn(bulkText).length; return n ? `${n} ${n === 1 ? 'link' : 'links'} found` : 'Each link becomes its own wish, with its picture.' })()}</small>
          </label>
          {bulkMsg && <p className="muted" role="status">{bulkMsg}</p>}
          <button className="pill primary block" disabled={bulkBusy || !linksIn(bulkText).length} onClick={addAll}>
            {bulkBusy ? 'Adding…' : 'Add them to my list'}
          </button>
        </div>
      </Sheet>

      <Sheet open={editing !== null} title={editing === 'new' ? 'Add a wish' : 'Change your wish'} onClose={() => setEditing(null)}>
        <form onSubmit={save} className="form">
          <label className="field"><span>Link to it (optional)</span>
            <input value={form.url} onChange={set('url')} onBlur={(e) => lookUp(e.target.value)} onPaste={(e) => { const t = e.clipboardData.getData('text'); setTimeout(() => lookUp(t), 0) }}
              inputMode="url" placeholder="Paste a store link" autoComplete="off" />
            <small>{looking ? 'Finding a picture…' : 'Paste a link and we will try to grab the picture.'}</small>
          </label>
          {lookNote && !looking && <p className="muted">{lookNote}</p>}
          {form.image_url && (form.photo || (form.url.trim() && form.url.trim() === lastLooked.current)) && (
            <div className="preview">
              <WishImage src={form.image_url} alt="" />
              <span>{form.photo ? 'Your photo' : form.link_site}</span>
              <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} aria-label="Remove picture"
                onClick={() => setForm((f) => ({ ...f, image_url: '', photo: false }))}><Close size={16} /></button>
            </div>
          )}
          <div className="photo-row">
            <label className="pill soft">
              <Camera size={16} /> {uploading ? 'Adding photo…' : form.image_url ? 'Change photo' : 'Add a photo'}
              <input type="file" accept="image/*" disabled={uploading} onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = '' }} />
            </label>
            <small className="muted">A screenshot of the toy works great.</small>
          </div>
          <label className="field"><span>Notes</span>
            <textarea value={form.notes} onChange={set('notes')} maxLength={2000} rows={4} placeholder={'What do you want? Add color, size, or anything helpful.'} />
          </label>
          <label className="field"><span>About how much? ($)</span><input value={form.price} onChange={set('price')} inputMode="decimal" placeholder="25" /></label>
          <Banner err={err} />
          <button className="pill primary block" disabled={saving}>{saving ? 'Saving…' : 'Save wish'}</button>
        </form>
      </Sheet>
    </>
  )
}
