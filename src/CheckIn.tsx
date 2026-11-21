import { useEffect, useRef, useState } from 'react'
import type { Ctx } from './App'
import { sb, hap, iso, monday, shrink, nice, ANGLES, type Angle, type Checkin } from './lib'
import { Ruler, Hold, useBack, Sheet } from './ui'
import { unlockAudio, beep, tone } from './level'
import { loadPose, releasePose, detectVideo, detectPhoto, toCrop, easyScore, type Pose } from './pose'
import { nowWeight } from './Feed'
import Cropper from './Cropper'

// mesma silhueta do protótipo (viewBox 0 0 200 400)
const p = { sh: 46, wa: 33, hi: 34, ar: 18 }, c = 100
const BODY = `M${c-11} 76C${c-20} 84 ${c-p.sh+8} 86 ${c-p.sh} 98L${c-p.sh-24} 198C${c-p.sh-24} 204 ${c-p.sh-24+p.ar} 206 ${c-p.sh-22+p.ar} 200L${c-p.sh+12} 126C${c-p.wa-4} 156 ${c-p.wa} 178 ${c-p.wa} 200L${c-p.hi} 246L${c-25} 376H${c-7}L${c} 266L${c+7} 376H${c+25}L${c+p.hi} 246L${c+p.wa} 200C${c+p.wa} 178 ${c+p.wa+4} 156 ${c+p.sh-12} 126L${c+p.sh+22-p.ar} 200C${c+p.sh+24-p.ar} 206 ${c+p.sh+24} 204 ${c+p.sh+24} 198L${c+p.sh} 98C${c+p.sh-8} 86 ${c+20} 84 ${c+11} 76Z`

type Shot = { blob: Blob; url: string }
const HOLD_MS = 3000 // tempo parado no alvo (tom contínuo) até a foto sair sozinha
const PAUSE_MS = 4000 // depois de uma foto: tempo pra virar pro próximo ângulo

