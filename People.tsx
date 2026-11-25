import { useEffect, useState, FormEvent } from 'react'
import { admin, personalLink, TITLE } from './supabase'

type Person = { id: string; name: string; role: string }
type Sent = { name: string; link: string }
const ROLE = { parent: 'Parent', gift_buyer: 'Gift buyer', child: 'Kid' } as Record<string, string>

// Opens the phone's text messages with the message already filled in
const smsHref = (text: string) => `sms:?&body=${encodeURIComponent(text)}`
const message = (s: Sent) => `Hi ${s.name}! This is your personal link to the ${TITLE} list. Please keep it private: ${s.link}`

export default function People() {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState('gift_buyer')
  const [sent, setSent] = useState<Sent | null>(null)
  const [err, setErr] = useState('')

  const load = () => admin({ action: 'list_people' }).then((r) => setPeople(r.people)).catch(() => setPeople(null))
  useEffect(() => { load() }, [])
  if (!people) return null // only the owner (mom) sees this section

  async function run(fn: () => Promise<Sent>) {
    setErr(''); setSent(null)
    try { setSent(await fn()); load() } catch (e: any) { setErr(e.message) }
  }
  const add = (e: FormEvent) => {
    e.preventDefault()
    run(async () => { const r = await admin({ action: 'add_person', name, role }); setName(''); return { name: r.name, link: personalLink(r.token) } })
  }
  const renew = (p: Person) => run(async () => {
    if (!confirm(`Make a new link for ${p.name}? Their old link will stop working for new sign-ins.`)) throw new Error('')
    const r = await admin({ action: 'reset_link', person_id: p.id }); return { name: r.name, link: personalLink(r.token) }
  })

  return (
    <section className="card">
      <h2>Who has access</h2>
      <p className="hint">Each person gets their own private link. Opening it signs them in on that phone.</p>
      {err && <p className="error" role="alert">{err}</p>}
      {sent && (
        <div className="notice" role="status">
          <p><strong>{sent.name}'s link is ready.</strong> It is only shown now, so text it before you leave this screen.</p>
          <a className="btn primary" href={smsHref(message(sent))}>Text it to {sent.name}</a>
        </div>
      )}
      <ul className="items">
        {people.map((p) => (
          <li key={p.id}><div><strong>{p.name}</strong><p>{ROLE[p.role]}</p></div><button onClick={() => renew(p)}>New link</button></li>
        ))}
      </ul>
      <form onSubmit={add} className="addform">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="gift_buyer">Gift buyer</option><option value="parent">Parent</option><option value="child">Kid</option>
        </select>
        <button className="primary">Add</button>
      </form>
    </section>
  )
}
