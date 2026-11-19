import { useEffect, useRef, useState } from 'react'

// Fase 1 — teste de risco: câmera ao vivo + contorno + fantasma da última foto,
// rodando como PWA instalado (foco no iPhone do Fachola).

type Angle = 'frente' | 'lado' | 'costas'
const ANGLES: Angle[] = ['frente', 'lado', 'costas']

// mesma silhueta do protótipo (viewBox 0 0 200 400)
const p = { sh: 46, wa: 33, hi: 34, ar: 18 }
const c = 100
const BODY = `M${c-11} 76C${c-20} 84 ${c-p.sh+8} 86 ${c-p.sh} 98L${c-p.sh-24} 198C${c-p.sh-24} 204 ${c-p.sh-24+p.ar} 206 ${c-p.sh-22+p.ar} 200L${c-p.sh+12} 126C${c-p.wa-4} 156 ${c-p.wa} 178 ${c-p.wa} 200L${c-p.hi} 246L${c-25} 376H${c-7}L${c} 266L${c+7} 376H${c+25}L${c+p.hi} 246L${c+p.wa} 200C${c+p.wa} 178 ${c+p.wa+4} 156 ${c+p.sh-12} 126L${c+p.sh+22-p.ar} 200C${c+p.sh+24-p.ar} 206 ${c+p.sh+24} 204 ${c+p.sh+24} 198L${c+p.sh} 98C${c+p.sh-8} 86 ${c+20} 84 ${c+11} 76Z`

// vibração: Android = navigator.vibrate; iPhone (iOS 18+) = clique num <input switch>
const sw = document.createElement('label')
sw.innerHTML = '<input type="checkbox" switch>'
sw.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:-99px'
document.body.append(sw)
function hap(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms)
  else sw.click()
}

const key = (a: Angle) => `frango.ghost.${a}`
const load = (a: Angle) => { try { return localStorage.getItem(key(a)) } catch { return null } }

export default function App() {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [angle, setAngle] = useState<Angle>('frente')
  const [ghost, setGhost] = useState(() => load('frente'))
  const [shot, setShot] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [ratio, setRatio] = useState('3 / 4')
  const [go, setGo] = useState(() => { try { return +(localStorage.getItem('frango.go') ?? 0.55) } catch { return 0.55 } })

  async function start() {
    stream.current?.getTracks().forEach(t => t.stop())
    setErr('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        // pedir "o máximo" (4096²) faz o celular usar o sensor inteiro, sem recorte = sem zoom
        video: { facingMode: facing, width: { ideal: 4096 }, height: { ideal: 4096 } },
        audio: false,
      })
      stream.current = s
      const tr = s.getVideoTracks()[0]
      // Android: alguns aparelhos abrem com zoom digital → força o mínimo
      const caps = (tr.getCapabilities?.() ?? {}) as { zoom?: { min: number } }
      if (caps.zoom) await tr.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet] }).catch(() => {})
      video.current!.srcObject = s
      await video.current!.play()
      const st = tr.getSettings()
      setInfo(`${st.width}×${st.height}`)
    } catch (e) {
      setErr(String((e as Error).message || e))
    }
  }

  useEffect(() => {
    start()
    // iPhone congela a câmera ao voltar do segundo plano → reabre
    const vis = () => document.visibilityState === 'visible' && start()
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); stream.current?.getTracks().forEach(t => t.stop()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing])

  useEffect(() => setGhost(load(angle)), [angle])

  function grab() {
    const v = video.current!
    const vw = v.videoWidth, vh = v.videoHeight
    if (!vw) return
    // foto inteira, sem recorte; lado maior até 1600 px
    const k = Math.min(1, 1600 / Math.max(vw, vh))
    const W = Math.round(vw * k), H = Math.round(vh * k)
    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    const g = cv.getContext('2d')!
    if (facing === 'user') { g.translate(W, 0); g.scale(-1, 1) }
    g.drawImage(v, 0, 0, W, H)
    setShot(cv.toDataURL('image/jpeg', 0.85))
    hap(40)
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

  function keep() {
    // fantasma menor pra caber no localStorage
    const img = new Image()
    img.onload = () => {
      const k = 600 / Math.max(img.width, img.height)
      const cv = document.createElement('canvas')
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k)
      cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height)
      const small = cv.toDataURL('image/jpeg', 0.7)
      try { localStorage.setItem(key(angle), small) } catch { /* cheio */ }
      setGhost(small)
      setShot(null)
      hap(20)
    }
    img.src = shot!
  }

  // plano B: câmera nativa do celular
  function native(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setShot(URL.createObjectURL(f))
    e.target.value = ''
  }

  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone

  return (
    <div className="app">
      {/* moldura segue o formato real da câmera → nada é cortado */}
      <div className="frame" style={{ aspectRatio: ratio }}>
        <video ref={video} playsInline muted autoPlay className={facing === 'user' ? 'mirror' : ''}
          onLoadedMetadata={e => setRatio(`${e.currentTarget.videoWidth} / ${e.currentTarget.videoHeight}`)}
          onResize={e => setRatio(`${e.currentTarget.videoWidth} / ${e.currentTarget.videoHeight}`)} />
        {ghost && <img src={ghost} className="ghost" alt="" style={{ '--go': go } as React.CSSProperties} />}
        <svg viewBox="0 0 200 400" className="outline" aria-hidden="true">
          <circle cx="100" cy="50" r="23" />
          <path d={BODY} />
        </svg>
        {count > 0 && <div className="count" key={count}>{count}</div>}
        {err && <div className="err">Câmera falhou: {err}<br />Usa a câmera nativa embaixo.</div>}
        <div className="top">
          <span className="logo">frango<i>.</i></span>
          <span className="tag">{standalone ? 'app instalado' : 'navegador'} · {info || '—'}</span>
        </div>
      </div>

      {ghost && (
        <input type="range" className="fade" aria-label="Força do fantasma" min={0.15} max={0.9} step={0.05} value={go}
          onChange={e => { const v = +e.target.value; setGo(v); hap(5); try { localStorage.setItem('frango.go', String(v)) } catch { /* */ } }} />
      )}

      <div className="seg">
        {ANGLES.map(a => (
          <button key={a} className={a === angle ? 'on' : ''} onClick={() => { setAngle(a); hap(8) }}>{a}</button>
        ))}
      </div>

      <div className="row">
        <label className="ib">
          <input type="file" accept="image/*" capture={facing} onChange={native} hidden />
          nativa
        </label>
        <button className="shoot" onClick={countdown} aria-label="Tirar foto" disabled={count > 0} />
        <button className="ib" onClick={() => { setFacing(f => f === 'user' ? 'environment' : 'user'); hap(8) }}>virar</button>
      </div>

      <a className="proto" href="./prototipo.html">ver protótipo do app →</a>

      {shot && (
        <div className="review">
          <img src={shot} alt="foto tirada" />
          <div className="row">
            <button className="ib" onClick={() => setShot(null)}>refazer</button>
            <button className="btn" onClick={keep}>usar como fantasma</button>
          </div>
        </div>
      )}
    </div>
  )
}
