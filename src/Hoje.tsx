import { useEffect, useState } from 'react'
import type { Ctx } from './App'
import { sb, hap, today, weekDays, weekStats, roast, nice, cap, addDays, shrink, KINDS, kindLabel, type Day } from './lib'
import { Sheet } from './ui'

const DOW = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

export default function Hoje({ data, reload, mutate, toast }: Ctx) {
  const [note, setNote] = useState('')
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null | 'del'>(null) // foto nova do treino (ou 'del' = tirar a foto)
  const [sending, setSending] = useState(false)
  // só guarda o dia que a pessoa ESCOLHEU; sem escolha = hoje (de verdade, mesmo com o app aberto desde ontem)
  const [picked, setPicked] = useState<string | null>(null)
  const [back, setBack] = useState(false) // olhando a semana passada
  const [, tick] = useState(0)
  const [pick, setPick] = useState<string[] | null>(null) // sheet de categorias aberto
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible') { setPicked(null); setBack(false); tick(x => x + 1) } }
    document.addEventListener('visibilitychange', f)
    const t = setInterval(() => tick(x => x + 1), 60e3) // vira a meia-noite com o app aberto
    return () => { document.removeEventListener('visibilitychange', f); clearInterval(t) }
  }, [])

  const now = today()
  const ref = back ? addDays(new Date(), -7) : new Date()
  const wd = weekDays(ref)
  const day = picked && wd.includes(picked) && picked <= now ? picked : wd.includes(now) ? now : wd[6]
  const s = weekStats(data, data.me, ref)
  const cur: Day | undefined = data.days.find(d => d.user_id === data.me && d.day === day)
  const other = data.profiles.find(p => p.id !== data.me)
  const os = other ? weekStats(data, other.id) : null
  const otherToday = other ? data.days.find(d => d.user_id === other.id && d.day === now) : undefined
  const { max_skips, max_junk } = data.settings

  async function save(patch: Partial<Day>) {
    const prev = cur
    const next: Day = { user_id: data.me, day, trained: cur?.trained ?? null, junk: cur?.junk ?? 0, kinds: cur?.kinds ?? [], note: cur?.note ?? null, photo: cur?.photo ?? null, ...patch, updated_at: new Date().toISOString() }
    if (next.trained !== true) { next.note = null; next.photo = null } // furou/desmarcou: some do post
    // tela muda na hora; o banco vem depois
    mutate(d => ({ ...d, days: [...d.days.filter(x => !(x.user_id === data.me && x.day === day)), next] }))
    const skips = s.skips - (cur?.trained === false ? 1 : 0) + (next.trained === false ? 1 : 0)
    const junk = s.junk - (cur?.junk ?? 0) + next.junk
    if (patch.trained === false && skips > max_skips) toast(roast('skip'), 'roast')
    else if (patch.junk != null && patch.junk > (cur?.junk ?? 0) && junk > max_junk) toast(roast('junk'), 'roast')
    else if (patch.trained === true) toast('Boa, frango. Menos frango a cada dia.')
    const { error } = await sb.from('days').upsert(next)
    if (!error && cur?.photo && cur.photo !== next.photo) sb.storage.from('fotos').remove([cur.photo]) // não acumula foto velha
    if (error) {
      // desfaz e avisa (o aviso entra na fila, não apaga a bronca)
      mutate(d => ({ ...d, days: [...d.days.filter(x => !(x.user_id === data.me && x.day === day)), ...(prev ? [prev] : [])] }))
      toast('Não salvou. ' + nice(error), 'err')
      reload()
    }
  }

  function open() {
    hap(10)
    setPick(cur?.trained ? cur.kinds ?? [] : [])
    setNote(cur?.trained ? cur.note ?? '' : '')
    setShot(null)
  }

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { const blob = await shrink(f, 1600); setShot({ blob, url: URL.createObjectURL(blob) }) } catch (er) { toast(nice(er), 'err') }
  }

  // marcar treino: sobe a foto (se tiver) e salva categorias + observação
  async function mark() {
    if (!pick?.length || sending) return
    let photo = shot === 'del' ? null : cur?.trained ? cur.photo ?? null : null
    if (shot && shot !== 'del') {
      setSending(true)
      const path = `${data.me}/treino-${day}-${Date.now()}.jpg`
      const r = await sb.storage.from('fotos').upload(path, shot.blob, { contentType: 'image/jpeg' })
      setSending(false)
      if (r.error) return toast('Foto não subiu. ' + nice(r.error), 'err')
      mutate(d => ({ ...d, urls: { ...d.urls, [path]: shot.url } }))
      photo = path
    }
    save({ trained: true, kinds: pick, note: note.trim() || null, photo })
    setPick(null)
  }

  const shown = shot === 'del' ? undefined : shot ? shot.url : cur?.trained && cur.photo ? data.urls[cur.photo] : undefined

  const label = day === now ? 'Hoje' : cap(DOW[wd.indexOf(day)])

  return (
    <>
      <header className="bar">
        <h1 className="title">hoje<i>.</i></h1>
        <span className="pill">{cap(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', ''))}</span>
      </header>

      <div className="week-nav">
        <button className={'wk' + (back ? ' on' : '')} onClick={() => { setBack(b => !b); setPicked(null); hap(6) }}>
          {back ? '← voltar pra esta semana' : 'esqueceu de marcar? semana passada'}
        </button>
      </div>
      <div className="days">
        {wd.map((d, i) => {
          const x = data.days.find(y => y.user_id === data.me && y.day === d)
          const fut = d > now
          return (
            <button key={d} disabled={fut} className={(d === day ? 'sel ' : '') + (fut ? 'fut ' : '') + (x?.trained ? 'on' : x?.trained === false ? 'off' : '')} onClick={() => { setPicked(d); hap(6) }}>
              <span>{DOW[i]}</span><b>{+d.slice(8)}</b>{x && x.junk > 0 && <em>{x.junk}</em>}
            </button>
          )
        })}
      </div>

      <h2 className="h">{label === 'Hoje' ? 'Hoje você treinou?' : `${label} você treinou?`}</h2>
      <div className="yesno">
        <button className={'card big-q yes' + (cur?.trained === true ? ' on' : '')} onClick={open}>
          <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          <b>Treinei</b>
          {cur?.trained && cur.kinds && cur.kinds.length > 0 && <small>{cur.kinds.map(k => kindLabel(k).split(' ')[0]).join(' ')}</small>}
        </button>
        <button className={'card big-q no' + (cur?.trained === false ? ' on' : '')} onClick={() => { hap(10); save({ trained: cur?.trained === false ? null : false, kinds: [] }) }}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          <b>Furei</b>
        </button>
      </div>

      <h2 className="h">Besteiras {label === 'Hoje' ? 'de hoje' : `de ${label.toLowerCase()}`}</h2>
      <div className="card junk">
        <button onClick={() => { if ((cur?.junk ?? 0) > 0) { hap(8); save({ junk: (cur?.junk ?? 0) - 1 }) } }} aria-label="Menos" disabled={!cur?.junk}>−</button>
        <div><b key={cur?.junk ?? 0}>{cur?.junk ?? 0}</b><span>Bolacha, fritura, doce… seja honesto.</span></div>
        <button className="plus" onClick={() => { hap(14); save({ junk: (cur?.junk ?? 0) + 1 }) }} aria-label="Mais">+</button>
      </div>

      <h2 className="h">Limites {back ? 'da semana passada' : 'da semana'}</h2>
      <div className="limits">
        <Meter label="Furos" v={s.skips} max={max_skips} />
        <Meter label="Besteiras" v={s.junk} max={max_junk} />
      </div>

      {other && os && !back && (
        <div className="card spy">
          <b>{other.name}</b>
          <span>
            Hoje: {otherToday?.trained ? `treinou ✓ ${(otherToday.kinds ?? []).map(k => kindLabel(k).split(' ')[0]).join(' ')}` : otherToday?.trained === false ? 'furou ✗' : 'ainda não marcou'}
          </span>
          <span>Semana: {os.trained} {os.trained === 1 ? 'treino' : 'treinos'}, {os.junk} {os.junk === 1 ? 'besteira' : 'besteiras'}</span>
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
                  <span>{l.split(' ')[0]}</span><em>{l.split(' ').slice(1).join(' ')}</em>
                </button>
              )
            })}
          </div>
          <textarea className="obs" value={note} onChange={e => setNote(e.target.value)} placeholder="Observação (opcional): fiz 18 barras, joguei basquete…" maxLength={500} rows={2} />
          <div className="obs-photo">
            {shown ? (
              <><img src={shown} alt="" /><button className="later" onClick={() => { hap(6); setShot('del') }}>tirar foto</button></>
            ) : (
              <label className="btn pick-btn"><input type="file" accept="image/*" onChange={pickPhoto} hidden />📷 Foto do treino (opcional)</label>
            )}
          </div>
          <button className="btn big" disabled={!pick.length || sending} onClick={mark}>
            {sending ? 'Subindo foto…' : pick.length ? (cur?.trained ? 'Salvar treino' : 'Marcar treino') : 'Escolhe pelo menos 1'}
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
      <small>{over ? 'Estourou. Vergonha.' : v === max ? 'No limite.' : `Sobra ${max - v}.`}</small>
    </div>
  )
}
