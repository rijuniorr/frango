import { useEffect, useState } from 'react'
import { hap } from './lib'
import { Sheet } from './ui'

// O aviso "pode instalar" do Chrome é guardado no index.html (window.__bip), antes do app carregar.
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
const w = window as unknown as { __bip: BIP | null; __installed?: boolean }

const ua = navigator.userAgent
const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
const iosChrome = ios && /CriOS|FxiOS|EdgiOS/.test(ua)
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const KEY = 'frango.install.later'

// já está instalado neste celular? (Android Chrome; usa related_applications do manifest)
async function installedHere() {
  const nav = navigator as { getInstalledRelatedApps?: () => Promise<unknown[]> }
  try { return w.__installed || ((await nav.getInstalledRelatedApps?.())?.length ?? 0) > 0 } catch { return false }
}
const waitBip = (ms: number) => new Promise<BIP | null>(res => {
  if (w.__bip) return res(w.__bip)
  const f = () => { removeEventListener('frango:bip', f); res(w.__bip) }
  addEventListener('frango:bip', f)
  setTimeout(() => { removeEventListener('frango:bip', f); res(w.__bip) }, ms)
})

const Share = () => <svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" /></svg>
const Plus = () => <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></svg>

export default function Install() {
  const [open, setOpen] = useState(() => {
    if (standalone()) return false
    try { return Date.now() - +(localStorage.getItem(KEY) ?? 0) > 864e5 } catch { return true }
  })
  const [state, setState] = useState<'idle' | 'wait' | 'manual' | 'already' | 'done'>('idle')
  useEffect(() => {
    const o = () => { setState('idle'); setOpen(true) }
    const b = () => { if (w.__installed) { setState('done') } }
    addEventListener('frango:install', o); addEventListener('frango:bip', b)
    installedHere().then(x => x && setState('already'))
    return () => { removeEventListener('frango:install', o); removeEventListener('frango:bip', b) }
  }, [])

  if (!open) return null
  const later = () => { try { localStorage.setItem(KEY, String(Date.now())) } catch { /* */ } setOpen(false) }

  async function install() {
    hap(12)
    setState('wait')
    const ev = await waitBip(6000) // o Chrome às vezes demora uns segundos pra liberar
    if (!ev) { setState((await installedHere()) ? 'already' : 'manual'); return }
    await ev.prompt() // a janela "Instalar Frango?" do próprio navegador
    const r = await ev.userChoice
    w.__bip = null
    if (r.outcome === 'accepted') { setState('done'); hap([20, 40, 60]); setTimeout(() => setOpen(false), 1800) }
    else setState('idle')
  }

  return (
    <Sheet onClose={later}>
      <div className="install">
        <img src="./icon-192.png" alt="" className="install-icon" />
        <h3>{state === 'done' ? 'Instalado!' : state === 'already' ? 'Já tá instalado' : 'Instala o Frango'}</h3>

        {state === 'done' ? (
          <p>O ícone do Frango tá na tua tela inicial. Abre por ele daqui pra frente.</p>
        ) : state === 'already' ? (
          <>
            <p>O Frango já tá na tua tela inicial. Fecha o navegador e abre pelo ícone.</p>
            <button className="btn big" onClick={later}>Beleza</button>
          </>
        ) : ios ? (
          <>
            <p>No iPhone a Apple não deixa site instalar sozinho. São 2 toques:</p>
            <ol className="steps">
              <li><span className="n">1</span><span>Toca em <b>Compartilhar</b> <Share /> {iosChrome ? 'no topo, do lado do endereço' : 'na barra de baixo do Safari'}</span></li>
              <li><span className="n">2</span><span>Desce e toca em <b>Adicionar à Tela de Início</b> <Plus /> e depois em <b>Adicionar</b></span></li>
            </ol>
            {!iosChrome && <i className="ios-arrow" aria-hidden="true"><Share /></i>}
          </>
        ) : state === 'manual' ? (
          <>
            <p>O navegador não liberou o botão agora. Faz assim:</p>
            <ol className="steps">
              <li><span className="n">1</span><span>Toca no menu <b>⋮</b> do Chrome (canto de cima)</span></li>
              <li><span className="n">2</span><span>Toca em <b>Instalar app</b> e confirma</span></li>
            </ol>
            <button className="btn big" onClick={install}>Tentar de novo</button>
          </>
        ) : (
          <>
            <p>Fica na tela inicial igual app, abre em tela cheia e a câmera funciona melhor.</p>
            <button className="btn big" onClick={install} disabled={state === 'wait'}>{state === 'wait' ? 'Abrindo…' : 'Instalar agora'}</button>
          </>
        )}
        {state !== 'done' && state !== 'already' && <button className="later" onClick={later}>Agora não</button>}
        {ios && !iosChrome && <i className="arrow-room" aria-hidden="true" />}
      </div>
    </Sheet>
  )
}
