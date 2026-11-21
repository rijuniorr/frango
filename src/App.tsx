import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb, load, hap, type Data } from './lib'
import Login from './Login'
import Feed from './Feed'
import Hoje from './Hoje'
import CheckIn from './CheckIn'
import Evolucao from './Evolucao'
import Eu from './Eu'

export type Ctx = {
  data: Data
  reload: () => Promise<void>
  toast: (msg: string, kind?: 'ok' | 'roast') => void
  openCheckin: () => void
}

const TABS = [
  ['feed', 'Feed', 'M4 11l8-7 8 7v9h-5v-6H9v6H4z'],
  ['hoje', 'Hoje', 'M6 4v16M18 4v16M3 9v6M21 9v6M6 12h12'],
  ['evo', 'Evolução', 'M4 18l5-6 4 3 7-9M20 6v5M20 6h-5'],
  ['eu', 'Eu', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6'],
] as const
type Tab = (typeof TABS)[number][0]

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [data, setData] = useState<Data | null>(null)
  const [tab, setTab] = useState<Tab>('feed')
  const [cam, setCam] = useState(false)
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'roast'; id: number } | null>(null)

  useEffect(() => {
    if (import.meta.env.DEV && location.search.includes('demo')) {
      import('./demo').then(m => { setSession({ user: { id: 'r' } } as Session); setData(m.demo()) })
      return
    }
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id
  const reload = useCallback(async () => { if (uid && uid !== 'r') setData(await load(uid)) }, [uid])

  useEffect(() => {
    if (uid === 'r') return // demo
    if (!uid) { setData(null); return }
    reload()
    // o que o outro posta aparece na hora
    const ch = sb.channel('tudo')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => reload())
      .subscribe()
    const vis = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', vis)
    return () => { sb.removeChannel(ch); document.removeEventListener('visibilitychange', vis) }
  }, [uid, reload])

  const toast = useCallback((text: string, kind: 'ok' | 'roast' = 'ok') => {
    setMsg({ text, kind, id: Date.now() })
    if (kind === 'roast') hap([80, 60, 80, 60, 200])
  }, [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), msg.kind === 'roast' ? 6000 : 2600)
    return () => clearTimeout(t)
  }, [msg])

  if (session === undefined) return <div className="splash"><span className="logo big">frango<i>.</i></span></div>
  if (!session) return <Login />
  if (!data) return <div className="splash"><span className="logo big pulse">frango<i>.</i></span></div>

  const ctx: Ctx = { data, reload, toast, openCheckin: () => { setCam(true); hap(10) } }
  const ti = TABS.findIndex(t => t[0] === tab)

  return (
    <>
      <main className="screen" key={tab}>
        {tab === 'feed' && <Feed {...ctx} />}
        {tab === 'hoje' && <Hoje {...ctx} />}
        {tab === 'evo' && <Evolucao {...ctx} />}
        {tab === 'eu' && <Eu {...ctx} />}
      </main>

      <nav className="dock">
        <div className="tabs glass" style={{ '--i': ti } as React.CSSProperties}>
          <i className="lens" />
          {TABS.map(([k, l, d]) => (
            <button key={k} className={k === tab ? 'on' : ''} onClick={() => { setTab(k); hap(8); scrollTo(0, 0) }} aria-label={l}>
              <svg viewBox="0 0 24 24"><path d={d} /></svg>
              <span>{l}</span>
            </button>
          ))}
        </div>
        <button className="fab" onClick={ctx.openCheckin} aria-label="Check-in">
          <svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
        </button>
      </nav>

      {cam && <CheckIn {...ctx} close={() => setCam(false)} />}

      {msg && (
        <div className={'island ' + msg.kind} key={msg.id} onClick={() => setMsg(null)}>
          {msg.kind === 'roast' && <b>ESTOUROU O LIMITE</b>}
          <span>{msg.text}</span>
        </div>
      )}
    </>
  )
}
