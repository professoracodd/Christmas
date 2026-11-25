import { useEffect, useState, FormEvent } from 'react'
import { admin, personalLink, TITLE } from './supabase'

type Person = { id: string; name: string; role: string; token: string | null }
const ROLE = { parent: 'Parent', gift_buyer: 'Gift buyer', child: 'Kid' } as Record<string, string>

// Opens the phone's text messages with the message already filled in
const smsHref = (p: Person) =>
  `sms:?&body=${encodeURIComponent(`Hi ${p.name}! This is your personal link to the ${TITLE} list. Please keep it private: ${personalLink(p.token!)}`)}`

export default function People() {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState('gift_buyer')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const load = () => admin({ action: 'list_people' }).then((r) => setPeople(r.people)).catch(() => setPeople(null))
  useEffect(() => { load() }, [])
  if (!people) return null // only the owner (mom) sees this section

  async function add(e: FormEvent) {
    e.preventDefault(); setErr(''); setNote('')
    try { await admin({ action: 'add_person', name, role }); setName(''); setNote(`${name} added. Tap "Text link" next to their name.`); load() }
    catch (x: any) { setErr(x.message) }
  }
  async function renew(p: Person) {
    if (!confirm(`Make a new link for ${p.name}? Their old link will stop working for new sign-ins.`)) return
    setErr(''); setNote('')
    try { await admin({ action: 'reset_link', person_id: p.id }); setNote(`New link ready for ${p.name}.`); load() } catch (x: any) { setErr(x.message) }
  }
  async function copy(p: Person) {
    try { await navigator.clipboard.writeText(personalLink(p.token!)); setNote(`${p.name}'s link copied.`) }
    catch { setNote(''); setErr('Could not copy. Use Text link instead.') }
  }

  return (
    <section className="card">
      <h2>Who has access</h2>
      <p className="hint">Each person has their own private link. Opening it signs them in on that phone. You can re-send it any time.</p>
      {err && <p className="error" role="alert">{err}</p>}
      {note && <p className="notice" role="status">{note}</p>}
      <ul className="items">
        {people.map((p) => (
          <li key={p.id}>
            <div><strong>{p.name}</strong><p>{ROLE[p.role]}</p></div>
            <div className="row">
              {p.token && <a className="btn primary" href={smsHref(p)}>Text link</a>}
              {p.token && <button onClick={() => copy(p)}>Copy</button>}
              <button onClick={() => renew(p)}>New link</button>
            </div>
          </li>
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
