import { useRef, useState } from 'react'
import type { Ctx } from './App'
import { sb, hap, fmtKg, fmtDate, iso, monday, weekStats, avatarOf, nice, ANGLES, type Angle, type Checkin } from './lib'
import { Compare, Avatar, Confirm } from './ui'

const DOW = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

// peso "de agora": o do perfil (o check-in atualiza ele também); senão o último check-in
export const nowWeight = (ctx: Pick<Ctx, 'data'>, uid: string) => {
  const p = ctx.data.profiles.find(x => x.id === uid)
  return p?.weight_kg ?? [...ctx.data.checkins].reverse().find(c => c.user_id === uid && c.weight != null)?.weight ?? null
}

export default function Feed(ctx: Ctx) {
  const { data, openCheckin } = ctx
  const week = iso(monday())
  const first = data.checkins[0]?.week
  const n = first ? Math.round((monday().getTime() - new Date(first + 'T00:00').getTime()) / (7 * 864e5)) + 1 : 1
  const posted = data.checkins.some(c => c.user_id === data.me && c.week === week)
  const people = [...data.profiles].sort((a, b) => b.username.localeCompare(a.username)) // ricardo, gabriel

  return (
    <>
      <header className="bar">
        <span className="logo brand"><img src="./logo.png" alt="" /><span>frangos<i>.</i></span></span>
        <span className="pill">Semana {Math.max(1, n)}</span>
      </header>

      <section className="duo">
        {people.map(p => {
          const hist = data.checkins.filter(c => c.user_id === p.id && c.weight != null)
          const w = nowWeight(ctx, p.id)
          const d = w != null && hist.length > 0 && hist[0].weight !== w ? w - hist[0].weight! : null
          const s = weekStats(data, p.id)
          const overJ = s.junk > data.settings.max_junk, overS = s.skips > data.settings.max_skips
          return (
            <div key={p.id} className={'card who' + (overJ || overS ? ' over' : '')}>
              <div className="who-top"><Avatar name={p.name} mine={p.id === data.me} src={avatarOf(data, p.id)} /><b>{p.name}</b></div>
              <div className="kg"><b>{fmtKg(w)}</b><span>kg</span></div>
              <div className="goal-line">{p.goal_kg != null ? <>meta <b>{fmtKg(p.goal_kg)}</b></> : 'sem meta'}</div>
              <div className={'delta' + (d != null && d > 0 ? ' up' : '')}>{d == null ? 'sem histórico' : `${d > 0 ? '+' : ''}${fmtKg(d)} kg no total`}</div>
              <div className="week7" aria-label="treinos da semana">
                {s.days.map((x, i) => <i key={i} className={x?.trained ? 'on' : x?.trained === false ? 'off' : ''} title={DOW[i]} />)}
              </div>
              <div className="mini">
                <span>{s.trained} {s.trained === 1 ? 'treino' : 'treinos'}</span>
                <span className={overJ ? 'bad' : ''}>{s.junk}/{data.settings.max_junk} besteiras</span>
              </div>
            </div>
          )
        })}
      </section>

      {!posted && (
        <button className="cta card" onClick={openCheckin}>
          <div><b>Seu check-in da semana</b><span>Foto e peso. Leva 1 minuto.</span></div>
          <span className="btn">Fazer</span>
        </button>
      )}

      <h2 className="h">Linha do tempo</h2>
      {data.checkins.length === 0 && <p className="empty-txt">Ninguém postou ainda. Seja o primeiro frango.</p>}
      {[...data.checkins].reverse().map(c => <Post key={c.id} c={c} {...ctx} />)}
    </>
  )
}

