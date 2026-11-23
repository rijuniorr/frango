import { useState } from 'react'
import { sb, emailOf, passOf, hap, nice } from './lib'

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
    let msg = ''
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      // primeiro acesso: a conta nasce aqui (o banco só aceita ricardo, gabriel e sara)
      if (error?.message.includes('Invalid login')) {
        const r = await sb.auth.signUp({ email, password })
        if (r.error?.message.includes('already registered')) msg = 'Senha errada.'
        else if (r.error) msg = /cadastro fechado|Database error/.test(r.error.message) ? 'Esse usuário não existe. Só ricardo, gabriel e sara.' : nice(r.error)
        else if (!r.data.session) msg = 'Conta criada, mas o login precisa de confirmação no Supabase.'
      } else if (error) msg = nice(error)
    } catch (er) { msg = nice(er) }
    setBusy(false)
    if (msg) { hap([40, 40, 40]); setErr(msg) } else hap(30)
  }

  return (
    <form className="login" onSubmit={go}>
      <div className="login-top">
        <img src="./logo.png" alt="" className="login-logo" />
        <span className="logo huge">frangos<i>.</i></span>
        <p>Todo mundo começa frango.</p>
      </div>
      <label className="field">
        <span>Usuário</span>
        <input value={user} onChange={e => setUser(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="ricardo, gabriel ou sara" />
      </label>
      <label className="field">
        <span>Senha</span>
        <input value={pin} onChange={e => setPin(e.target.value)} type="password" inputMode="numeric" autoComplete="current-password" placeholder="tua senha" enterKeyHint="go" />
      </label>
      {err && <p className="err-msg">{err}</p>}
      <button className="btn big" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  )
}
