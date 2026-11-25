import { useEffect, useState, FormEvent, ReactNode } from 'react'
import { supabase, admin, startSession, configured, daysToChristmas, TITLE, Profile, BASE, asset } from './supabase'
import Child from './Child'
import Lists from './Lists'
import People, { useIsOwner } from './People'
import { Banner } from './ui'
import { HelpIcon, List, Logout, Users } from './Icons'

type Mode = 'home' | 'setup' | 'owner'
const ROLE_LABEL: Record<string, string> = { parent: 'Parent', gift_buyer: 'Gift buyer', child: 'Wish maker' }

// Personal links come as #k=TOKEN (texted) or ?k=TOKEN (home-screen shortcut)
const TOKEN_RE = /^[A-Za-z0-9]{20,100}$/
function tokenFromUrl(): string | null {
  const h = window.location.hash.match(/^#k=([A-Za-z0-9]+)$/)?.[1]
  const q = new URLSearchParams(window.location.search).get('k')
  const t = h || q
  return t && TOKEN_RE.test(t) ? t : null
}
export function tokenFromText(text: string): string | null {
  const m = text.trim().match(/[#?&]k=([A-Za-z0-9]+)/)?.[1] ?? text.trim()
  return TOKEN_RE.test(m) ? m : null
}

// Keep the link in the address as ?k=TOKEN on the app's home address. iPhones save exactly this address
// for a home-screen icon (home-screen apps there have their own storage, so the icon must carry the link).
const START_TOKEN = tokenFromUrl()
if (window.location.pathname !== BASE || window.location.hash.startsWith('#k=')) {
  window.history.replaceState(null, '', BASE + (START_TOKEN ? `?k=${START_TOKEN}` : window.location.search) + (window.location.hash.startsWith('#k=') ? '' : window.location.hash))
}

// The install manifest is only for Android/desktop: on iPhone it would make the icon open the bare address without the link
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
if (!IOS) {
  const l = document.createElement('link'); l.rel = 'manifest'; l.href = asset('manifest.webmanifest'); document.head.appendChild(l)
}

function Splash({ children }: { children: ReactNode }) {
  return (
    <main className="splash">
      <div className="card auth">
        <img src={asset('icon-192.png')} alt="" className="auth-logo" width={88} height={88} />
        <h1>{TITLE}</h1>
        {children}
      </div>
    </main>
  )
}

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

  async function pasteLink(e: FormEvent) {
    e.preventDefault()
    const token = tokenFromText(f.link || '')
    if (!token) return setErr("That doesn't look like a personal link. Copy the whole link from the text message.")
    setBusy(true); setErr('')
    try {
      await startSession(await admin({ action: 'link_login', token }))
      window.history.replaceState(null, '', `${BASE}?k=${token}`) // so a home-screen icon made now keeps the link
    } catch (x: any) { setErr(x.message) }
    setBusy(false)
  }

  return (
    <Splash>
      <Banner err={err} />
      {mode === 'home' ? (
        <>
          <p className="lead">Open your personal link from the text message you were sent. It signs you in on this phone.</p>
          <form className="form" onSubmit={pasteLink}>
            <label className="field"><span>Or paste your personal link</span>
              <input value={f.link || ''} onChange={set('link')} placeholder="https://…#k=…" autoComplete="off" inputMode="url" />
            </label>
            <button className="pill primary block" disabled={busy || !f.link}>{busy ? 'Signing in…' : 'Sign in with my link'}</button>
          </form>
          <div className="text-links"><button onClick={() => go('owner')}>Owner sign-in</button><button onClick={() => go('setup')}>First-time setup</button></div>
        </>
      ) : (
        <form onSubmit={submit} className="form">
          <label className="field"><span>Setup code</span><input type="password" value={f.code || ''} onChange={set('code')} required autoComplete="off" /><small>The code you saved as SETUP_CODE in Supabase</small></label>
          {mode === 'setup' && <label className="field"><span>Your name</span><input value={f.name || ''} onChange={set('name')} required maxLength={60} /></label>}
          <button className="pill primary block" disabled={busy}>{busy ? 'Working…' : mode === 'setup' ? 'Create the list' : 'Sign in'}</button>
          <div className="text-links"><button type="button" onClick={() => go('home')}>Back</button></div>
        </form>
      )}
    </Splash>
  )
}

const TOUR_KEY = 'tour-seen-v1'
const tourSeen = () => { try { return localStorage.getItem(TOUR_KEY) === '1' } catch { return false } }
const markTourSeen = () => { try { localStorage.setItem(TOUR_KEY, '1') } catch { /* private mode */ } }

function Help({ profile, welcome, onDone }: { profile: Profile; welcome: boolean; onDone: () => void }) {
  const showTour = profile.role !== 'child' // the tour shows shopping; kids get the written help only
  return (
    <>
      <section className="hero">
        <div className="hero-row">
          <div className="avatar" aria-hidden="true"><HelpIcon size={28} /></div>
          <div><h1>{welcome ? 'Welcome!' : 'Help'}</h1><p>{welcome ? 'Here is a quick tour before you start shopping.' : 'How to use the wish lists'}</p></div>
        </div>
      </section>
      {showTour && (
        <div className="card tour">
          <h2>Quick tour</h2>
          <video src={asset('tour.mp4')} poster={asset('tour-poster.jpg')} controls playsInline preload="metadata"
            autoPlay={welcome} muted={welcome} aria-label="Video tour: picking a list, opening store folders and links, marking gifts bought, undoing, and adding the app to your home screen" />
          {welcome && <button className="pill primary block" onClick={onDone}>Start shopping</button>}
        </div>
      )}
      <div className="card help">
        <h2>Add to your home screen</h2>
        <p><strong>iPhone (Safari):</strong> tap the Share button, then <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</p>
        <p><strong>Android (Chrome):</strong> tap the menu (three dots), then <strong>Add to Home screen</strong> or <strong>Install app</strong>.</p>
        <p className="muted">Do this right after opening your personal link from the text message, so the shortcut stays signed in.</p>
        {profile.role === 'parent' && <p className="muted">The owner doesn't need a link: if the home-screen app asks you to sign in, tap <strong>Owner sign-in</strong> and enter the setup code.</p>}
      </div>
    </>
  )
}

type Tab = 'lists' | 'people' | 'help'

function Home({ profile }: { profile: Profile }) {
  // Shoppers (gift buyers) see the tour automatically the first time only
  const [welcome, setWelcome] = useState(() => profile.role === 'gift_buyer' && !tourSeen())
  const [tab, setTab] = useState<Tab>(welcome ? 'help' : 'lists')
  useEffect(() => { if (welcome) markTourSeen() }, [])
  useEffect(() => { if (tab !== 'help') setWelcome(false) }, [tab])
  const [navTap, setNavTap] = useState(0) // tapping the current tab again resets it (e.g. back to the lists home)
  // Only parents ask for the people list; the backend decides which parent is the owner
  const owner = useIsOwner(profile.role === 'parent')
  const days = daysToChristmas()
  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'lists', label: profile.role === 'child' ? 'My List' : 'Wish Lists', icon: <List size={24} /> },
    ...(owner.people ? [{ id: 'people' as Tab, label: 'People', icon: <Users size={24} /> }] : []),
    { id: 'help', label: 'Help', icon: <HelpIcon size={24} /> },
  ]
  useEffect(() => { window.scrollTo(0, 0) }, [tab])

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src={asset('icon-192.png')} alt="" width={36} height={36} />
          <div><strong>{TITLE}</strong><span>{profile.display_name} · {ROLE_LABEL[profile.role]}</span></div>
        </div>
        <div className="top-right">
          <div className="calendar" role="img" aria-label={days === 0 ? 'Christmas is today' : `${days} ${days === 1 ? 'day' : 'days'} until Christmas`}>
            <span className="cal-rings" aria-hidden="true"><i /><i /></span>
            <span className="cal-head" aria-hidden="true">{days === 0 ? 'TODAY' : days === 1 ? 'DAY' : 'DAYS'}</span>
            <span className="cal-num" aria-hidden="true">{days === 0 ? 25 : days}</span>
            <span className="cal-foot" aria-hidden="true">{days === 0 ? 'DEC' : 'TO GO'}</span>
          </div>
          <button className="icon-btn" onClick={() => supabase.auth.signOut()} aria-label="Sign out" title="Sign out"><Logout size={18} /></button>
        </div>
      </header>
      <main className="content">
        {tab === 'lists' && (profile.role === 'child' ? <Child key={navTap} me={profile} /> : <Lists key={navTap} me={profile} isOwner={!!owner.people} />)}
        {tab === 'people' && owner.people && <People me={profile} people={owner.people} reload={owner.reload} />}
        {tab === 'help' && <Help profile={profile} welcome={welcome} onDone={() => setTab('lists')} />}
      </main>
      <nav className="bottom-nav" aria-label="Sections">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => { if (t.id === tab) setNavTap((n) => n + 1); setTab(t.id) }}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  const [uid, setUid] = useState<string | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileErr, setProfileErr] = useState(false)
  const [problem, setProblem] = useState('')

  // Personal link: https://site/#k=TOKEN signs this phone in. The link stays in the address bar so a home-screen shortcut made from it can sign in too.
  useEffect(() => {
    if (!configured || !START_TOKEN) return
    admin({ action: 'link_login', token: START_TOKEN }).then(startSession).catch((e) => setProblem(e.message))
  }, [])

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => setUid(data.session?.user.id ?? null))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUid(s?.user.id ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setProfile(null); setProfileErr(false)
    if (!uid) return
    supabase.from('profiles').select('id, family_id, display_name, role').eq('id', uid).maybeSingle()
      .then(({ data, error }) => { if (error || !data) setProfileErr(true); else setProfile(data as Profile) })
  }, [uid])

  if (!configured) return (
    <Splash>
      <p className="error">This site was built without its Supabase settings.</p>
      <p className="lead">In GitHub, add the repository variables <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then run the deploy again.</p>
    </Splash>
  )
  if (uid === undefined) return <Splash><p className="lead">Loading…</p></Splash>
  if (!uid) return <Auth problem={problem} />
  if (profileErr) return (
    <Splash>
      <p className="error">This sign-in isn't connected to anyone on the list.</p>
      <button className="pill soft block" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </Splash>
  )
  if (!profile) return <Splash><p className="lead">Loading your account…</p></Splash>
  return <Home key={profile.id} profile={profile} />
}
