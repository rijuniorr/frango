import { useState } from 'react'
import type { Ctx } from './App'
import { sb, hap, fmtKg, fmtDate, iso, monday, weekStats, avatarOf, ANGLES, type Angle, type Checkin } from './lib'
import { Compare, Avatar } from './ui'

const DOW = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

export default function Feed(ctx: Ctx) {
  const { data, openCheckin } = ctx
  const week = iso(monday())
  const first = data.checkins[0]?.week
  const n = first ? Math.floor((monday().getTime() - new Date(first + 'T12:00').getTime()) / (7 * 864e5)) + 1 : 1
  const posted = data.checkins.some(c => c.user_id === data.me && c.week === week)
  const people = [...data.profiles].sort((a, b) => a.username.localeCompare(b.username)).reverse()

  return (
    <>
      <header className="bar">
        <span className="logo brand"><img src="./icon-192.png" alt="" /><span>frango<i>.</i></span></span>
        <span className="pill">Semana {n}</span>
      </header>

      <section className="duo">
        {people.map(p => {
          const mine = data.checkins.filter(c => c.user_id === p.id && c.weight != null)
          const w = mine.at(-1)?.weight ?? p.weight_kg ?? null
          const d = w != null && mine.length > 1 ? w - mine[0].weight! : null
          const s = weekStats(data, p.id)
          const over = s.junk > data.settings.max_junk || s.skips > data.settings.max_skips
          return (
            <div key={p.id} className={'card who' + (over ? ' over' : '')}>
              <div className="who-top"><Avatar name={p.name} me={p.id === data.me} src={avatarOf(data, p.id)} /><b>{p.name}</b></div>
              <div className="kg"><b>{fmtKg(w)}</b><span>kg{p.goal_kg != null && <> → {fmtKg(p.goal_kg)}</>}</span></div>
              <div className={'delta' + (d != null && d > 0 ? ' up' : '')}>{d == null ? 'sem histórico' : `${d > 0 ? '+' : ''}${fmtKg(d)} kg desde o início`}</div>
              <div className="week7">
                {s.days.map((x, i) => <i key={i} className={x?.trained ? 'on' : x?.trained === false ? 'off' : ''} title={DOW[i]} />)}
              </div>
              <div className="mini">
                <span>{s.trained} treinos</span>
                <span className={s.junk > data.settings.max_junk ? 'bad' : ''}>{s.junk}/{data.settings.max_junk} besteiras</span>
              </div>
            </div>
          )
        })}
      </section>

      {!posted && (
        <button className="cta card" onClick={openCheckin}>
          <div><b>Seu check-in da semana</b><span>foto + peso. Leva 1 minuto.</span></div>
          <span className="btn">Fazer</span>
        </button>
      )}

      <h2 className="h">Linha do tempo</h2>
      {data.checkins.length === 0 && <p className="empty-txt">Ninguém postou ainda. Seja o primeiro frango.</p>}
      {[...data.checkins].reverse().map(c => <Post key={c.id} c={c} {...ctx} />)}
    </>
  )
}

function Post({ c, data, reload, mutate }: { c: Checkin } & Ctx) {
  const [angle, setAngle] = useState<Angle>(ANGLES.find(a => c.photos[a]) ?? 'frente')
  const [txt, setTxt] = useState('')
  const [burst, setBurst] = useState(0)
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

  async function like() {
    hap(liked ? 8 : [10, 30, 20])
    if (!liked) setBurst(Date.now())
    mutate(d => ({ ...d, likes: liked ? d.likes.filter(l => !(l.checkin_id === c.id && l.user_id === data.me)) : [...d.likes, { checkin_id: c.id, user_id: data.me }] }))
    if (liked) await sb.from('likes').delete().match({ checkin_id: c.id, user_id: data.me })
    else await sb.from('likes').insert({ checkin_id: c.id })
  }
  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!txt.trim()) return
    hap(10)
    await sb.from('comments').insert({ checkin_id: c.id, body: txt.trim() })
    setTxt('')
    reload()
  }

  return (
    <article className="card post">
      <div className="post-top">
        <Avatar name={p?.name ?? '?'} me={c.user_id === data.me} src={avatarOf(data, c.user_id)} />
        <div><b>{p?.name}</b><span>semana de {fmtDate(c.week)} · check-in {i + 1}</span></div>
      </div>

      {angles.length > 0 && (
        <>
          <Compare before={firstWith && firstWith.id !== c.id ? url(firstWith.photos[angle]) : undefined} after={url(c.photos[angle])} a={firstWith ? fmtDate(firstWith.week) : 'antes'} />
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
        <button className={'like' + (liked ? ' on' : '')} onClick={like}>
          <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /></svg>
          {likes.length > 0 && likes.length}
          {burst > 0 && <span className="sparks" key={burst}>{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ '--k': k } as React.CSSProperties} />)}</span>}
        </button>
      </div>

      {comments.map(x => (
        <p key={x.id} className="cmt"><b>{data.profiles.find(p => p.id === x.user_id)?.name}</b> {x.body}</p>
      ))}
      <form className="cmt-form" onSubmit={send}>
        <input value={txt} onChange={e => setTxt(e.target.value)} placeholder="Comentar…" maxLength={500} />
        {txt && <button>enviar</button>}
      </form>
    </article>
  )
}
