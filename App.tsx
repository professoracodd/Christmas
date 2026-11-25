import { useEffect, useState, FormEvent } from 'react'
import { supabase, admin, CHILD_DOMAIN, Profile } from './supabase'
import Child from './Child'
import Parents from './Parents'

type Mode = 'login' | 'child' | 'setup' | 'join'

function Field(p: { label: string; value: string; set: (v: string) => void; type?: string; hint?: string; inputMode?: 'numeric' }) {
  return (
    <label className="field">
      <span>{p.label}</span>
      <input type={p.type || 'text'} value={p.value} onChange={(e) => p.set(e.target.value)} required inputMode={p.inputMode} autoComplete="off" />
      {p.hint && <small>{p.hint}</small>}
    </label>
  )
}

function Auth() {
  const [mode, setMode] = useState<Mode>('login')
  const [f, setF] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const go = (m: Mode) => { setMode(m); setErr('') }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('That login did not work. Check it and try again.')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      if (mode === 'login') await signIn(f.email.trim(), f.password)
      else if (mode === 'child') await signIn(`${f.username.trim().toLowerCase()}@${CHILD_DOMAIN}`, f.pin)
      else if (mode === 'setup') {
        await admin({ action: 'bootstrap', setup_code: f.code, family_name: f.family, display_name: f.name, email: f.email, password: f.password })
        await signIn(f.email.trim(), f.password)
      } else {
        await admin({ action: 'accept_invite', code: f.code, display_name: f.name, email: f.email, password: f.password })
        await signIn(f.email.trim(), f.password)
      }
    } catch (x: any) { setErr(x.message) }
    setBusy(false)
  }

  return (
    <main className="card narrow">
      <h1>Family Christmas Lists</h1>
      <div className="tabs">
        <button className={mode === 'login' ? 'on' : ''} onClick={() => go('login')}>Parent or gift buyer</button>
        <button className={mode === 'child' ? 'on' : ''} onClick={() => go('child')}>Kid login</button>
      </div>
      <form onSubmit={submit}>
        {mode === 'login' && <><Field label="Email" type="email" value={f.email || ''} set={set('email')} /><Field label="Password" type="password" value={f.password || ''} set={set('password')} /></>}
        {mode === 'child' && <><Field label="Your username" value={f.username || ''} set={set('username')} /><Field label="Your 6-digit PIN" type="password" inputMode="numeric" value={f.pin || ''} set={set('pin')} /></>}
        {mode === 'setup' && <>
          <Field label="Setup code" type="password" value={f.code || ''} set={set('code')} hint="The code you saved as SETUP_CODE in Supabase" />
          <Field label="Family name" value={f.family || ''} set={set('family')} />
          <Field label="Your name" value={f.name || ''} set={set('name')} />
          <Field label="Email" type="email" value={f.email || ''} set={set('email')} />
          <Field label="Password" type="password" value={f.password || ''} set={set('password')} hint="At least 8 characters" /></>}
        {mode === 'join' && <>
          <Field label="Invite code" value={f.code || ''} set={set('code')} />
          <Field label="Your name" value={f.name || ''} set={set('name')} />
          <Field label="Email" type="email" value={f.email || ''} set={set('email')} />
          <Field label="Password" type="password" value={f.password || ''} set={set('password')} hint="At least 8 characters" /></>}
        {err && <p className="error" role="alert">{err}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Working…' : mode === 'setup' ? 'Create family' : mode === 'join' ? 'Join family' : 'Sign in'}</button>
      </form>
      {(mode === 'login' || mode === 'child') && (
        <p className="links"><button onClick={() => go('join')}>I have an invite code</button><button onClick={() => go('setup')}>Set up a new family</button></p>
      )}
      {(mode === 'setup' || mode === 'join') && <p className="links"><button onClick={() => go('login')}>Back to sign in</button></p>}
    </main>
  )
}

export default function App() {
  const [uid, setUid] = useState<string | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)

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
  if (!uid) return <Auth />
  if (!profile) return <main className="card narrow"><p>Loading your account…</p></main>

  return (
    <div className="shell">
      <header>
        <strong>{profile.display_name}</strong>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      {profile.role === 'child' ? <Child me={profile} /> : (
        <main>
          <section className="card"><h2>Family wish lists</h2><p>The shared list view with purchase status is the next piece we build.</p></section>
          {profile.role === 'parent' && <Parents />}
        </main>
      )}
    </div>
  )
}
