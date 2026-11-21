import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { hap, gesture } from './lib'

// ---- botão "voltar" do Android/gesto do iPhone fecha o que está aberto (sheet, editor, check-in) em vez de sair do app
// Nunca chama history.back() sozinho (isso pode tirar a pessoa do app). Fechou pelo botão do app →
// a entrada vira "sobra" e é reaproveitada pelo próximo painel que abrir.
const stack: { close: () => void }[] = []
addEventListener('popstate', () => { stack.at(-1)?.close() })
export function useBack(onClose: () => void) {
  const cb = useRef(onClose)
  useLayoutEffect(() => { cb.current = onClose })
  useEffect(() => {
    const entry = { close: () => { const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1); cb.current() } }
    stack.push(entry)
    if ((history.state as { frango?: string } | null)?.frango === 'sobra') history.replaceState({ frango: 'aberto' }, '')
    else history.pushState({ frango: 'aberto' }, '')
    return () => {
      const i = stack.indexOf(entry)
      if (i >= 0) { stack.splice(i, 1); history.replaceState({ frango: 'sobra' }, '') } // fechou pelo app, não pelo voltar
    }
  }, [])
}

// ---- antes/depois: só arrasta pela alça (±30px da linha). Fora dela o dedo rola a página ou troca de aba.
export function Compare({ before, after, a = 'antes', b = 'agora' }: { before?: string; after?: string; a?: string; b?: string }) {
  const [x, setX] = useState(50)
  const [drag, setDrag] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const last = useRef(50)
  const pos = (cx: number) => { const r = box.current!.getBoundingClientRect(); return Math.max(0, Math.min(100, ((cx - r.left) / r.width) * 100)) }
  function down(e: React.PointerEvent) {
    const r = box.current!.getBoundingClientRect()
    if (Math.abs(e.clientX - (r.left + (r.width * x) / 100)) > 30) return // longe da alça: não é comigo
    e.currentTarget.setPointerCapture?.(e.pointerId)
    gesture.lock = true
    setDrag(true); hap(6)
  }
  function move(e: React.PointerEvent) {
    if (!drag) return
    const v = pos(e.clientX)
    if (Math.abs(v - last.current) > 8) { hap(3); last.current = v }
    setX(v)
  }
  function up() { if (drag) { setDrag(false); gesture.lock = false } }
  if (!before || !after) return <div className="cmp empty">{after || before ? <img src={after || before} alt="" /> : <span>sem foto</span>}</div>
  return (
    <div className={'cmp' + (drag ? ' drag' : '')} ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <img src={after} alt="" draggable={false} />
      <img src={before} alt="" draggable={false} style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }} />
      <i className="bar" style={{ left: `${x}%` }}><b /></i>
      <span className="lb l">{a}</span><span className="lb r">{b}</span>
    </div>
  )
}

// ---- controle segmentado com lente que escorrega
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const i = options.findIndex(o => o[0] === value)
  return (
    <div className="seg" style={{ '--n': options.length, '--i': i } as React.CSSProperties}>
      <i className="lens" />
      {options.map(([v, l]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => { onChange(v); hap(8) }}>{l}</button>
      ))}
    </div>
  )
}

// ---- régua de peso: arrasta e vibra a cada 0,1 kg
const MIN = 40, MAX = 160, PX = 10
export function Ruler({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const last = useRef(value)
  useLayoutEffect(() => { el.current!.scrollLeft = (value - MIN) * 10 * PX }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="ruler">
      <div className="ruler-val"><b>{value.toFixed(1).replace('.', ',')}</b> kg</div>
      <div className="ruler-track" ref={el} onScroll={e => {
        const v = Math.round(MIN * 10 + e.currentTarget.scrollLeft / PX) / 10
        const c = Math.max(MIN, Math.min(MAX, v))
        if (c !== last.current) { last.current = c; hap(c % 1 === 0 ? 14 : 3); onChange(c) }
      }}>
        <div className="ruler-ticks" style={{ width: (MAX - MIN) * 10 * PX }}>
          {Array.from({ length: MAX - MIN + 1 }, (_, i) => <span key={i} style={{ left: i * 10 * PX }}>{MIN + i}</span>)}
        </div>
      </div>
      <i className="ruler-needle" />
    </div>
  )
}

// ---- segurar pra confirmar (texto em 2 camadas: branco por baixo, escuro por cima recortado no progresso)
export function Hold({ label, onDone, busy }: { label: string; onDone: () => void; busy?: boolean }) {
  const [p, setP] = useState(0)
  const raf = useRef(0)
  useEffect(() => { if (!busy) setP(0) }, [busy]) // deu erro / terminou: destrava
  function down() {
    if (busy) return
    const t0 = performance.now()
    hap(8)
    const tick = (t: number) => {
      const v = Math.min(1, (t - t0) / 900)
      setP(v)
      if (v < 1) raf.current = requestAnimationFrame(tick)
      else { hap([20, 40, 60]); onDone() }
    }
    raf.current = requestAnimationFrame(tick)
  }
  function up() { cancelAnimationFrame(raf.current); if (p < 1) setP(0) }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  const shown = busy ? 1 : p
  const txt = busy ? 'postando…' : p > 0 ? 'segura…' : label
  return (
    <button className="hold" onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} onContextMenu={e => e.preventDefault()}>
      <i style={{ transform: `scaleX(${shown})` }} />
      <span>{txt}</span>
      <span className="ink" aria-hidden="true" style={{ clipPath: `inset(0 ${100 - shown * 100}% 0 0)` }}>{txt}</span>
    </button>
  )
}

export function Avatar({ name, mine, src, size = 28 }: { name: string; mine?: boolean; src?: string; size?: number }) {
  return (
    <span className={'av' + (mine ? ' mine' : '')} style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {src ? <img src={src} alt="" /> : name[0]}
    </span>
  )
}

// ---- sheet de baixo: arrasta pela alça pra fechar; o conteúdo rola normalmente
export function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [y, setY] = useState(0)
  const start = useRef<number | null>(null)
  const downOnBg = useRef(false) // só fecha se o toque começou no fundo (evita o "clique fantasma" do toque que abriu)
  useBack(onClose)
  return createPortal(
    <div className="sheet-bg" onPointerDown={e => { downOnBg.current = e.target === e.currentTarget }} onClick={e => { if (downOnBg.current && e.target === e.currentTarget) onClose() }}>
      <div className="sheet-card" onClick={e => e.stopPropagation()} style={{ transform: y ? `translateY(${y}px)` : undefined, transition: start.current == null ? undefined : 'none' }}>
        <i className="grab"
          onPointerDown={e => { start.current = e.clientY; e.currentTarget.setPointerCapture?.(e.pointerId) }}
          onPointerMove={e => { if (start.current != null) setY(Math.max(0, e.clientY - start.current)) }}
          onPointerUp={() => { if (start.current == null) return; start.current = null; if (y > 90) { hap(8); onClose() } setY(0) }} />
        {children}
      </div>
    </div>,
    document.body,
  )
}

// ---- pergunta de confirmação
export function Confirm({ title, text, yes, onYes, onClose }: { title: string; text: string; yes: string; onYes: () => void; onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <div className="confirm">
        <h3 className="sheet-h">{title}</h3>
        <p className="hint">{text}</p>
        <button className="btn big danger" onClick={() => { hap(12); onYes() }}>{yes}</button>
        <button className="later" onClick={onClose}>cancelar</button>
      </div>
    </Sheet>
  )
}
