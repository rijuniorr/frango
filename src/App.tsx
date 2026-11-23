import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb, load, hap, gesture, ordered, type Data, type Profile } from './lib'
import Login from './Login'
import Feed from './Feed'
import Hoje from './Hoje'
import CheckIn from './CheckIn'
import Evolucao from './Evolucao'
import Eu from './Eu'
import Install from './Install'

export type Ctx = {
  data: Data // já filtrado pra dupla escolhida
  all: Data // tudo que o banco devolveu (só o check-in usa)
  partners: Profile[] // quem eu enxergo; 2+ = tem seletor
  partner: string | null // username do parceiro da vez
  setPartner: (u: string) => void
  reload: () => Promise<void>
  mutate: (fn: (d: Data) => Data) => void // muda na tela na hora, antes do banco responder
  toast: (msg: string, kind?: 'ok' | 'roast' | 'err') => void
  openCheckin: () => void
  active: boolean // essa aba é a que está na tela
}

const TABS = [
  ['feed', 'Feed', 'M4 11l8-7 8 7v9h-5v-6H9v6H4z'],
  ['hoje', 'Hoje', 'M6 4v16M18 4v16M3 9v6M21 9v6M6 12h12'],
  ['evo', 'Evolução', 'M4 18l5-6 4 3 7-9M20 6v5M20 6h-5'],
  ['eu', 'Perfil', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6'],
] as const
const PAGES = [Feed, Hoje, Evolucao, Eu]

// só {eu, parceiro}: perfis, check-ins (respeitando audience), dias, curtidas e comentários
export function view(data: Data, partnerId: string | null): Data {
  const others = data.profiles.filter(p => p.id !== data.me)
  const pt = others.find(p => p.id === partnerId) ?? others[0]
  if (others.length < 2 || !pt) return data
  const ids = new Set([data.me, pt.id])
  const checkins = data.checkins.filter(c => ids.has(c.user_id) && (c.user_id === pt.id || !c.audience || c.audience.includes(pt.username)))
  const cs = new Set(checkins.map(c => c.id))
  return { ...data, profiles: data.profiles.filter(p => ids.has(p.id)), checkins, days: data.days.filter(d => ids.has(d.user_id)), likes: data.likes.filter(l => cs.has(l.checkin_id)), comments: data.comments.filter(c => cs.has(c.checkin_id)) }
}

type Msg = { text: string; kind: 'ok' | 'roast' | 'err'; id: number }

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [data, setData] = useState<Data | null>(null)
  const [ti, setTi] = useState(0)
  const [cam, setCam] = useState(false)
  const [dupla, setDupla] = useState(() => { try { return localStorage.getItem('frango.dupla') } catch { return null } })
  const [msg, setMsg] = useState<Msg | null>(null)
  const queue = useRef<Msg[]>([])
  const pager = useRef<HTMLDivElement>(null)
  const pages = useRef<(HTMLElement | null)[]>([])
  const touch = useRef<{ x: number; y: number; t: number; axis: '' | 'x' | 'y'; dx: number } | null>(null)

  useEffect(() => {
    if (import.meta.env.DEV && location.search.includes('demo')) {
      import('./demo').then(m => { setSession({ user: { id: 'demo' } } as Session); setData(m.demo(location.search.includes('sara'))) })
      return
    }
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id
  const reload = useCallback(async () => {
    if (!uid || uid === 'demo') return
    try { setData(await load(uid)) } catch { /* sem rede: mantém o que tem */ }
  }, [uid])
  const mutate = useCallback((fn: (d: Data) => Data) => setData(d => (d ? fn(d) : d)), [])

  useEffect(() => {
    if (uid === 'demo') return // demo
    if (!uid) { setData(null); return }
    reload()
    // o que o OUTRO faz aparece na hora; o que eu faço já está na tela (otimista).
    // vários eventos seguidos viram um reload só.
    let t = 0
    const soon = () => { clearTimeout(t); t = window.setTimeout(reload, 700) }
    const ch = sb.channel('tudo')
      .on('postgres_changes', { event: '*', schema: 'public' }, p => {
        const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as { user_id?: string; id?: string }
        if (row?.user_id === uid || (p.table === 'profiles' && row?.id === uid)) return
        soon()
      })
      .subscribe()
    const vis = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', vis)
    const hourly = setInterval(() => document.visibilityState === 'visible' && reload(), 3600e3) // renova links das fotos
    return () => { sb.removeChannel(ch); document.removeEventListener('visibilitychange', vis); clearInterval(hourly); clearTimeout(t) }
  }, [uid, reload])

  // tema rosa só pra Sara
  const meName = data?.profiles.find(p => p.id === data.me)?.username
  useEffect(() => { if (meName === 'sara') document.documentElement.dataset.theme = 'rosa'; else delete document.documentElement.dataset.theme }, [meName])

  // avisos: um xingamento não é atropelado por outro aviso (fila)
  const toast = useCallback((text: string, kind: Msg['kind'] = 'ok') => {
    const m = { text, kind, id: Date.now() + Math.random() }
    if (kind === 'roast') hap([80, 60, 80, 60, 200])
    else if (kind === 'err') hap([30, 40, 30])
    setMsg(cur => {
      if (cur?.kind === 'roast' && kind !== 'roast') { queue.current.push(m); return cur }
      return m
    })
  }, [])
  useEffect(() => {
    if (!msg) { const n = queue.current.shift(); if (n) setMsg(n); return }
    const t = setTimeout(() => setMsg(null), msg.kind === 'roast' ? 6000 : msg.kind === 'err' ? 4000 : 2600)
    return () => clearTimeout(t)
  }, [msg])

  // ---- trilho de abas: as 4 ficam montadas lado a lado; o dedo arrasta o trilho 1:1
  const setX = (px: number, anim: boolean) => {
    const el = pager.current
    if (!el) return
    el.style.setProperty('--dx', px + 'px')
    el.classList.toggle('dragging', !anim)
  }
  const go = (i: number) => {
    if (i === ti) { pages.current[i]?.scrollTo({ top: 0, behavior: 'smooth' }); return } // tocar na aba aberta = volta pro topo
    setX(0, true); setTi(i); hap(8)
  }

  function onTouchStart(e: React.TouchEvent) {
    // toque que veio de um portal (sheet, editor) não é deslizar de aba
    if (!e.currentTarget.contains(e.target as Node) || e.touches.length > 1) { touch.current = null; return }
    const el = e.target as Element
    if (el.closest('input, textarea, .ruler, .cmp.drag')) { touch.current = null; return }
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), axis: '', dx: 0 }
  }
  function onTouchMove(e: React.TouchEvent) {
    const s = touch.current
    if (!s) return
    if (e.touches.length > 1 || gesture.lock) { // pinça ou um componente pegou o dedo: cancela
      if (s.axis === 'x') setX(0, true)
      touch.current = null; return
    }
    const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y
    if (!s.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      s.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y' // decide uma vez; vertical = rolagem normal
    }
    if (s.axis !== 'x') return
    const edge = (dx > 0 && ti === 0) || (dx < 0 && ti === TABS.length - 1)
    s.dx = edge ? dx * 0.25 : dx
    setX(s.dx, false)
  }
  function onTouchEnd() {
    const s = touch.current
    touch.current = null
    if (!s || s.axis !== 'x') return
    const w = pager.current?.clientWidth ?? 360
    const v = s.dx / Math.max(1, Date.now() - s.t) // px/ms
    const next = ti + (s.dx < 0 ? 1 : -1)
    if ((Math.abs(s.dx) > w * 0.28 || Math.abs(v) > 0.45) && next >= 0 && next < TABS.length) go(next)
    else { setX(0, true); if (next < 0 || next >= TABS.length) hap(4) }
  }

  if (session === undefined) return <div className="splash"><img src="./logo.png" alt="" className="splash-logo" /></div>
  if (!session) return <><Login /><Install /></>
  if (!data) return <div className="splash"><img src="./logo.png" alt="" className="splash-logo pulse" /></div>

  const partners = ordered(data).filter(p => p.id !== data.me)
  const pt = partners.find(p => p.username === dupla) ?? partners[0]
  const setPartner = (u: string) => { setDupla(u); hap(8); try { localStorage.setItem('frango.dupla', u) } catch { /* sem storage: vale só nessa sessão */ } }
  const base = { data: view(data, pt?.id ?? null), all: data, partners, partner: pt?.username ?? null, setPartner, reload, mutate, toast, openCheckin: () => { setCam(true); hap(10) } }

  return (
    <>
      <div className="pager" ref={pager} style={{ '--a': ti } as React.CSSProperties}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        {PAGES.map((Page, i) => (
          <main key={i} className="screen" ref={el => { pages.current[i] = el }} style={{ '--i': i } as React.CSSProperties} inert={i !== ti} aria-hidden={i !== ti}>
            <Page {...base} active={i === ti} />
          </main>
        ))}
      </div>
      <i className="topfade" aria-hidden="true" />
      <i className="botfade" aria-hidden="true" />

      <nav className="dock">
        <div className="tabs glass" style={{ '--i': ti } as React.CSSProperties}>
          <i className="lens" />
          {TABS.map(([k, l, d], i) => (
            <button key={k} className={i === ti ? 'on' : ''} onClick={() => go(i)} aria-label={l}>
              <svg viewBox="0 0 24 24"><path d={d} /></svg>
              <span>{l}</span>
            </button>
          ))}
        </div>
        <button className="fab" onClick={base.openCheckin} aria-label="Check-in">
          <svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
        </button>
      </nav>

      {cam && <CheckIn {...base} active close={() => setCam(false)} />}
      <Install />

      {msg && (
        <div className={'island ' + msg.kind} key={msg.id} onClick={() => setMsg(null)} role="status">
          {msg.kind === 'roast' && <b>ESTOUROU O LIMITE</b>}
          <span>{msg.text}</span>
        </div>
      )}
    </>
  )
}