export default function CheckIn({ data, reload, mutate, toast, close }: Ctx & { close: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef(0)
  const [step, setStep] = useState<'cam' | 'form'>('cam')
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [angle, setAngle] = useState<Angle>('frente')
  const [shots, setShots] = useState<Partial<Record<Angle, Shot>>>({})
  const [count, setCount] = useState(0)
  const [err, setErr] = useState('')
  const week = iso(monday())
  const mine = data.checkins.filter(x => x.user_id === data.me)
  const existing = mine.find(x => x.week === week)
  const lastW = nowWeight({ data }, data.me)
  const [weight, setWeight] = useState(existing?.weight ?? lastW ?? 80)
  const [note, setNote] = useState(existing?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [crop, setCrop] = useState<string | null>(null)
  const [tips, setTips] = useState(() => { try { return !localStorage.getItem('frango.dicas2') } catch { return false } })
  const [sense, setSense] = useState<{ score: number; hint: string; ok: boolean; on: number; live: Pose | null } | null>(null)
  const meta = useRef<Partial<Record<Angle, { pose: Pose | null; lum: number }>>>({})
  useBack(close)

  // referência = pose da foto mais antiga desse ângulo (a 1ª vez usa um alvo padrão, bem solto)
  const refPose = mine.find(x => x.photos.pose?.[angle])?.photos.pose?.[angle] ?? null
  // fantasma = última foto sua desse ângulo (de outra semana)
  const prevPath = [...mine].reverse().find(x => x.photos[angle] && x.week !== week)?.photos[angle]
  const ghost = prevPath ? data.urls[prevPath] : undefined

  const L = useRef({ angle, ref: refPose, facing, hold: false, done: false, shoot: () => {} })
  L.current = { angle, ref: refPose, facing, hold: count > 0 || !!crop || tips, done: !!shots[angle], shoot }
  const pauseUntil = useRef(0)

  // ---- câmera de ré: bip mais rápido conforme encaixa; no alvo, tom contínuo; 3 s parado → foto sozinha
  useEffect(() => {
    if (step !== 'cam') return
    let dead = false, raf = 0, last = 0, onSince = 0, nextBeep = 0
    let score = -1, smooth = 0
    let lmk: Awaited<ReturnType<typeof loadPose>> | null = null
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const s = L.current, v = video.current
      if (!lmk || !v || v.readyState < 2 || !v.videoWidth) return
      const paused = s.hold || s.done || now < pauseUntil.current
      // som (todo frame, pro ritmo ficar certinho)
      if (paused || score < 0) tone(false)
      else if (score >= 50) tone(true)
      else if (score > 0 && now >= nextBeep) { tone(false); beep(2000, 70); hap(10); nextBeep = now + 1100 - 1000 * (score / 50) } // 1,1 s → 0,1 s
      else if (score === 0) tone(false) // ninguém na frente: silêncio
      if (now - last < 90) return // ~11 fps de detecção
      last = now
      if (paused) { onSince = 0; score = -1; return }
      try {
        const mirror = s.facing === 'user'
        const raw = detectVideo(lmk, v, now)
        const live = raw && toCrop(raw, v.videoWidth, v.videoHeight, mirror)
        const r = easyScore(live, s.ref, mirror)
        smooth = r.score === 0 ? 0 : smooth ? smooth * 0.6 + r.score * 0.4 : r.score // tira a tremida da nota
        score = Math.round(smooth)
        const ok = score >= 50
        if (ok) { onSince ||= now } else onSince = 0
        const on = ok ? Math.min(1, (now - onSince) / HOLD_MS) : 0
        setSense({ score, hint: ok ? 'Isso! Fica parado' : r.hint, ok, on, live })
        if (ok && now - onSince >= HOLD_MS) { onSince = 0; tone(false); s.shoot() }
      } catch { /* frame ruim: pula */ }
    }
    loadPose().then(m => { if (dead) return; lmk = m; raf = requestAnimationFrame(tick) }).catch(() => {})
    return () => { dead = true; cancelAnimationFrame(raf); tone(false); setSense(null) }
  }, [step, facing])
  useEffect(() => () => { releasePose(); tone(false) }, [])

  const stopTimer = () => { clearInterval(timer.current); timer.current = 0; setCount(0) }
  useEffect(() => () => clearInterval(timer.current), [])

  useEffect(() => {
    if (step !== 'cam') return
    let dead = false
    ;(async () => {
      stream.current?.getTracks().forEach(t => t.stop())
      setErr('')
      try {
        // pedir o máximo faz o celular usar o sensor inteiro (sem zoom)
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 4096 }, height: { ideal: 4096 } }, audio: false })
        if (dead || !video.current) { s.getTracks().forEach(t => t.stop()); return }
        stream.current = s
        const tr = s.getVideoTracks()[0]
        const caps = (tr.getCapabilities?.() ?? {}) as { zoom?: { min: number } }
        if (caps.zoom) await tr.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet] }).catch(() => {})
        video.current.srcObject = s
        await video.current.play()
      } catch (e) {
        if (dead) return
        const name = (e as Error)?.name ?? ''
        setErr(/NotAllowed|Security/i.test(name) ? 'O app não tem permissão pra câmera. Libera nas configurações ou usa a galeria.' : 'Não deu pra abrir a câmera. Usa a galeria.')
      }
    })()
    return () => { dead = true; stopTimer(); stream.current?.getTracks().forEach(t => t.stop()) }
  }, [facing, step])

  // foto = exatamente o recorte 3:4 que aparece na tela (sem editor)
  function shoot() {
    const v = video.current
    if (!v || !v.videoWidth) return
    const vw = v.videoWidth, vh = v.videoHeight
    const cw = Math.min(vw, vh * 0.75), ch = cw * 4 / 3
    const cv = document.createElement('canvas')
    cv.width = 1200; cv.height = 1600
    const g = cv.getContext('2d')!
    if (facing === 'user') { g.translate(1200, 0); g.scale(-1, 1) }
    g.drawImage(v, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, 1200, 1600)
    beep(2600, 250, 0.2); hap([30, 40, 80])
    cv.toBlob(b => b && addShot(b), 'image/jpeg', 0.88)
  }

  function addShot(blob: Blob) {
    setCrop(null)
    const a = angle
    meta.current[a] = undefined
    loadPose().then(m => detectPhoto(m, blob)).then(r => { meta.current[a] = r }).catch(() => {}) // pose da foto final (vira a referência)
    const next = { ...shots, [a]: { blob, url: URL.createObjectURL(blob) } }
    setShots(next)
    const rest = ANGLES.filter(x => !next[x])
    if (!rest.length) { setTimeout(() => setStep('form'), 900); return } // 3 fotos → peso e nota
    pauseUntil.current = performance.now() + PAUSE_MS
    setTimeout(() => setAngle(rest[0]), 700)
    toast(`Agora de ${rest[0]}`)
  }

  // botão: 3-2-1 e foto (pra quem quer tirar na mão)
  function countdown() {
    unlockAudio()
    if (timer.current || err) return
    let n = 3
    setCount(n); beep(1600, 90)
    timer.current = window.setInterval(() => {
      n--
      if (n === 0) { stopTimer(); shoot() }
      else { setCount(n); beep(1600, 90) }
    }, 1000)
  }

  // galeria → editor de recorte
  async function native(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { setCrop(URL.createObjectURL(await shrink(f, 2000))) } catch (er) { toast(nice(er), 'err') }
  }

  async function post() {
    setBusy(true)
    const sent: string[] = []
    try {
      const photos: Checkin['photos'] = { ...(existing?.photos ?? {}) }
      const pose = { ...(photos.pose ?? {}) }, lum = { ...(photos.lum ?? {}) }
      const replaced: string[] = []
      for (const a of ANGLES) {
        const s = shots[a]
        if (!s) continue
        const path = `${data.me}/${week}/${a}-${Date.now()}.jpg`
        const { error } = await sb.storage.from('fotos').upload(path, s.blob, { contentType: 'image/jpeg' })
        if (error) throw error
        sent.push(path)
        if (photos[a]) replaced.push(photos[a]!)
        photos[a] = path
        const m = meta.current[a]
        if (m?.pose) { pose[a] = m.pose; lum[a] = m.lum } else { delete pose[a]; delete lum[a] }
      }
      if (Object.keys(pose).length) { photos.pose = pose; photos.lum = lum } else { delete photos.pose; delete photos.lum }
      const { error } = await sb.from('checkins').upsert({ user_id: data.me, week, weight, note: note.trim() || null, photos }, { onConflict: 'user_id,week' })
      if (error) throw error
      if (replaced.length) sb.storage.from('fotos').remove(replaced) // foto trocada na mesma semana: apaga a velha
      await sb.from('profiles').update({ weight_kg: weight }).eq('id', data.me) // "peso atual" acompanha o check-in
      mutate(d => ({ ...d, profiles: d.profiles.map(x => (x.id === data.me ? { ...x, weight_kg: weight } : x)) }))
      await reload()
      toast('Check-in postado. Bora, frango.')
      close()
    } catch (e) {
      if (sent.length) sb.storage.from('fotos').remove(sent) // não deixa foto órfã
      setBusy(false)
      toast('Não postou. ' + nice(e), 'err')
    }
  }

  const n = Object.keys(shots).length
  const closeTips = () => { unlockAudio(); setTips(false); try { localStorage.setItem('frango.dicas2', '1') } catch { /* */ } }

  return (
    <div className="overlay">
      {step === 'cam' ? (
        <div className="cam" onPointerDown={unlockAudio}>
          <div className="cam-top">
            <button className="ib" onClick={close}>Fechar</button>
            <span className="pill">{n}/3 fotos</span>
            <button className={'ib' + (n ? ' g' : '')} onClick={() => { stopTimer(); setStep('form'); hap(8) }}>{n ? 'Próximo' : 'Pular'}</button>
          </div>

          <div className="frame">
            <video ref={video} playsInline muted autoPlay className={facing === 'user' ? 'mirror' : ''} />
            {ghost && <img src={ghost} className="ghost" alt="" />}
            {/* molde: esqueleto da tua 1ª foto desse ângulo (fica de lado no "lado"); sem foto ainda, o boneco só na frente */}
            {!refPose && angle === 'frente' && <svg viewBox="0 0 200 400" className="outline" aria-hidden="true"><circle cx="100" cy="50" r="23" /><path d={BODY} /></svg>}
            <svg viewBox="0 0 300 400" className="skel" aria-hidden="true">
              <line x1="150" y1="0" x2="150" y2="400" className="center" />
              {refPose && <Skel pose={refPose} cls="ref" />}
              {sense?.live && <Skel pose={sense.live} cls={'live' + (sense.ok ? ' ok' : '')} />}
            </svg>
            {shots[angle] && <img src={shots[angle]!.url} className="taken" alt="" />}
            {count > 0 && <div className="count" key={count}>{count}</div>}
            {err && <div className="err">{err}</div>}
          </div>

          {/* status: uma frase grande + barra que enche conforme encaixa */}
          <div className={'radar' + (sense?.ok ? ' ok' : '')}>
            <b>{sense ? (shots[angle] ? '✓ Foto tirada' : sense.hint) : 'Carregando o sensor…'}</b>
            <i><u style={{ width: `${sense ? (sense.ok ? 100 : sense.score * 2) : 0}%` }} /></i>
            {sense?.ok && !shots[angle] && <small>Tirando em {Math.ceil(3 - sense.on * 3)}…</small>}
          </div>

          <div className="chips">
            {ANGLES.map(a => <button key={a} className={(a === angle ? 'on ' : '') + (shots[a] ? 'done' : '')} onClick={() => { setAngle(a); hap(6); pauseUntil.current = performance.now() + 1500 }}>{shots[a] ? '✓ ' : ''}{a}</button>)}
          </div>

          <div className="row">
            <label className="ib">
              <input type="file" accept="image/*" onChange={native} hidden />
              Galeria
            </label>
            <button className="shoot" onClick={countdown} aria-label="Tirar foto agora" disabled={count > 0 || !!err} />
            <button className="ib" onClick={() => { stopTimer(); setFacing(f => (f === 'user' ? 'environment' : 'user')); hap(8) }}>Virar</button>
          </div>
          <button className="wk" onClick={() => { setTips(true); hap(6) }}>Como funciona?</button>
        </div>
      ) : (
        <div className="sheet">
          <div className="cam-top">
            <button className="ib" onClick={() => setStep('cam')}>← Fotos</button>
            <span className="pill">Check-in</span>
            <button className="ib" onClick={close}>Fechar</button>
          </div>
          {n > 0 && <div className="thumbs">{ANGLES.map(a => shots[a] && <img key={a} src={shots[a]!.url} alt={a} />)}</div>}
          <h2 className="h center">Peso de hoje</h2>
          <Ruler value={weight} onChange={setWeight} />
          {lastW != null && <p className="hint center">{weight - lastW === 0 ? 'Igual à última.' : `${weight - lastW > 0 ? '+' : ''}${(weight - lastW).toFixed(1).replace('.', ',')} kg desde a última.`}</p>}
          <h2 className="h">Como foi a semana?</h2>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Supino 70, dieta ok, churrasco no sábado…" maxLength={280} rows={3} />
          <div className="hold-dock">
            <Hold label="Segura pra postar" onDone={post} busy={busy} />
          </div>
        </div>
      )}
      {tips && (
        <Sheet onClose={closeTips}>
          <h3 className="sheet-h">Igual câmera de ré</h3>
          <ol className="steps">
            <li><span className="n">1</span><span><b>Apoia o celular em pé</b> mais ou menos na altura do umbigo e liga o volume.</span></li>
            <li><span className="n">2</span><span><b>Afasta e se encaixa no contorno.</b> Não precisa aparecer o pé: ombro e quadril bastam.</span></li>
            <li><span className="n">3</span><span><b>Bip lento = longe. Bip rápido = quase.</b> Bip contínuo = certo: fica parado 3 segundos e a foto sai sozinha.</span></li>
            <li><span className="n">4</span><span>Aí <b>vira de lado</b>, depois <b>de costas</b>. Mesma coisa. As semanas seguintes usam a 1ª foto como referência.</span></li>
          </ol>
          <button className="btn big" onClick={closeTips}>Bora</button>
        </Sheet>
      )}
      {crop && <Cropper src={crop} aspect={3 / 4} outW={1200} title={`Ajustar · ${angle}`} onDone={addShot} onCancel={() => setCrop(null)} />}
    </div>
  )
}

// esqueleto (pontos do MediaPipe em 0..1 do recorte 3:4 → caixa 300×400)
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]]
function Skel({ pose, cls }: { pose: Pose; cls: string }) {
  const vis = (i: number) => pose[i] && pose[i][2] > 0.5
  const X = (i: number) => pose[i][0] * 300, Y = (i: number) => pose[i][1] * 400
  const head = vis(0) ? [X(0), Y(0)] : vis(11) && vis(12) ? [(X(11) + X(12)) / 2, (Y(11) + Y(12)) / 2 - Math.abs(X(11) - X(12)) * 0.9] : null
  const r = vis(11) && vis(12) ? Math.max(12, Math.abs(X(11) - X(12)) * 0.32) : 16
  return (
    <g className={cls}>
      {BONES.filter(([a, b]) => vis(a) && vis(b)).map(([a, b]) => <line key={a + '-' + b} x1={X(a)} y1={Y(a)} x2={X(b)} y2={Y(b)} />)}
      {head && <circle cx={head[0]} cy={head[1]} r={r} />}
      {[11, 12, 23, 24].filter(vis).map(i => <circle key={i} className="j" cx={X(i)} cy={Y(i)} r={5} />)}
    </g>
  )
}
