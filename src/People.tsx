import { useEffect, useState, FormEvent } from 'react'
import { admin, personalLink, TITLE, Profile } from './supabase'
import { Banner } from './ui'
import { Copy, Message, Refresh, Trash, Users } from './Icons'

type Person = { id: string; name: string; role: string; token: string | null }
const ROLE = { parent: 'Parent', gift_buyer: 'Gift buyer', child: 'Kid' } as Record<string, string>

// Opens the phone's text messages with the message already filled in
const smsHref = (p: Person) =>
  `sms:?&body=${encodeURIComponent(`Hi ${p.name}! This is your personal link to the ${TITLE} list. Please keep it private: ${personalLink(p.token!)}`)}`

// Only the owner (the first parent) can load this; everyone else gets null and the tab is hidden
export function useIsOwner(enabled: boolean) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const load = () => admin({ action: 'list_people' }).then((r) => setPeople(r.people)).catch(() => setPeople(null))
  useEffect(() => { if (enabled) load() }, [enabled])
  return { people, reload: load }
}

export default function People({ me, people, reload }: { me: Profile; people: Person[]; reload: () => void }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('gift_buyer')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function add(e: FormEvent) {
    e.preventDefault(); setErr(''); setNote(''); setBusy(true)
    try { await admin({ action: 'add_person', name, role }); setNote(`${name} added. Tap "Text link" next to their name.`); setName(''); reload() }
    catch (x: any) { setErr(x.message) }
    setBusy(false)
  }
  async function renew(p: Person) {
    if (!confirm(`Make a new link for ${p.name}? Their old link will stop working for new sign-ins.`)) return
    setErr(''); setNote('')
    try { await admin({ action: 'reset_link', person_id: p.id }); setNote(`New link ready for ${p.name}.`); reload() } catch (x: any) { setErr(x.message) }
  }
  async function removePerson(p: Person) {
    const extra = p.role === 'child' ? ` Their whole wish list will be deleted too.` : ` Their link will stop working.`
    if (!confirm(`Remove ${p.name}?${extra} This can't be undone.`)) return
    setErr(''); setNote('')
    try { await admin({ action: 'delete_person', person_id: p.id }); setNote(`${p.name} was removed.`); reload() } catch (x: any) { setErr(x.message) }
  }
  async function copy(p: Person) {
    setErr(''); setNote('')
    try { await navigator.clipboard.writeText(personalLink(p.token!)); setNote(`${p.name}'s link copied.`) }
    catch { setErr('Could not copy. Use Text link instead.') }
  }

  return (
    <>
      <section className="hero">
        <div className="hero-row">
          <div className="avatar" aria-hidden="true"><Users size={28} /></div>
          <div><h1>Who Has Access</h1><p>Each person has their own private link. Opening it signs them in on that phone.</p></div>
        </div>
      </section>
      <Banner err={err} note={note} />
      <ul className="people">
        {people.map((p) => (
          <li key={p.id} className="card">
            <div className="person">
              <div className="mini-avatar" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</div>
              <div><strong>{p.name}</strong><span className="muted">{p.id === me.id ? 'Owner (you)' : ROLE[p.role]}</span></div>
            </div>
            {p.id === me.id ? (
              <p className="muted">You sign in with the setup code (Owner sign-in), so you don't need a link.</p>
            ) : <div className="person-actions">
              {p.token && <a className="pill primary" href={smsHref(p)}><Message size={16} /> Text link</a>}
              {p.token && <button className="pill soft" onClick={() => copy(p)}><Copy size={16} /> Copy</button>}
              <button className="pill ghost" onClick={() => renew(p)}><Refresh size={16} /> New link</button>
              <button className="pill ghost danger" onClick={() => removePerson(p)}><Trash size={16} /> Remove</button>
            </div>}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="card form">
        <h2>Add someone</h2>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Grandma" /></label>
        <label className="field"><span>They are a…</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="gift_buyer">Gift buyer (sees lists, marks gifts bought)</option>
            <option value="parent">Parent (same, plus sees everyone)</option>
            <option value="child">Kid (makes their own wish list)</option>
          </select>
        </label>
        <button className="pill primary block" disabled={busy}>{busy ? 'Adding…' : 'Add person'}</button>
      </form>
    </>
  )
}
