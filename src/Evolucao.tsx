import { useEffect, useMemo, useState } from 'react'
import type { Ctx } from './App'
import { hap, fmtKg, fmtDate, ANGLES, type Angle, type Data, type Profile } from './lib'
import { Compare, Seg } from './ui'

// abas pelos nomes: Ricardo | Gabriel | Lado a lado
const NAMES: [string, string][] = [['ricardo', 'Ricardo'], ['gabriel', 'Gabriel']]

export default function Evolucao({ data }: Ctx) {
  const mine = data.profiles.find(p => p.id === data.me)?.username ?? 'ricardo'
  const [view, setView] = useState<string>(mine)
  const [angle, setAngle] = useState<Angle>('frente')
  const who = data.profiles.find(p => p.username === view)

  return (
    <>
      <header className="bar">
        <span className="logo">evolução<i>.</i></span>
      </header>
      <Seg value={view} onChange={setView} options={[...NAMES.map(([u, n]) => [u, data.profiles.find(p => p.username === u)?.name ?? n] as [string, string]), ['dupla', 'Lado a lado']]} />

      <div className="chips">
        {ANGLES.map(a => <button key={a} className={a === angle ? 'on' : ''} onClick={() => { setAngle(a); hap(6) }}>{a}</button>)}
      </div>

      {view === 'dupla' ? <Dupla data={data} angle={angle} /> : who ? <Solo data={data} p={who} angle={angle} /> : <p className="empty-txt">Ele ainda não entrou no app.</p>}
    </>
  )
}

function series(data: Data, uid: string) {
  return data.checkins.filter(c => c.user_id === uid && c.weight != null).map(c => ({ week: c.week, w: c.weight! }))
}

function Solo({ data, p, angle }: { data: Data; p: Profile; angle: Angle }) {
  const mine = data.checkins.filter(c => c.user_id === p.id)
  const withPhoto = mine.filter(c => c.photos[angle])
  const s = series(data, p.id)
  const first = s[0]?.w, last = s.at(-1)?.w ?? p.weight_kg ?? undefined
  const days = data.days.filter(d => d.user_id === p.id)
  const url = (x?: string) => (x ? data.urls[x] : undefined)

  return (
    <>
      <h2 className="h">Antes × agora</h2>
      <Compare before={withPhoto.length > 1 ? url(withPhoto[0].photos[angle]) : undefined} after={url(withPhoto.at(-1)?.photos[angle])}
        a={withPhoto[0] ? fmtDate(withPhoto[0].week) : 'antes'} b={withPhoto.at(-1) ? fmtDate(withPhoto.at(-1)!.week) : 'agora'} />

      {withPhoto.length > 1 && <Replay frames={withPhoto.map(c => ({ src: url(c.photos[angle])!, label: fmtDate(c.week) }))} />}

      <h2 className="h">Peso</h2>
      <Chart lines={[{ pts: s, cls: 'a' }]} />

      <div className="grid">
        <Stat label="Início" v={fmtKg(first)} u="kg" />
        <Stat label="Agora" v={fmtKg(last)} u="kg" />
        <Stat label="Total" v={first != null && last != null ? `${last - first > 0 ? '+' : ''}${fmtKg(last - first)}` : '—'} u="kg" hl />
        <Stat label="Falta" v={p.goal_kg != null && last != null ? fmtKg(Math.abs(last - p.goal_kg)) : '—'} u="kg" />
        <Stat label="Check-ins" v={String(mine.length)} />
        <Stat label="Treinos" v={String(days.filter(d => d.trained).length)} />
        <Stat label="Furos" v={String(days.filter(d => d.trained === false).length)} />
        <Stat label="Besteiras" v={String(days.reduce((a, d) => a + d.junk, 0))} />
      </div>
    </>
  )
}

function Dupla({ data, angle }: { data: Data; angle: Angle }) {
  const ps = [...data.profiles].sort((a, b) => a.username.localeCompare(b.username)).reverse()
  return (
    <>
      <h2 className="h">Mais recente</h2>
      <div className="side">
        {ps.map(p => {
          const c = [...data.checkins].reverse().find(x => x.user_id === p.id && x.photos[angle])
          const u = c ? data.urls[c.photos[angle]!] : undefined
          return (
            <figure key={p.id} className="card">
              {u ? <img src={u} alt="" /> : <div className="nophoto">sem foto</div>}
              <figcaption><b>{p.name}</b>{c && <span>{fmtDate(c.week)}</span>}</figcaption>
            </figure>
          )
        })}
      </div>

      <h2 className="h">Peso dos dois</h2>
      <Chart lines={ps.map((p, i) => ({ pts: series(data, p.id), cls: i ? 'b' : 'a' }))} legend={ps.map(p => p.name)} />

      <h2 className="h">Placar</h2>
      <div className="card table">
        <div className="tr th"><span /> {ps.map(p => <b key={p.id}>{p.name}</b>)}</div>
        {([
          ['Perdeu', (id: string) => { const s = series(data, id); return s.length > 1 ? s[0].w - s.at(-1)!.w : null }, (v: number | null) => (v == null ? '—' : `${fmtKg(v)} kg`)],
          ['Treinos', (id: string) => data.days.filter(d => d.user_id === id && d.trained).length, (v: number) => String(v)],
          ['Furos', (id: string) => -data.days.filter(d => d.user_id === id && d.trained === false).length, (v: number) => String(-v)],
          ['Besteiras', (id: string) => -data.days.filter(d => d.user_id === id).reduce((a, d) => a + d.junk, 0), (v: number) => String(-v)],
          ['Check-ins', (id: string) => data.checkins.filter(c => c.user_id === id).length, (v: number) => String(v)],
        ] as [string, (id: string) => number | null, (v: number | null) => string][]).map(([label, f, show]) => {
          const vals = ps.map(p => f(p.id))
          const best = Math.max(...vals.map(v => v ?? -Infinity))
          return (
            <div className="tr" key={label}>
              <span>{label}</span>
              {vals.map((v, i) => <b key={i} className={v != null && v === best && vals.filter(x => x === best).length === 1 ? 'win' : ''}>{show(v)}</b>)}
            </div>
          )
        })}
      </div>
    </>
  )
}