function Post({ c, data, mutate, toast }: { c: Checkin } & Ctx) {
  const [angle, setAngle] = useState<Angle>(ANGLES.find(a => c.photos[a]) ?? 'frente')
  const [txt, setTxt] = useState('')
  const [burst, setBurst] = useState(0)
  const busy = useRef(false)
  const [sending, setSending] = useState(false)
  const [del, setDel] = useState(false)
  const p = data.profiles.find(x => x.id === c.user_id)
  const hist = data.checkins.filter(x => x.user_id === c.user_id)
  const i = hist.findIndex(x => x.id === c.id)
  const prev = hist.slice(0, i).reverse().find(x => x.weight != null)
  const firstWith = hist.find(x => x.photos[angle])
  const d = c.weight != null && prev?.weight != null ? c.weight - prev.weight : null
  const likes = data.likes.filter(l => l.checkin_id === c.id)
  const liked = likes.some(l => l.user_id === data.me)
  const comments = data.comments.filter(x => x.checkin_id === c.id)
  const url = (path?: string) => (path ? data.urls[path] : undefined)
  const angles = ANGLES.filter(a => c.photos[a])

  const toggle = (on: boolean) => mutate(d => ({
    ...d,
    likes: on ? [...d.likes.filter(l => !(l.checkin_id === c.id && l.user_id === data.me)), { checkin_id: c.id, user_id: data.me }]
      : d.likes.filter(l => !(l.checkin_id === c.id && l.user_id === data.me)),
  }))

  async function like() {
    if (busy.current) return // um de cada vez: banco e tela nunca divergem
    busy.current = true
    const on = !liked
    hap(on ? [10, 30, 20] : 8)
    if (on) setBurst(Date.now())
    toggle(on)
    const { error } = on ? await sb.from('likes').insert({ checkin_id: c.id }) : await sb.from('likes').delete().match({ checkin_id: c.id, user_id: data.me })
    if (error) { toggle(!on); toast(nice(error), 'err') }
    busy.current = false
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = txt.trim()
    if (!body || sending) return
    setSending(true); hap(10)
    const { data: row, error } = await sb.from('comments').insert({ checkin_id: c.id, body }).select().single()
    setSending(false)
    if (error) return toast(nice(error), 'err') // o texto continua no campo
    setTxt('')
    mutate(d => ({ ...d, comments: [...d.comments, row] }))
  }

  // excluir o próprio post: apaga as fotos do armazenamento e a linha (curtidas/comentários vão junto)
  async function remove() {
    setDel(false); hap([20, 30, 20])
    const before = data.checkins
    mutate(d => ({ ...d, checkins: d.checkins.filter(x => x.id !== c.id) }))
    const { error } = await sb.from('checkins').delete().eq('id', c.id)
    if (error) { mutate(d => ({ ...d, checkins: before })); return toast('Não excluiu. ' + nice(error), 'err') }
    const paths = ANGLES.map(a => c.photos[a]).filter((v): v is string => typeof v === 'string')
    if (paths.length) sb.storage.from('fotos').remove(paths)
    toast('Post excluído.')
  }

  return (
    <article className="card post">
      {del && <Confirm title="Excluir esse post?" text="As fotos, o peso, curtidas e comentários desse check-in somem pra sempre." yes="Excluir" onYes={remove} onClose={() => setDel(false)} />}
      <div className="post-top">
        <Avatar name={p?.name ?? '?'} mine={c.user_id === data.me} src={avatarOf(data, c.user_id)} size={36} />
        <div><b>{p?.name}</b><span>Semana de {fmtDate(c.week)} · check-in {i + 1}{c.photos.tag ? (c.photos.tag === 'pre' ? ' · pré-treino' : ' · pós-treino') : ''}</span></div>
        {c.user_id === data.me && <button className="post-del" onClick={() => { setDel(true); hap(8) }} aria-label="Excluir post"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg></button>}
      </div>

      {angles.length > 0 && (
        <>
          <Compare before={firstWith && firstWith.id !== c.id ? url(firstWith.photos[angle]) : undefined} after={url(c.photos[angle])} a={firstWith ? fmtDate(firstWith.week) : 'antes'} b={fmtDate(c.week)} />
          {angles.length > 1 && (
            <div className="chips">
              {angles.map(a => <button key={a} className={a === angle ? 'on' : ''} onClick={() => { setAngle(a); hap(6) }}>{a}</button>)}
            </div>
          )}
        </>
      )}

      <div className="stats">
        <div><b>{fmtKg(c.weight)}</b><span>kg</span></div>
        <div className={d != null && d > 0 ? 'up' : 'down'}><b>{d == null ? '—' : `${d > 0 ? '+' : ''}${fmtKg(d)}`}</b><span>na semana</span></div>
      </div>
      {c.note && <p className="note">“{c.note}”</p>}

      <div className="actions">
        <button className={'like' + (liked ? ' on' : '')} onClick={like} aria-label={liked ? 'Descurtir' : 'Curtir'}>
          <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /></svg>
          {likes.length > 0 && likes.length}
          {burst > 0 && <span className="sparks" key={burst}>{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ '--k': k } as React.CSSProperties} />)}</span>}
        </button>
      </div>

      {comments.map(x => (
        <p key={x.id} className="cmt"><b>{data.profiles.find(p => p.id === x.user_id)?.name}</b> {x.body}</p>
      ))}
      <form className="cmt-form" onSubmit={send}>
        <input value={txt} onChange={e => setTxt(e.target.value)} placeholder="Comentar…" maxLength={500} enterKeyHint="send" />
        {txt.trim() && <button disabled={sending}>{sending ? '…' : 'enviar'}</button>}
      </form>
    </article>
  )
}
