import { useState } from 'react'
import type { Ctx } from './App'
import { sb, hap, fmtKg, iso, avatarOf, shrink, kindLabel } from './lib'
import { Avatar } from './ui'
import Cropper from './Cropper'

const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? null : n }
const str = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))

export default function Eu({ data, reload, mutate, toast }: Ctx) {
  const me = data.profiles.find(p => p.id === data.me)!
  const [name, setName] = useState(me.name)
  const [height, setHeight] = useState(str(me.height_cm))
  const [weight, setWeight] = useState(str(me.weight_kg ?? [...data.checkins].reverse().find(c => c.user_id === me.id && c.weight != null)?.weight))
  const [goal, setGoal] = useState(str(me.goal_kg))
  const [fat, setFat] = useState(str(me.fat_pct))
  const [up, setUp] = useState(false)
  const [crop, setCrop] = useState<string | null>(null)
  const w = num(weight), g = num(goal), h = num(height)
  const bmi = w && h ? w / (h / 100) ** 2 : null
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone

  async function saveProfile() {
    hap(10)
    const { error } = await sb.from('profiles').update({ name: name.trim() || me.name, height_cm: h == null ? null : Math.round(h), weight_kg: w, goal_kg: g, fat_pct: num(fat) }).eq('id', me.id)
    if (error) return toast('Não salvou: ' + error.message)
    await reload()
    toast('Perfil salvo.')
  }

  // escolheu a foto → abre o editor (recorte redondo)
  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) setCrop(URL.createObjectURL(await shrink(f, 2000)))
  }

  async function photo(blob: Blob) {
    setCrop(null)
    setUp(true)
    try {
      mutate(d => ({ ...d, urls: { ...d.urls, __me: URL.createObjectURL(blob) }, profiles: d.profiles.map(p => (p.id === me.id ? { ...p, avatar: '__me' } : p)) }))
      const path = `${me.id}/avatar-${Date.now()}.jpg`
      const r = await sb.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg' })
      if (r.error) throw r.error
      const u = await sb.from('profiles').update({ avatar: path }).eq('id', me.id)
      if (u.error) throw u.error
      hap(30)
      await reload()
    } catch (err) {
      toast('Foto não subiu: ' + (err as Error).message)
      reload()
    }
    setUp(false)
  }

  async function setLimit(k: 'max_skips' | 'max_junk', v: number) {
    if (v < 0 || v > 14) return
    hap(8)
    mutate(d => ({ ...d, settings: { ...d.settings, [k]: v } }))
    await sb.from('settings').update({ [k]: v, updated_at: new Date().toISOString() }).eq('id', 1)
  }

  // mapa dos últimos 84 dias
  const days = Array.from({ length: 84 }, (_, i) => iso(new Date(Date.now() - (83 - i) * 864e5)))
  // o que mais treina
  const count: Record<string, number> = {}
  data.days.filter(d => d.user_id === me.id && d.trained).forEach(d => (d.kinds ?? []).forEach(k => (count[k] = (count[k] ?? 0) + 1)))
  const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const progress = w != null && g != null ? (() => {
    const start = data.checkins.find(c => c.user_id === me.id && c.weight != null)?.weight ?? w
    return start === g ? 1 : Math.max(0, Math.min(1, (start - w) / (start - g)))
  })() : null

  return (
    <>
      <header className="bar">
        <span className="logo">perfil<i>.</i></span>
        <button className="ib" onClick={() => { hap(10); sb.auth.signOut() }}>sair</button>
      </header>

      <div className="card me">
        <label className={'av-edit' + (up ? ' busy' : '')}>
          <input type="file" accept="image/*" onChange={pickPhoto} hidden />
          <Avatar name={me.name} me src={avatarOf(data, me.id)} />
          <span className="cam-badge"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg></span>
        </label>
        <div><b>{me.name}</b><span>@{me.username}{me.is_admin ? ' · admin' : ''}</span></div>
      </div>

      <div className="card goal">
        <div><span>Peso atual</span><b>{fmtKg(w)}<small> kg</small></b></div>
        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        <div><span>Meta</span><b className="g">{fmtKg(g)}<small> kg</small></b></div>
        {progress != null && <div className="goal-bar"><div className="gtrack"><i style={{ width: `${progress * 100}%` }} /></div><small>{w != null && g != null ? (w === g ? 'meta batida!' : `falta ${fmtKg(Math.abs(w - g))} kg`) : ''}</small></div>}
      </div>

      <h2 className="h">Medidas</h2>
      <div className="card form">
        <label className="field"><span>Nome no app</span><input value={name} onChange={e => setName(e.target.value)} /></label>
        <div className="two">
          <label className="field"><span>Peso atual (kg)</span><input value={weight} onChange={e => setWeight(e.target.value)} inputMode="decimal" placeholder="112,0" /></label>
          <label className="field"><span>Meta (kg)</span><input value={goal} onChange={e => setGoal(e.target.value)} inputMode="decimal" placeholder="90,0" /></label>
        </div>
        <div className="two">
          <label className="field"><span>Altura (cm)</span><input value={height} onChange={e => setHeight(e.target.value)} inputMode="numeric" placeholder="178" /></label>
          <label className="field"><span>Gordura (%)</span><input value={fat} onChange={e => setFat(e.target.value)} inputMode="decimal" placeholder="25" /></label>
        </div>
        {bmi && <p className="hint">IMC: {bmi.toFixed(1).replace('.', ',')}</p>}
        <button className="btn" onClick={saveProfile}>Salvar</button>
      </div>

      <h2 className="h">Treinos — 12 semanas</h2>
      <div className="card heat">
        {days.map(d => {
          const x = data.days.find(y => y.user_id === me.id && y.day === d)
          return <i key={d} className={x?.trained ? 'on' : x?.trained === false ? 'off' : ''} title={d} />
        })}
      </div>
      {top.length > 0 && (
        <div className="kinds-top">{top.map(([k, n]) => <span key={k} className="pill">{kindLabel(k)} · {n}</span>)}</div>
      )}

      <h2 className="h">Regras da semana {me.is_admin ? '' : '(só o Ricardo muda)'}</h2>
      <div className="card form">
        <Step label="Treinos que pode furar" v={data.settings.max_skips} on={v => setLimit('max_skips', v)} lock={!me.is_admin} />
        <Step label="Besteiras liberadas" v={data.settings.max_junk} on={v => setLimit('max_junk', v)} lock={!me.is_admin} />
        <p className="hint">Passou do limite, o app xinga. Sem dó.</p>
      </div>

      {!standalone && (
        <div className="card tip">
          <b>Instala o app</b>
          <span>iPhone: Safari → Compartilhar → Adicionar à Tela de Início. Android: menu ⋮ → Instalar app.</span>
        </div>
      )}
      <p className="ver">frango · v0.4</p>
      {crop && <Cropper src={crop} aspect={1} round outW={500} title="foto de perfil" onDone={photo} onCancel={() => setCrop(null)} />}
    </>
  )
}

function Step({ label, v, on, lock }: { label: string; v: number; on: (v: number) => void; lock: boolean }) {
  return (
    <div className="step">
      <span>{label}</span>
      <div>
        {!lock && <button onClick={() => on(v - 1)} aria-label="Menos">−</button>}
        <b>{v}</b>
        {!lock && <button onClick={() => on(v + 1)} aria-label="Mais">+</button>}
      </div>
    </div>
  )
}
