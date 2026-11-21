import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { hap } from './lib'

// editor de foto: arrasta pra posicionar, pinça (ou slider) pra zoom, gira 90°.
// aspect = largura/altura do recorte; round = mostra máscara redonda (foto de perfil)
export default function Cropper({ src, aspect, round, outW, title, onDone, onCancel }: {
  src: string; aspect: number; round?: boolean; outW: number; title: string
  onDone: (b: Blob) => void; onCancel: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [fw, setFw] = useState(300)
  const [rot, setRot] = useState(0)
  const [z, setZ] = useState(1) // 1 = encaixe mínimo
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ d: number; z: number } | null>(null)
  const fh = fw / aspect

  useEffect(() => {
    const i = new Image()
    i.onload = () => setImg(i)
    i.src = src
  }, [src])
  useEffect(() => {
    const f = () => setFw(Math.min(innerWidth - 32, 440, (innerHeight - 260) * aspect))
    f(); addEventListener('resize', f)
    return () => removeEventListener('resize', f)
  }, [aspect])

  // tamanho da imagem girada e escala mínima que cobre o recorte
  const iw = img ? (rot % 180 ? img.height : img.width) : 1
  const ih = img ? (rot % 180 ? img.width : img.height) : 1
  const base = Math.max(fw / iw, fh / ih)
  const s = base * z
  const clamp = (p: { x: number; y: number }, sc = s) => {
    const mx = Math.max(0, (iw * sc - fw) / 2), my = Math.max(0, (ih * sc - fh) / 2)
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) }
  }
  const p = clamp(pos)

  function down(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()]
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z }
    }
  }
  function move(e: React.PointerEvent) {
    const prev = pts.current.get(e.pointerId)
    if (!prev) return
    const cur = { x: e.clientX, y: e.clientY }
    pts.current.set(e.pointerId, cur)
    if (pts.current.size === 2 && pinch.current) {
      const [a, b] = [...pts.current.values()]
      setZ(Math.max(1, Math.min(5, pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d))))
    } else if (pts.current.size === 1) {
      setPos(clamp({ x: p.x + cur.x - prev.x, y: p.y + cur.y - prev.y }))
    }
  }
  function up(e: React.PointerEvent) {
    pts.current.delete(e.pointerId)
    if (pts.current.size < 2) pinch.current = null
  }

  function done() {
    if (!img) return
    hap(20)
    const W = outW, H = Math.round(outW / aspect), k = W / fw
    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    const g = cv.getContext('2d')!
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H)
    g.translate(W / 2 + p.x * k, H / 2 + p.y * k)
    g.rotate((rot * Math.PI) / 180)
    g.scale(s * k, s * k)
    g.drawImage(img, -img.width / 2, -img.height / 2)
    cv.toBlob(b => b && onDone(b), 'image/jpeg', 0.88)
  }

  return createPortal(
    <div className="crop">
      <div className="cam-top">
        <button className="ib" onClick={onCancel}>cancelar</button>
        <span className="pill">{title}</span>
        <button className="ib g" onClick={done}>usar</button>
      </div>
      <div className={'crop-box' + (round ? ' round' : '')} ref={box} style={{ width: fw, height: fh }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onWheel={e => setZ(v => Math.max(1, Math.min(5, v * (e.deltaY < 0 ? 1.08 : 0.92))))}>
        {img && <img src={src} alt="" draggable={false} style={{
          width: img.width, height: img.height,
          transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px) rotate(${rot}deg) scale(${s})`,
        }} />}
        <i className="grid" />
      </div>
      <p className="hint">arrasta pra posicionar · pinça pra zoom</p>
      <div className="crop-ctl">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="M8 11h6M20 20l-4.5-4.5" /></svg>
        <input type="range" className="fade" min={1} max={5} step={0.01} value={z} onChange={e => setZ(+e.target.value)} aria-label="Zoom" />
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="M8 11h6M11 8v6M20 20l-4.5-4.5" /></svg>
      </div>
      <div className="row">
        <button className="ib" onClick={() => { setRot(r => (r + 270) % 360); setPos({ x: 0, y: 0 }); hap(8) }}>↺ girar</button>
        <button className="ib" onClick={() => { setZ(1); setPos({ x: 0, y: 0 }); hap(6) }}>resetar</button>
        <button className="ib" onClick={() => { setRot(r => (r + 90) % 360); setPos({ x: 0, y: 0 }); hap(8) }}>girar ↻</button>
      </div>
    </div>,
    document.body,
  )
}