function Stat({ label, v, u, hl }: { label: string; v: string; u?: string; hl?: boolean }) {
  return <div className={'card stat' + (hl ? ' hl' : '')}><span>{label}</span><b>{v}{u && v !== '—' && <small> {u}</small>}</b></div>
}

// gráfico com dedo deslizando
function Chart({ lines, legend }: { lines: { pts: { week: string; w: number }[]; cls: string }[]; legend?: string[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const weeks = useMemo(() => [...new Set(lines.flatMap(l => l.pts.map(p => p.week)))].sort(), [lines])
  const all = lines.flatMap(l => l.pts.map(p => p.w))
  if (all.length === 0) return <div className="card chart empty-txt">Sem pesos ainda. Faz o check-in.</div>
  const W = 320, H = 150, pad = 14
  const lo = Math.min(...all) - 0.5, hi = Math.max(...all) + 0.5
  const x = (wk: string) => (weeks.length < 2 ? W / 2 : pad + (weeks.indexOf(wk) / (weeks.length - 1)) * (W - 2 * pad))
  const y = (w: number) => pad + (1 - (w - lo) / (hi - lo)) * (H - 2 * pad)
  const hw = hover != null ? weeks[hover] : null

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round((((e.clientX - r.left) / r.width) * W - pad) / ((W - 2 * pad) / Math.max(1, weeks.length - 1)))
    const c = Math.max(0, Math.min(weeks.length - 1, i))
    if (c !== hover) { hap(4); setHover(c) }
  }

  return (
    <div className="card chart">
      <div className="chart-head">
        {hw ? (
          <><span>{fmtDate(hw)}</span>{lines.map((l, i) => { const p = l.pts.find(p => p.week === hw); return <b key={i} className={l.cls}>{fmtKg(p?.w)} kg</b> })}</>
        ) : legend ? legend.map((n, i) => <b key={i} className={lines[i].cls}>● {n}</b>) : <span>arrasta o dedo no gráfico</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)}>
        {lines.map((l, i) => (
          <g key={i} className={'ln ' + l.cls}>
            <path d={l.pts.map((p, j) => `${j ? 'L' : 'M'}${x(p.week)} ${y(p.w)}`).join('')} />
            {l.pts.map(p => <circle key={p.week} cx={x(p.week)} cy={y(p.w)} r={p.week === hw ? 5 : 2.5} />)}
          </g>
        ))}
        {hw && <line x1={x(hw)} x2={x(hw)} y1={0} y2={H} className="cursor" />}
      </svg>
    </div>
  )
}

// timelapse simples: passa as fotos em sequência
function Replay({ frames }: { frames: { src: string; label: string }[] }) {
  const [i, setI] = useState(frames.length - 1)
  const [play, setPlay] = useState(false)
  const [speed, setSpeed] = useState(1)
  useEffect(() => {
    if (!play) return
    const t = setInterval(() => setI(v => { const n = (v + 1) % frames.length; hap(3); return n }), 600 / speed)
    return () => clearInterval(t)
  }, [play, speed, frames.length])
  return (
    <>
      <h2 className="h">Replay</h2>
      <div className="card replay">
        <div className="replay-img">
          {frames.map((f, k) => <img key={k} src={f.src} alt="" style={{ opacity: k === i ? 1 : 0 }} />)}
          <span className="pill">{frames[i].label}</span>
        </div>
        <div className="replay-ctl">
          <button className="play" onClick={() => { setPlay(p => !p); hap(10) }} aria-label={play ? 'Pausar' : 'Tocar'}>
            <svg viewBox="0 0 24 24">{play ? <path d="M7 5h3v14H7zM14 5h3v14h-3z" /> : <path d="M7 4.5v15l13-7.5z" />}</svg>
          </button>
          <input type="range" className="fade" min={0} max={frames.length - 1} value={i} onChange={e => { setI(+e.target.value); setPlay(false); hap(4) }} aria-label="Semana" />
          <button className="ib" onClick={() => { setSpeed(s => (s === 4 ? 1 : s * 2)); hap(6) }}>{speed}×</button>
        </div>
      </div>
    </>
  )
}
