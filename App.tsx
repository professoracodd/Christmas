import { useEffect, useState, FormEvent } from 'react'
import { supabase, admin, startSession, TITLE, Profile } from './supabase'
import Child from './Child'
import People from './People'

type Mode = 'home' | 'setup' | 'owner'

function Auth({ problem }: { problem: string }) {
  const [mode, setMode] = useState<Mode>('home')
  const [f, setF] = useState<Record<string, string>>({})
  const [err, setErr] = useState(problem)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (problem) setErr(problem) }, [problem])
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await startSession(await admin(mode === 'setup'
        ? { action: 'bootstrap', setup_code: f.code, name: f.name }
        : { action: 'owner_login', setup_code: f.code }))
    } catch (x: any) { setErr(x.message) }
    setBusy(false)
  }
  const go = (m: Mode) => { setMode(m); setErr('') }

  return (
    <main className="card narrow">
      <h1>{TITLE}</h1>
      {err && <p className="error" role="alert">{err}</p>}
      {mode === 'home' ? (
        <>
          <p>Open your personal link from the text message you were sent. It signs you in on this phone.</p>
          <p className="links"><button onClick={() => go('owner')}>Owner sign-in</button><button onClick={() => go('setup')}>First-time setup</button></p>
        </>
      ) : (
        <form onSubmit={submit}>
          <label className="field"><span>Setup code</span><input type="password" value={f.code || ''} onChange={set('code')} required autoComplete="off" /><small>The code you saved as SETUP_CODE in Supabase</small></label>
          {mode === 'setup' && <label className="field"><span>Your name</span><input value={f.name || ''} onChange={set('name')} required maxLength={60} /></label>}
          <button className="primary" disabled={busy}>{busy ? 'Working…' : mode === 'setup' ? 'Create' : 'Sign in'}</button>
          <p className="links"><button type="button" onClick={() => go('home')}>Back</button></p>
        </form>
      )}
    </main>
  )
}

export default function App() {
  const [uid, setUid] = useState<string | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [problem, setProblem] = useState('')

  // Personal link: https://site/#k=TOKEN signs this phone in, then the token is removed from the address bar
  useEffect(() => {
    const m = window.location.hash.match(/^#k=([A-Za-z0-9]+)$/)
    if (!m) return
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    admin({ action: 'link_login', token: m[1] }).then(startSession).catch((e) => setProblem(e.message))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUid(data.session?.user.id ?? null))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUid(s?.user.id ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setProfile(null)
    if (!uid) return
    supabase.from('profiles').select('id, family_id, display_name, role').eq('id', uid).single().then(({ data }) => setProfile(data as Profile))
  }, [uid])

  if (uid === undefined) return <main className="card narrow"><p>Loading…</p></main>
  if (!uid) return <Auth problem={problem} />
  if (!profile) return <main className="card narrow"><p>Loading your account…</p></main>

  return (
    <div className="shell">
      <header>
        <strong>{profile.display_name}</strong>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      {profile.role === 'child' ? <Child me={profile} /> : (
        <main>
          <section className="card"><h2>Wish lists</h2><p>The shared list with purchase status is the next piece we build.</p></section>
          {profile.role === 'parent' && <People />}
        </main>
      )}
    </div>
  )
}
