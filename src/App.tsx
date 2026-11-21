import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb, load, hap, type Data } from './lib'
import Login from './Login'
import Feed from './Feed'
import Hoje from './Hoje'
import CheckIn from './CheckIn'
import Evolucao from './Evolucao'
import Eu from './Eu'
import Install from './Install'

export type Ctx = {
  data: Data
  reload: () => Promise<void>
  mutate: (fn: (d: Data) => Data) => void // muda na tela na hora, antes do banco responder
  toast: (msg: string, kind?: 'ok' | 'roast') => void
  openCheckin: () => void
}

const TABS = [
  ['feed', 'Feed', 'M4 11l8-7 8 7v9h-5v-6H9v6H4z'],
  ['hoje', 'Hoje', 'M6 4v16M18 4v16M3 9v6M21 9v6M6 12h12'],
  ['evo', 'Evolução', 'M4 18l5-6 4 3 7-9M20 6v5M20 6h-5'],
  ['eu', 'Perfil', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6'],
] as const
type Tab = (typeof TABS)[number][0]

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [data, setData] = useState<Data | null>(null)
  const [tab, setTab] = useState<Tab>('feed')
  const [dir, setDir] = useState(0) // -1 veio da esquerda, 1 da direita
  const [cam, setCam] = useState(false)
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'roast'; id: number } | null>(null)
  const touch = useRef<{ x: number; y: number; t: number; axis: '' | 'x' | 'y' } | null>(null)
  const mainEl = useRef<HTMLElement>(null)

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
  const mutate = useCallback((fn: (d: Data) => Data) => setData(d => (d ? fn(d) : d)), [])

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

  const go = (k: Tab) => {
    const a = TABS.findIndex(t => t[0] === tab), b = TABS.findIndex(t => t[0] === k)
    if (a === b) return
    setDir(b > a ? 1 : -1); setTab(k); hap(8); scrollTo(0, 0)
  }

  // deslizar o dedo pro lado troca de aba: a tela segue o dedo e volta com mola se não passar do ponto.
  // a página em si nunca rola na horizontal (CSS: overflow-x clip + touch-action pan-y)
  function onTouchStart(e: React.TouchEvent) {
    const el = e.target as Element
    if (e.touches.length > 1 || el.closest('.cmp, .chart svg, input, textarea, .days, .seg, .replay, .ruler')) { touch.current = null; return }
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), axis: '' }
  }
  function onTouchMove(e: React.TouchEvent) {
    const s = touch.current, m = mainEl.current
    if (!s || !m) return
    const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y
    if (!s.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      s.axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y' // decide uma vez; vertical = rolagem normal
    }
    if (s.axis !== 'x') return
    const i = TABS.findIndex(t => t[0] === tab)
    const edge = (dx > 0 && i === 0) || (dx < 0 && i === TABS.length - 1)
    m.classList.add('dragging'); m.classList.remove('snap')
    m.style.transform = `translateX(${dx * (edge ? 0.15 : 0.45)}px)`
    m.style.opacity = String(1 - Math.min(0.35, Math.abs(dx) / 900))
  }
  function onTouchEnd(e: React.TouchEvent) {
    const s = touch.current, m = mainEl.current
    touch.current = null
    if (!s || s.axis !== 'x' || !m) return
    const dx = e.changedTouches[0].clientX - s.x
    const fast = Math.abs(dx) / Math.max(1, Date.now() - s.t) > 0.5
    const i = TABS.findIndex(t => t[0] === tab) + (dx < 0 ? 1 : -1)
    m.classList.remove('dragging')
    if ((Math.abs(dx) > 70 || (fast && Math.abs(dx) > 30)) && i >= 0 && i < TABS.length) {
      m.style.transform = ''; m.style.opacity = ''
      go(TABS[i][0])
    } else {
      m.classList.add('snap') // volta pro lugar
      m.style.transform = ''; m.style.opacity = ''
      if (i < 0 || i >= TABS.length) hap(4)
    }
  }

  if (session === undefined) return <div className="splash"><span className="logo big">frango<i>.</i></span></div>
  if (!session) return <><Login /><Install /></>
  if (!data) return <div className="splash"><span className="logo big pulse">frango<i>.</i></span></div>

  const ctx: Ctx = { data, reload, mutate, toast, openCheckin: () => { setCam(true); hap(10) } }
  const ti = TABS.findIndex(t => t[0] === tab)

  return (
    <>
      <main className={'screen' + (dir > 0 ? ' from-r' : dir < 0 ? ' from-l' : '')} key={tab} ref={mainEl} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        {tab === 'feed' && <Feed {...ctx} />}
        {tab === 'hoje' && <Hoje {...ctx} />}
        {tab === 'evo' && <Evolucao {...ctx} />}
        {tab === 'eu' && <Eu {...ctx} />}
      </main>

      <nav className="dock">
        <div className="tabs glass" style={{ '--i': ti } as React.CSSProperties}>
          <i className="lens" />
          {TABS.map(([k, l, d]) => (
            <button key={k} className={k === tab ? 'on' : ''} onClick={() => go(k)} aria-label={l}>
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
      <Install />

      {msg && (
        <div className={'island ' + msg.kind} key={msg.id} onClick={() => setMsg(null)}>
          {msg.kind === 'roast' && <b>ESTOUROU O LIMITE</b>}
          <span>{msg.text}</span>
        </div>
      )}
    </>
  )
}
