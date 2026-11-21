import { useEffect, useRef, useState } from 'react'
import type { Ctx } from './App'
import { sb, hap, iso, monday, shrink, ANGLES, type Angle } from './lib'
import { Ruler, Hold } from './ui'
import Cropper from './Cropper'

// mesma silhueta do protótipo (viewBox 0 0 200 400)
const p = { sh: 46, wa: 33, hi: 34, ar: 18 }, c = 100
const BODY = `M${c-11} 76C${c-20} 84 ${c-p.sh+8} 86 ${c-p.sh} 98L${c-p.sh-24} 198C${c-p.sh-24} 204 ${c-p.sh-24+p.ar} 206 ${c-p.sh-22+p.ar} 200L${c-p.sh+12} 126C${c-p.wa-4} 156 ${c-p.wa} 178 ${c-p.wa} 200L${c-p.hi} 246L${c-25} 376H${c-7}L${c} 266L${c+7} 376H${c+25}L${c+p.hi} 246L${c+p.wa} 200C${c+p.wa} 178 ${c+p.wa+4} 156 ${c+p.sh-12} 126L${c+p.sh+22-p.ar} 200C${c+p.sh+24-p.ar} 206 ${c+p.sh+24} 204 ${c+p.sh+24} 198L${c+p.sh} 98C${c+p.sh-8} 86 ${c+20} 84 ${c+11} 76Z`

type Shot = { blob: Blob; url: string }

