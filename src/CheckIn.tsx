import { useEffect, useRef, useState } from 'react'
import type { Ctx } from './App'
import { sb, hap, iso, monday, shrink, nice, ANGLES, type Angle } from './lib'
import { Ruler, Hold, useBack, Sheet } from './ui'
import { useTilt, isLevel, tiltHint, askMotion, unlockAudio, beep } from './level'
import { nowWeight } from './Feed'
import Cropper from './Cropper'

// mesma silhueta do protótipo (viewBox 0 0 200 400)
const p = { sh: 46, wa: 33, hi: 34, ar: 18 }, c = 100
const BODY = `M${c-11} 76C${c-20} 84 ${c-p.sh+8} 86 ${c-p.sh} 98L${c-p.sh-24} 198C${c-p.sh-24} 204 ${c-p.sh-24+p.ar} 206 ${c-p.sh-22+p.ar} 200L${c-p.sh+12} 126C${c-p.wa-4} 156 ${c-p.wa} 178 ${c-p.wa} 200L${c-p.hi} 246L${c-25} 376H${c-7}L${c} 266L${c+7} 376H${c+25}L${c+p.hi} 246L${c+p.wa} 200C${c+p.wa} 178 ${c+p.wa+4} 156 ${c+p.sh-12} 126L${c+p.sh+22-p.ar} 200C${c+p.sh+24-p.ar} 206 ${c+p.sh+24} 204 ${c+p.sh+24} 198L${c+p.sh} 98C${c+p.sh-8} 86 ${c+20} 84 ${c+11} 76Z`

type Shot = { blob: Blob; url: string }

