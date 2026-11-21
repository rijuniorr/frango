import { useState } from 'react'
import type { Ctx } from './App'
import { sb, hap, fmtKg, iso } from './lib'
import { Avatar } from './ui'

export default function Eu({ data, reload, toast }: Ctx) {
  const me = data.profiles.find(p => p.id === data.me)!
  const [name, setName] = useState(me.name)
  const [height, setHeight] = useState(me.height_cm?.toString() ?? '')
  const [goal, setGoal] = useState(me.goal_kg?.toString().replace('.', ',') ?? '')
  const last = [...data.checkins].reverse().find(c => c.user_id === me.id && c.weight != null)?.weight
  const bmi = last && me.height_cm ? last / (me.height_cm / 100) ** 2 : null
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone

  async function saveProfile() {
    hap(10)
    const g = parseFloat(goal.replace(',', '.'))
    const h = parseInt(height)
    await sb.from('profiles').update({ name: name.trim() || me.name, height_cm: isNaN(h) ? null : h, goal_kg: isNaN(g) ? null : g }).eq('id', me.id)
    await reload()
    toast('Perfil salvo.')
  }

  async function setLimit(k: 'max_skips' | 'max_junk', v: number) {
    if (v < 0 || v > 14) return
    hap(8)
    await sb.from('settings').update({ [k]: v, updated_at: new Date().toISOString() }).eq('id', 1)
    reload()
  }

  // mapa dos últimos 84 dias
  const days = Array.from({ length: 84 }, (_, i) => iso(new Date(Date.now() - (83 - i) * 864e5)))

  return (
    <>
      <header className="bar">
        <span className="logo">eu<i>.</i></span>
        <button className="ib" onClick={() => { hap(10); sb.auth.signOut() }}>sair</button>
      </header>

      <div className="card me">
        <Avatar name={me.name} me />
        <div><b>{me.name}</b><span>@{me.username}{me.is_admin ? ' · admin' : ''}</span></div>
        <div className="kg"><b>{fmtKg(last)}</b><span>kg</span></div>
      </div>

      <h2 className="h">Treinos — 12 semanas</h2>
      <div className="card heat">
        {days.map(d => {
          const x = data.days.find(y => y.user_id === me.id && y.day === d)
          return <i key={d} className={x?.trained ? 'on' : x?.trained === false ? 'off' : ''} title={d} />
        })}
      </div>

      <h2 className="h">Perfil</h2>
      <div className="card form">
        <label className="field"><span>Nome no app</span><input value={name} onChange={e => setName(e.target.value)} /></label>
        <div className="two">
          <label className="field"><span>Altura (cm)</span><input value={height} onChange={e => setHeight(e.target.value)} inputMode="numeric" placeholder="178" /></label>
          <label className="field"><span>Meta (kg)</span><input value={goal} onChange={e => setGoal(e.target.value)} inputMode="decimal" placeholder="78,0" /></label>
        </div>
        {bmi && <p className="hint">IMC atual: {bmi.toFixed(1).replace('.', ',')}</p>}
        <button className="btn" onClick={saveProfile}>Salvar</button>
      </div>

      <h2 className="h">Regras da semana {me.is_admin ? '' : '(só o Ricardo muda)'}</h2>
      <div className="card form">
        <Step label="Treinos que pode furar" v={data.settings.max_skips} on={v => setLimit('max_skips', v)} lock={!me.is_admin} />
        <Step label="Besteiras liberadas" v={data.settings.max_junk} on={v => setLimit('max_junk', v)} lock={!me.is_admin} />
        <p className="hint">Passou do limite, o app xinga. Sem dó.</p>
      </div>

      {!standalone && (
        <div className="card tip">
          <b>Instala o app</b>
          <span>iPhone: Safari → Compartilhar → Adicionar à Tela de Início. Android: menu ⋮ → Adicionar à tela inicial.</span>
        </div>
      )}
      <p className="ver">frango · v0.2</p>
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
