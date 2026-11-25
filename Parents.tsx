import { useEffect, useState, FormEvent } from 'react'
import { admin } from './supabase'

type Kid = { id: string; display_name: string; username: string }

export default function Parents() {
  const [kids, setKids] = useState<Kid[]>([])
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  const [err, setErr] = useState('')

  const load = () => admin({ action: 'list_children' }).then((r) => setKids(r.children)).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  async function run(fn: () => Promise<string>) {
    setErr(''); setNotice('')
    try { setNotice(await fn()); load() } catch (e: any) { setErr(e.message) }
  }

  const addChild = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      const r = await admin({ action: 'create_child', display_name: name })
      setName('')
      return `${r.display_name} can sign in with username ${r.username} and PIN ${r.pin}. Write these down. The PIN is only shown once.`
    })
  }
  const resetPin = (k: Kid) => run(async () => {
    const r = await admin({ action: 'reset_child_pin', child_id: k.id })
    return `New PIN for ${r.display_name} (username ${r.username}): ${r.pin}. Write it down. It is only shown once.`
  })
  const invite = (role: 'parent' | 'gift_buyer') => run(async () => {
    const r = await admin({ action: 'create_invite', role })
    return `Invite code for a ${role === 'parent' ? 'parent' : 'gift buyer'}: ${r.code}. It works once and expires in 7 days.`
  })

  return (
    <section className="card">
      <h2>Family accounts</h2>
      {notice && <p className="notice" role="status">{notice}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      <h3>Kids</h3>
      <ul className="items">
        {kids.map((k) => (
          <li key={k.id}><div><strong>{k.display_name}</strong><p>Username: {k.username}</p></div><button onClick={() => resetPin(k)}>Reset PIN</button></li>
        ))}
      </ul>
      <form onSubmit={addChild} className="row">
        <input placeholder="Child's first name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        <button className="primary">Add child</button>
      </form>
      <h3>Invite another adult</h3>
      <div className="row"><button onClick={() => invite('parent')}>Invite a parent</button><button onClick={() => invite('gift_buyer')}>Invite a gift buyer</button></div>
    </section>
  )
}
