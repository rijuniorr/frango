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

export default function Install() {
  const [, force] = useState(0)
  const [open, setOpen] = useState(() => {
    if (standalone()) return false
    try { return Date.now() - +(localStorage.getItem(KEY) ?? 0) > 864e5 } catch { return true }
  })
  useEffect(() => { const f = () => force(x => x + 1); subs.add(f); return () => { subs.delete(f) } }, [])

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
          <ol className="ios-steps">
            <li><span className="n">1</span>Toca em <b>Compartilhar</b>
              <svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" /></svg> na barra do Safari</li>
            <li><span className="n">2</span>Rola e toca em <b>Adicionar à Tela de Início</b>
              <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></svg></li>
            <li><span className="n">3</span>Confere o nome <b>Frango</b> e toca em <b>Adicionar</b></li>
          </ol>
        ) : bip ? (
          <button className="btn big" onClick={install}>Instalar agora</button>
        ) : (
          <ol className="ios-steps">
            <li><span className="n">1</span>Toca no menu <b>⋮</b> do Chrome</li>
            <li><span className="n">2</span>Toca em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b></li>
          </ol>
        )}
        <button className="later" onClick={later}>agora não</button>
      </div>
    </Sheet>
  )
}
