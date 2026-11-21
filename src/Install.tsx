import { useEffect, useState } from 'react'
import { hap } from './lib'
import { Sheet } from './ui'

// Android/Chrome: o navegador avisa que dá pra instalar → guardamos o aviso
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let bip: BIP | null = null
const subs = new Set<() => void>()
addEventListener('beforeinstallprompt', e => { e.preventDefault(); bip = e as BIP; subs.forEach(f => f()) })

const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const KEY = 'frango.install.later'

const Share = () => <svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" /></svg>
const Plus = () => <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></svg>

export default function Install() {
  const [, force] = useState(0)
  const [open, setOpen] = useState(() => {
    if (standalone()) return false
    try { return Date.now() - +(localStorage.getItem(KEY) ?? 0) > 864e5 } catch { return true }
  })
  useEffect(() => {
    const f = () => force(x => x + 1)
    const o = () => setOpen(true)
    subs.add(f); addEventListener('frango:install', o)
    return () => { subs.delete(f); removeEventListener('frango:install', o) }
  }, [])

  if (!open) return null
  const later = () => { try { localStorage.setItem(KEY, String(Date.now())) } catch { /* */ } setOpen(false) }

  async function install() {
    hap(12)
    if (!bip) return
    await bip.prompt()
    const r = await bip.userChoice
    bip = null
    if (r.outcome === 'accepted') setOpen(false)
  }

  return (
    <Sheet onClose={later}>
      <div className="install">
        <img src="./icon-192.png" alt="" className="install-icon" />
        <h3>Instala o Frango</h3>
        <p>Fica na tela inicial igual app, abre em tela cheia e a câmera funciona melhor.</p>

        {ios ? (
          <ol className="steps">
            <li><span className="n">1</span><span>Toca em <b>Compartilhar</b> <Share /> na barra do Safari</span></li>
            <li><span className="n">2</span><span>Toca em <b>Adicionar à Tela de Início</b> <Plus /></span></li>
            <li><span className="n">3</span><span>Confere o nome <b>Frango</b> e toca em <b>Adicionar</b></span></li>
          </ol>
        ) : bip ? (
          <button className="btn big" onClick={install}>Instalar agora</button>
        ) : (
          <ol className="steps">
            <li><span className="n">1</span><span>Toca no menu <b>⋮</b> do Chrome</span></li>
            <li><span className="n">2</span><span>Toca em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b></span></li>
          </ol>
        )}
        <button className="later" onClick={later}>Agora não</button>
      </div>
    </Sheet>
  )
}