export default function CheckIn({ data, reload, mutate, toast, close }: Ctx & { close: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef(0)
  const [step, setStep] = useState<'cam' | 'form'>('cam')
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [angle, setAngle] = useState<Angle>('frente')
  const [shots, setShots] = useState<Partial<Record<Angle, Shot>>>({})
  const [count, setCount] = useState(0)
  const [ratio, setRatio] = useState('3 / 4')
  const [err, setErr] = useState('')
  const [go, setGo] = useState(() => { try { return +(localStorage.getItem('frango.go') ?? 0.55) } catch { return 0.55 } })
  const week = iso(monday())
  const mine = data.checkins.filter(x => x.user_id === data.me)
  const existing = mine.find(x => x.week === week)
  const lastW = nowWeight({ data }, data.me)
  const [weight, setWeight] = useState(existing?.weight ?? lastW ?? 80)
  const [note, setNote] = useState(existing?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [crop, setCrop] = useState<string | null>(null)
  const [secs, setSecs] = useState(() => { try { return +(localStorage.getItem('frango.timer') ?? 10) } catch { return 10 } })
  const [motion, setMotion] = useState(false)
  const [tips, setTips] = useState(() => { try { return !localStorage.getItem('frango.dicas') } catch { return false } })
  const tilt = useTilt(motion && step === 'cam')
  const level = isLevel(tilt)
  const wasLevel = useRef(false)
  useBack(close)

  // bip curto quando o celular fica no nível
  useEffect(() => {
    if (level && !wasLevel.current) { beep(1320, 90); hap(15) }
    wasLevel.current = level
  }, [level])

  // liga nível + som (iPhone exige que seja dentro de um toque)
  async function enableSensors() {
    unlockAudio()
    if (!motion) { await askMotion(); setMotion(true) } // mesmo se recusar, escuta: se nada chegar, o aviso explica
  }

  // fantasma = última foto sua desse ângulo (de outra semana)
  const prevPath = [...mine].reverse().find(x => x.photos[angle] && x.week !== week)?.photos[angle]
  const ghost = prevPath ? data.urls[prevPath] : undefined

  const stopTimer = () => { clearInterval(timer.current); timer.current = 0; setCount(0) }
  useEffect(() => () => clearInterval(timer.current), []) // fechou no meio do 3-2-1: para

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

  function grab() {
    const v = video.current
    if (!v || !v.videoWidth) return
    const vw = v.videoWidth, vh = v.videoHeight
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
    const next = ANGLES.find(a => a !== angle && !shots[a])
    if (next) setTimeout(() => setAngle(next), 450)
  }

  async function countdown() {
    if (timer.current || err) return
    await enableSensors()
    let n = secs
    setCount(n); hap(); beep(660)
    timer.current = window.setInterval(() => {
      n--
      if (n === 0) { stopTimer(); beep(1320, 220, 0.25); grab() }
      else { setCount(n); hap(); beep(n <= 3 ? 990 : 660) }
    }, 1000)
  }
  function pickSecs(s: number) {
    setSecs(s); hap(6)
    try { localStorage.setItem('frango.timer', String(s)) } catch { /* */ }
  }

  // galeria ou câmera nativa do celular → editor
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
      const photos: Partial<Record<Angle, string>> = { ...(existing?.photos ?? {}) }
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
      }
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

  return (
    <div className="overlay">
      {step === 'cam' ? (
        <div className="cam">
          <div className="cam-top">
            <button className="ib" onClick={close}>Fechar</button>
            <span className="pill">{n}/3 fotos</span>
            <button className={'ib' + (n ? ' g' : '')} onClick={() => { stopTimer(); setStep('form'); hap(8) }}>{n ? 'Próximo' : 'Pular'}</button>
          </div>

          <div className="frame" style={{ aspectRatio: ratio }}>
            <video ref={video} playsInline muted autoPlay className={facing === 'user' ? 'mirror' : ''}
              onLoadedMetadata={e => setRatio(`${e.currentTarget.videoWidth} / ${e.currentTarget.videoHeight}`)}
              onResize={e => setRatio(`${e.currentTarget.videoWidth} / ${e.currentTarget.videoHeight}`)} />
            {ghost && <img src={ghost} className="ghost" alt="" style={{ opacity: go }} />}
            <svg viewBox="0 0 200 400" className="outline" aria-hidden="true"><circle cx="100" cy="50" r="23" /><path d={BODY} /></svg>
            {shots[angle] && <img src={shots[angle]!.url} className="taken" alt="" />}
            {motion && tilt && (
              <div className={'level' + (level ? ' ok' : '')} aria-label={tiltHint(tilt)}>
                <i style={{ transform: `translate(${Math.max(-26, Math.min(26, tilt.roll * 3))}px, ${Math.max(-26, Math.min(26, tilt.pitch * 3))}px)` }} />
              </div>
            )}
            {count > 0 && <div className="count" key={count}>{count}</div>}
            {err && <div className="err">{err}</div>}
          </div>

          <p className={'level-hint' + (level ? ' ok' : '')}>
            {!motion ? <button className="wk" onClick={enableSensors}>Ligar o nível (giroscópio)</button> : tilt ? tiltHint(tilt) : 'Esse celular não mandou o nível.'}
            {' · '}<button className="wk" onClick={() => { setTips(true); hap(6) }}>Dicas de posição</button>
          </p>
          <div className="chips timer-chips" aria-label="Timer">
            {[3, 5, 10].map(s => <button key={s} className={s === secs ? 'on' : ''} onClick={() => pickSecs(s)}>{s}s</button>)}
          </div>

          {ghost && (
            <label className="ghost-ctl">
              <span>Fantasma</span>
              <input type="range" className="fade" min={0.15} max={0.9} step={0.05} value={go}
                onChange={e => { const v = +e.target.value; setGo(v); hap(5); try { localStorage.setItem('frango.go', String(v)) } catch { /* */ } }} />
            </label>
          )}

          <div className="chips">
            {ANGLES.map(a => <button key={a} className={(a === angle ? 'on ' : '') + (shots[a] ? 'done' : '')} onClick={() => { setAngle(a); hap(6) }}>{shots[a] ? '✓ ' : ''}{a}</button>)}
          </div>

          <div className="row">
            <label className="ib">
              <input type="file" accept="image/*" onChange={native} hidden />
              Galeria
            </label>
            <button className="shoot" onClick={countdown} aria-label="Tirar foto" disabled={count > 0 || !!err} />
            <button className="ib" onClick={() => { stopTimer(); setFacing(f => (f === 'user' ? 'environment' : 'user')); hap(8) }}>Virar</button>
          </div>
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
        <Sheet onClose={() => { setTips(false); try { localStorage.setItem('frango.dicas', '1') } catch { /* */ } }}>
          <h3 className="sheet-h">Foto igual toda semana</h3>
          <ol className="steps">
            <li><span className="n">1</span><span><b>Celular em pé e reto</b>, apoiado ou preso na parede (fita serve). Usa o nível: bolha verde no meio.</span></li>
            <li><span className="n">2</span><span><b>Altura do umbigo / logo abaixo do peito.</b> Mais baixo estica as pernas, mais alto aumenta a cabeça.</span></li>
            <li><span className="n">3</span><span><b>2 a 3 metros</b> de distância, corpo inteiro no contorno. Câmera <b>1x</b>, nunca a grande-angular (0,5x).</span></li>
            <li><span className="n">4</span><span><b>Sempre o mesmo lugar, a mesma luz e a mesma hora</b> (segunda de manhã, em jejum). Luz de frente, não de trás.</span></li>
            <li><span className="n">5</span><span>Marca no chão onde ficam teus pés e onde fica o celular. Assim as fotos saem iguais.</span></li>
          </ol>
          <button className="btn big" onClick={() => { setTips(false); try { localStorage.setItem('frango.dicas', '1') } catch { /* */ } enableSensors() }}>Entendi, ligar o nível</button>
        </Sheet>
      )}
      {crop && <Cropper src={crop} aspect={3 / 4} outW={1200} title={`Ajustar · ${angle}`} onDone={addShot} onCancel={() => setCrop(null)} />}
    </div>
  )
}
