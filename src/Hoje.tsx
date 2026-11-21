import { useState } from 'react'
import type { Ctx } from './App'
import { sb, hap, today, weekDays, weekStats, roast, KINDS, kindLabel, type Day } from './lib'
import { Sheet } from './ui'

const DOW = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

export default function Hoje({ data, reload, mutate, toast }: Ctx) {
  const [day, setDay] = useState(today())
  const [pick, setPick] = useState<string[] | null>(null) // sheet de categorias aberto
  const wd = weekDays()
  const s = weekStats(data, data.me)
  const cur: Day | undefined = data.days.find(d => d.user_id === data.me && d.day === day)
  const other = data.profiles.find(p => p.id !== data.me)
  const os = other ? weekStats(data, other.id) : null
  const otherToday = other ? data.days.find(d => d.user_id === other.id && d.day === today()) : undefined
  const { max_skips, max_junk } = data.settings

  async function save(patch: Partial<Day>) {
    const next: Day = { user_id: data.me, day, trained: cur?.trained ?? null, junk: cur?.junk ?? 0, kinds: cur?.kinds ?? [], ...patch }
    // tela muda na hora; o banco vem depois
    mutate(d => ({ ...d, days: [...d.days.filter(x => !(x.user_id === data.me && x.day === day)), next] }))
    const skips = s.skips - (cur?.trained === false ? 1 : 0) + (next.trained === false ? 1 : 0)
    const junk = s.junk - (cur?.junk ?? 0) + next.junk
    if (wd.includes(day) && patch.trained === false && skips > max_skips) toast(roast('skip'), 'roast')
    else if (wd.includes(day) && patch.junk != null && patch.junk > (cur?.junk ?? 0) && junk > max_junk) toast(roast('junk'), 'roast')
    else if (patch.trained === true) toast('Boa, frango. Menos frango a cada dia.')
    const { error } = await sb.from('days').upsert({ ...next, updated_at: new Date().toISOString() })
    if (error) { toast('Não salvou: ' + error.message); reload() }
  }

  const label = day === today() ? 'Hoje' : DOW[wd.indexOf(day)] ?? day

  return (
    <>
      <header className="bar">
        <span className="logo">frango<i>.</i></span>
        <span className="pill">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
      </header>

      <div className="days">
        {wd.map((d, i) => {
          const x = data.days.find(y => y.user_id === data.me && y.day === d)
          const fut = d > today()
          return (
            <button key={d} disabled={fut} className={(d === day ? 'sel ' : '') + (x?.trained ? 'on' : x?.trained === false ? 'off' : '')} onClick={() => { setDay(d); hap(6) }}>
              <span>{DOW[i]}</span><b>{+d.slice(8)}</b>{x && x.junk > 0 && <em>{x.junk}</em>}
            </button>
          )
        })}
      </div>

      <h2 className="h">{label} você treinou?</h2>
      <div className="yesno">
        <button className={'card big-q yes' + (cur?.trained === true ? ' on' : '')} onClick={() => { hap(10); setPick(cur?.trained ? cur.kinds ?? [] : []) }}>
          <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          <b>Treinei</b>
          {cur?.trained && cur.kinds && cur.kinds.length > 0 && <small>{cur.kinds.map(k => kindLabel(k).split(' ')[0]).join(' ')}</small>}
        </button>
        <button className={'card big-q no' + (cur?.trained === false ? ' on' : '')} onClick={() => { hap(10); save({ trained: cur?.trained === false ? null : false, kinds: [] }) }}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          <b>Furei</b>
        </button>
      </div>

      <h2 className="h">Besteiras {label === 'Hoje' ? 'de hoje' : `de ${label}`}</h2>
      <div className="card junk">
        <button onClick={() => { if ((cur?.junk ?? 0) > 0) { hap(8); save({ junk: (cur?.junk ?? 0) - 1 }) } }} aria-label="Menos">−</button>
        <div><b key={cur?.junk ?? 0}>{cur?.junk ?? 0}</b><span>bolacha, fritura, doce… seja honesto</span></div>
        <button className="plus" onClick={() => { hap(14); save({ junk: (cur?.junk ?? 0) + 1 }) }} aria-label="Mais">+</button>
      </div>

      <h2 className="h">Limites da semana</h2>
      <div className="limits">
        <Meter label="Furos" v={s.skips} max={max_skips} />
        <Meter label="Besteiras" v={s.junk} max={max_junk} />
      </div>

      {other && os && (
        <div className="card spy">
          <b>{other.name}</b>
          <span>
            hoje: {otherToday?.trained ? `treinou ✓ ${(otherToday.kinds ?? []).map(k => kindLabel(k).split(' ')[0]).join(' ')}` : otherToday?.trained === false ? 'furou ✗' : 'ainda não marcou'}
            {' · '}semana: {os.trained} treinos, {os.junk} besteiras
          </span>
        </div>
      )}

      {pick && (
        <Sheet onClose={() => setPick(null)}>
          <h3 className="sheet-h">O que você treinou?</h3>
          <div className="kinds">
            {KINDS.map(([k, l]) => {
              const on = pick.includes(k)
              return (
                <button key={k} className={on ? 'on' : ''} onClick={() => { hap(on ? 6 : 12); setPick(on ? pick.filter(x => x !== k) : [...pick, k]) }}>
                  <span>{l.split(' ')[0]}</span>{l.split(' ').slice(1).join(' ')}
                </button>
              )
            })}
          </div>
          <button className="btn big" disabled={!pick.length} onClick={() => { save({ trained: true, kinds: pick }); setPick(null) }}>
            {pick.length ? 'Marcar treino' : 'Escolhe pelo menos 1'}
          </button>
          {cur?.trained && <button className="later" onClick={() => { save({ trained: null, kinds: [] }); setPick(null) }}>desmarcar treino</button>}
        </Sheet>
      )}
    </>
  )
}

function Meter({ label, v, max }: { label: string; v: number; max: number }) {
  const over = v > max
  return (
    <div className={'card meter' + (over ? ' over' : '')}>
      <div><span>{label}</span><b>{v}<small>/{max}</small></b></div>
      <div className="track"><i style={{ width: `${Math.min(100, (v / Math.max(1, max)) * 100)}%` }} /></div>
      <small>{over ? 'estourou. vergonha.' : v === max ? 'no limite' : `sobra ${max - v}`}</small>
    </div>
  )
}
