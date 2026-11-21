import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { hap } from './lib'

// antes/depois arrastável
export function Compare({ before, after, a = 'antes', b = 'agora' }: { before?: string; after?: string; a?: string; b?: string }) {
  const [x, setX] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const last = useRef(50)
  function move(e: React.PointerEvent) {
    const r = box.current!.getBoundingClientRect()
    const v = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))
    if (Math.abs(v - last.current) > 8) { hap(4); last.current = v }
    setX(v)
  }
  if (!before || !after) return <div className="cmp empty">{after || before ? <img src={after || before} alt="" /> : <span>sem foto</span>}</div>
  return (
    <div className="cmp" ref={box} onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); move(e) }} onPointerMove={e => e.buttons && move(e)}>
      <img src={after} alt="" draggable={false} />
      <img src={before} alt="" draggable={false} style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }} />
      <i className="bar" style={{ left: `${x}%` }}><b /></i>
      <span className="lb l">{a}</span><span className="lb r">{b}</span>
    </div>
  )
}

// controle segmentado com lente que escorrega
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

// régua de peso: arrasta e vibra a cada 0,1 kg
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

// segurar pra confirmar
export function Hold({ label, onDone, busy }: { label: string; onDone: () => void; busy?: boolean }) {
  const [p, setP] = useState(0)
  const raf = useRef(0)
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
  return (
    <button className="hold" onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} onContextMenu={e => e.preventDefault()}>
      <i style={{ transform: `scaleX(${busy ? 1 : p})` }} />
      <span>{busy ? 'postando…' : p > 0 ? 'segura…' : label}</span>
    </button>
  )
}

export function Avatar({ name, me }: { name: string; me?: boolean }) {
  return <span className={'av' + (me ? ' me' : '')}>{name[0]}</span>
}
