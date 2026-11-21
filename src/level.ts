// Nível (giroscópio) + bip. Celular em pé, tela pra você: beta ≈ 90° (pra frente/trás), gamma ≈ 0° (torto pros lados).
import { useEffect, useRef, useState } from 'react'

// ---- som: Web Audio (no iPhone só toca depois de um toque na tela → unlock() no primeiro toque)
let ac: AudioContext | null = null
export function unlockAudio() {
  try {
    ac ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ac.state === 'suspended') ac.resume()
  } catch { /* sem som */ }
}
export function beep(freq = 880, ms = 70, vol = 0.18) {
  if (!ac) return
  const o = ac.createOscillator(), g = ac.createGain()
  o.type = 'sine'; o.frequency.value = freq
  const t = ac.currentTime
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + ms / 1000 + 0.02)
}


// tom contínuo (sensor de ré no alvo)
let tn: { o: OscillatorNode; g: GainNode } | null = null
export function tone(on: boolean, freq = 1320) {
  if (!on) { if (tn && ac) { try { tn.g.gain.setTargetAtTime(0, ac.currentTime, 0.03); tn.o.stop(ac.currentTime + 0.2) } catch { /* */ } } tn = null; return }
  if (tn || !ac) return
  const o = ac.createOscillator(), g = ac.createGain()
  o.frequency.value = freq; g.gain.value = 0.0001; g.gain.setTargetAtTime(0.12, ac.currentTime, 0.02)
  o.connect(g).connect(ac.destination); o.start(); tn = { o, g }
}

export type Tilt = { pitch: number; roll: number } // graus fora do ideal (0,0 = perfeito)
export const LEVEL_OK = { pitch: 3, roll: 2 }
export const isLevel = (t: Tilt | null) => !!t && Math.abs(t.pitch) <= LEVEL_OK.pitch && Math.abs(t.roll) <= LEVEL_OK.roll

// iPhone pede permissão (tem que ser dentro de um toque)
export async function askMotion(): Promise<boolean> {
  const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
  if (typeof D?.requestPermission !== 'function') return true
  try { return (await D.requestPermission()) === 'granted' } catch { return false }
}

export function useTilt(on: boolean) {
  const [tilt, setTilt] = useState<Tilt | null>(null)
  const sm = useRef<Tilt | null>(null)
  useEffect(() => {
    if (!on) return
    const f = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return
      const raw = { pitch: e.beta - 90, roll: e.gamma }
      const p = sm.current
      sm.current = p ? { pitch: p.pitch * 0.7 + raw.pitch * 0.3, roll: p.roll * 0.7 + raw.roll * 0.3 } : raw // suaviza a tremida
      setTilt(sm.current)
    }
    addEventListener('deviceorientation', f)
    return () => removeEventListener('deviceorientation', f)
  }, [on])
  return tilt
}

// texto do que fazer
export function tiltHint(t: Tilt | null) {
  if (!t) return ''
  // sem "esquerda/direita": depende de qual câmera e de como o celular está apoiado. A bolha mostra o lado.
  if (Math.abs(t.pitch) > LEVEL_OK.pitch) return `Celular inclinado ${Math.round(Math.abs(t.pitch))}° pra ${t.pitch > 0 ? 'trás' : 'frente'}: deixa ele em pé, reto`
  if (Math.abs(t.roll) > LEVEL_OK.roll) return `Celular torto ${Math.round(Math.abs(t.roll))}°: endireita até a bolha ficar no meio`
  return 'Nível perfeito'
}
