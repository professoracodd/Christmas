import { useEffect, useState, FormEvent } from 'react'
import { supabase, Profile } from './supabase'

type Item = { id: string; name: string; description: string | null; estimated_price: number | null; product_url: string | null }
const blank = { name: '', description: '', price: '', url: '' }

export default function Child({ me }: { me: Profile }) {
  const [items, setItems] = useState<Item[]>([])
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [err, setErr] = useState('')

  async function load() {
    const { data } = await supabase.from('wish_list_items')
      .select('id, name, description, estimated_price, product_url')
      .eq('child_id', me.id).order('created_at', { ascending: false })
    setItems((data as Item[]) || [])
  }
  useEffect(() => { load() }, [])

  function edit(i?: Item) {
    setErr('')
    setForm(i ? { name: i.name, description: i.description || '', price: i.estimated_price?.toString() || '', url: i.product_url || '' } : blank)
    setEditing(i ? i.id : 'new')
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const url = form.url.trim()
    if (url && !/^https?:\/\//i.test(url)) return setErr('The link should start with http:// or https://')
    const price = form.price.trim() === '' ? null : Number(form.price)
    if (price !== null && (isNaN(price) || price < 0)) return setErr('Price should be a number like 25 or 24.99')
    const row = { name: form.name.trim(), description: form.description.trim() || null, estimated_price: price, product_url: url || null }
    const { error } = editing === 'new'
      ? await supabase.from('wish_list_items').insert({ ...row, child_id: me.id, family_id: me.family_id })
      : await supabase.from('wish_list_items').update(row).eq('id', editing)
    if (error) return setErr('Could not save. Please try again.')
    setEditing(null); load()
  }

  async function remove(i: Item) {
    if (!confirm(`Delete "${i.name}" from your list?`)) return
    await supabase.from('wish_list_items').delete().eq('id', i.id)
    load()
  }

  const set = (k: keyof typeof blank) => (e: any) => setForm({ ...form, [k]: e.target.value })

  return (
    <main>
      <section className="card">
        <div className="row"><h2>{me.display_name}'s Christmas list</h2><button className="primary" onClick={() => edit()}>Add item</button></div>
        {editing && (
          <form onSubmit={save} className="itemform">
            <label className="field"><span>What do you want?</span><input value={form.name} onChange={set('name')} required maxLength={200} /></label>
            <label className="field"><span>Details (color, size, anything helpful)</span><textarea value={form.description} onChange={set('description')} maxLength={2000} rows={2} /></label>
            <label className="field"><span>About how much? ($)</span><input value={form.price} onChange={set('price')} inputMode="decimal" /></label>
            <label className="field"><span>Link to it</span><input value={form.url} onChange={set('url')} inputMode="url" /></label>
            {err && <p className="error" role="alert">{err}</p>}
            <div className="row"><button className="primary">Save</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></div>
          </form>
        )}
        {items.length === 0 && !editing && <p>Your list is empty. Tap Add item to start it.</p>}
        <ul className="items">
          {items.map((i) => (
            <li key={i.id}>
              <div>
                <strong>{i.name}</strong>
                {i.estimated_price !== null && <span className="price"> ${Number(i.estimated_price).toFixed(2)}</span>}
                {i.description && <p>{i.description}</p>}
                {i.product_url && <a href={i.product_url} target="_blank" rel="noopener noreferrer">View link</a>}
              </div>
              <div className="row"><button onClick={() => edit(i)}>Edit</button><button className="danger" onClick={() => remove(i)}>Delete</button></div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