export default function CheckIn({ data, reload, toast, close }: Ctx & { close: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [step, setStep] = useState<'cam' | 'form'>('cam')
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [angle, setAngle] = useState<Angle>('frente')
  const [shots, setShots] = useState<Partial<Record<Angle, Shot>>>({})
  const [count, setCount] = useState(0)
  const [ratio, setRatio] = useState('3 / 4')
  const [err, setErr] = useState('')
  const [go, setGo] = useState(() => { try { return +(localStorage.getItem('frango.go') ?? 0.55) } catch { return 0.55 } })
  const mine = data.checkins.filter(x => x.user_id === data.me)
  const lastW = [...mine].reverse().find(x => x.weight != null)?.weight
  const [weight, setWeight] = useState(lastW ?? 80)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [crop, setCrop] = useState<string | null>(null)
  const week = iso(monday())

  // fantasma = última foto sua desse ângulo
  const prevPath = [...mine].reverse().find(x => x.photos[angle] && x.week !== week)?.photos[angle]
  const ghost = prevPath ? data.urls[prevPath] : undefined

  useEffect(() => {
    if (step !== 'cam') return
    let dead = false
    ;(async () => {
      stream.current?.getTracks().forEach(t => t.stop())
      setErr('')
      try {
        // pedir o máximo faz o celular usar o sensor inteiro (sem zoom)
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 4096 }, height: { ideal: 4096 } }, audio: false })
        if (dead) { s.getTracks().forEach(t => t.stop()); return }
        stream.current = s
        const tr = s.getVideoTracks()[0]
        const caps = (tr.getCapabilities?.() ?? {}) as { zoom?: { min: number } }
        if (caps.zoom) await tr.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet] }).catch(() => {})
        video.current!.srcObject = s
        await video.current!.play()
      } catch (e) { setErr(String((e as Error).message || e)) }
    })()
    return () => { dead = true; stream.current?.getTracks().forEach(t => t.stop()) }
  }, [facing, step])

  function grab() {
    const v = video.current!
    const vw = v.videoWidth, vh = v.videoHeight
    if (!vw) return
    const k = Math.min(1, 2000 / Math.max(vw, vh))
    const cv = document.createElement('canvas')
    cv.width = Math.round(vw * k); cv.height = Math.round(vh * k)
    const g = cv.getContext('2d')!
    if (facing === 'user') { g.translate(cv.width, 0); g.scale(-1, 1) }
    g.drawImage(v, 0, 0, cv.width, cv.height)
    hap(40)
    cv.toBlob(b => b && setCrop(URL.createObjectURL(b)), 'image/jpeg', 0.9)
  }

  // toda foto passa pelo editor (recorte 3:4 igual pra todas → antes/depois alinha)
  function addShot(blob: Blob) {
    setCrop(null)
    setShots(s => ({ ...s, [angle]: { blob, url: URL.createObjectURL(blob) } }))
    hap(40)
    const next = ANGLES[ANGLES.indexOf(angle) + 1]
    if (next) setTimeout(() => setAngle(next), 500)
  }

  function countdown() {
    let n = 3
    setCount(n); hap()
    const t = setInterval(() => {
      n--
      if (n === 0) { clearInterval(t); setCount(0); grab() }
      else { setCount(n); hap() }
    }, 1000)
  }

  // galeria ou câmera nativa do celular → editor
  async function native(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) setCrop(URL.createObjectURL(await shrink(f, 2000)))
  }

  async function post() {
    setBusy(true)
    try {
      const existing = mine.find(x => x.week === week)
      const photos: Partial<Record<Angle, string>> = { ...(existing?.photos ?? {}) }
      for (const a of ANGLES) {
        const s = shots[a]
        if (!s) continue
        const path = `${data.me}/${week}/${a}-${Date.now()}.jpg`
        const { error } = await sb.storage.from('fotos').upload(path, s.blob, { contentType: 'image/jpeg' })
        if (error) throw error
        photos[a] = path
      }
      const { error } = await sb.from('checkins').upsert({ user_id: data.me, week, weight, note: note.trim() || existing?.note || null, photos }, { onConflict: 'user_id,week' })
      if (error) throw error
      await reload()
      toast('Check-in postado. Bora, frango.')
      close()
    } catch (e) {
      setBusy(false)
      toast('Deu ruim: ' + (e as Error).message)
    }
  }

  const n = Object.keys(shots).length

  return (
    <div className="overlay">
      {step === 'cam' ? (
        <div className="cam">
          <div className="cam-top">
            <button className="ib" onClick={close}>fechar</button>
            <span className="pill">{n}/3 fotos</span>
            <button className="ib" onClick={() => { setStep('form'); hap(8) }}>{n ? 'próximo' : 'pular'}</button>
          </div>

          <div className="frame" style={{ aspectRatio: ratio }}>
            <video ref={video} playsInline muted autoPlay className={facing === 'user' ? 'mirror' : ''}
              onLoadedMetadata={e => setRatio(`${e.currentTarget.videoWidth} / ${e.currentTarget.videoHeight}`)}
              onResize={e => setRatio(`${e.currentTarget.videoWidth} / ${e.currentTarget.videoHeight}`)} />
            {ghost && <img src={ghost} className="ghost" alt="" style={{ opacity: go }} />}
            <svg viewBox="0 0 200 400" className="outline" aria-hidden="true"><circle cx="100" cy="50" r="23" /><path d={BODY} /></svg>
            {shots[angle] && <img src={shots[angle]!.url} className="taken" alt="" />}
            {count > 0 && <div className="count" key={count}>{count}</div>}
            {err && <div className="err">Câmera falhou: {err}<br />Usa o botão “galeria”.</div>}
          </div>

          {ghost && (
            <input type="range" className="fade" aria-label="Força do fantasma" min={0.15} max={0.9} step={0.05} value={go}
              onChange={e => { const v = +e.target.value; setGo(v); hap(5); try { localStorage.setItem('frango.go', String(v)) } catch { /* */ } }} />
          )}

          <div className="chips">
            {ANGLES.map(a => <button key={a} className={(a === angle ? 'on ' : '') + (shots[a] ? 'done' : '')} onClick={() => { setAngle(a); hap(6) }}>{shots[a] ? '✓ ' : ''}{a}</button>)}
          </div>

          <div className="row">
            <label className="ib">
              <input type="file" accept="image/*" onChange={native} hidden />
              galeria
            </label>
            <button className="shoot" onClick={countdown} aria-label="Tirar foto" disabled={count > 0} />
            <button className="ib" onClick={() => { setFacing(f => (f === 'user' ? 'environment' : 'user')); hap(8) }}>virar</button>
          </div>
        </div>
      ) : (
        <div className="sheet">
          <div className="cam-top">
            <button className="ib" onClick={() => setStep('cam')}>← fotos</button>
            <span className="pill">check-in</span>
            <button className="ib" onClick={close}>fechar</button>
          </div>
          {n > 0 && <div className="thumbs">{ANGLES.map(a => shots[a] && <img key={a} src={shots[a]!.url} alt={a} />)}</div>}
          <h2 className="h">Peso de hoje</h2>
          <Ruler value={weight} onChange={setWeight} />
          {lastW != null && <p className="hint">{weight - lastW === 0 ? 'igual à última' : `${weight - lastW > 0 ? '+' : ''}${(weight - lastW).toFixed(1).replace('.', ',')} kg desde a última`}</p>}
          <h2 className="h">Como foi a semana?</h2>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Supino 70, dieta ok, churrasco no sábado…" maxLength={280} rows={3} />
          <Hold label="Segura pra postar" onDone={post} busy={busy} />
        </div>
      )}
      {crop && <Cropper src={crop} aspect={3 / 4} outW={1200} title={`ajustar · ${angle}`} onDone={addShot} onCancel={() => setCrop(null)} />}
    </div>
  )
}
