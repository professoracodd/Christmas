import { useEffect, useRef, useState, FormEvent } from 'react'
import { admin, supabase, Profile, Item, ITEM_COLS } from './supabase'
import { Sheet, WishCard, WishImage, Banner } from './ui'
import { Pencil, Plus, Trash, Sparkle } from './Icons'

const blank = { name: '', description: '', price: '', url: '', image_url: '', link_title: '', link_site: '' }
type Form = typeof blank

export default function Child({ me }: { me: Profile }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [form, setForm] = useState<Form>(blank)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [looking, setLooking] = useState(false)
  const lastLooked = useRef('')

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
      name: i.name, description: i.description || '', price: i.estimated_price?.toString() || '', url: i.product_url || '',
      image_url: i.image_url || '', link_title: i.link_title || '', link_site: i.link_site || '',
    } : blank)
    setEditing(i ? i.id : 'new')
  }

  // When a link is pasted, fetch the store's picture and name (fails quietly if the store blocks it)
  async function lookUp(raw: string) {
    const url = raw.trim()
    if (!/^https?:\/\/\S+\.\S+/i.test(url) || url === lastLooked.current) return
    lastLooked.current = url
    setLooking(true)
    try {
      const r = await admin({ action: 'link_preview', url })
      setForm((f) => f.url.trim() !== url ? f : {
        ...f, image_url: r.image || '', link_title: r.title || '', link_site: r.site || '',
        name: f.name || (r.title ? String(r.title).slice(0, 200) : ''),
      })
    } catch { setForm((f) => ({ ...f, image_url: '', link_title: '', link_site: '' })) }
    setLooking(false)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setErr('')
    const url = form.url.trim()
    if (url && !/^https?:\/\//i.test(url)) return setErr('The link should start with http:// or https://')
    const price = form.price.trim() === '' ? null : Number(form.price.replace(/[$,]/g, ''))
    if (price !== null && (isNaN(price) || price < 0)) return setErr('Price should be a number like 25 or 24.99')
    const keepPreview = url && url === lastLooked.current
    const row = {
      name: form.name.trim(), description: form.description.trim() || null, estimated_price: price, product_url: url || null,
      image_url: keepPreview ? form.image_url || null : null,
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

      <div className="fab-wrap"><button className="fab" onClick={() => edit()}><Plus size={22} /> Add a wish</button></div>

      <Sheet open={editing !== null} title={editing === 'new' ? 'Add a wish' : 'Change your wish'} onClose={() => setEditing(null)}>
        <form onSubmit={save} className="form">
          <label className="field"><span>Link to it (optional)</span>
            <input value={form.url} onChange={set('url')} onBlur={(e) => lookUp(e.target.value)} onPaste={(e) => { const t = e.clipboardData.getData('text'); setTimeout(() => lookUp(t), 0) }}
              inputMode="url" placeholder="Paste a store link" autoComplete="off" />
            <small>{looking ? 'Finding a picture…' : 'Paste a link and we will try to grab the picture.'}</small>
          </label>
          {form.url.trim() && form.url.trim() === lastLooked.current && form.image_url && (
            <div className="preview"><WishImage src={form.image_url} alt="" /><span>{form.link_site}</span></div>
          )}
          <label className="field"><span>What do you want?</span><input value={form.name} onChange={set('name')} required maxLength={200} /></label>
          <label className="field"><span>Details (color, size, anything helpful)</span><textarea value={form.description} onChange={set('description')} maxLength={2000} rows={2} /></label>
          <label className="field"><span>About how much? ($)</span><input value={form.price} onChange={set('price')} inputMode="decimal" placeholder="25" /></label>
          <Banner err={err} />
          <button className="pill primary block" disabled={saving}>{saving ? 'Saving…' : 'Save wish'}</button>
        </form>
      </Sheet>
    </>
  )
}
