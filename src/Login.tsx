import { useState } from 'react'
import { sb, emailOf, passOf, hap } from './lib'

export default function Login() {
  const [user, setUser] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function go(e: React.FormEvent) {
    e.preventDefault()
    const u = user.trim().toLowerCase()
    if (!u || !pin) return
    setBusy(true); setErr('')
    const email = emailOf(u), password = passOf(pin)
    let { error } = await sb.auth.signInWithPassword({ email, password })
    // primeiro acesso: a conta nasce aqui (o banco só aceita ricardo e gabriel)
    if (error?.message.includes('Invalid login')) {
      const r = await sb.auth.signUp({ email, password })
      if (r.error?.message.includes('already registered')) error = { ...error, message: 'senha' } as typeof error
      else error = r.error
    }
    setBusy(false)
    if (error) {
      hap([40, 40, 40])
      setErr(error.message === 'senha' ? 'Senha errada.' : error.message.includes('cadastro fechado') || error.message.includes('Database error') ? 'Esse usuário não existe. Só Ricardo e Gabriel.' : error.message)
    } else hap(30)
  }

  return (
    <form className="login" onSubmit={go}>
      <div className="login-top">
        <span className="logo huge">frango<i>.</i></span>
        <p>Todo mundo começa frango.</p>
      </div>
      <label className="field">
        <span>Usuário</span>
        <input value={user} onChange={e => setUser(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="ricardo ou gabriel" />
      </label>
      <label className="field">
        <span>Senha</span>
        <input value={pin} onChange={e => setPin(e.target.value)} type="password" inputMode="numeric" autoComplete="current-password" placeholder="•••" />
      </label>
      {err && <p className="err-msg">{err}</p>}
      <button className="btn big" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  )
}
