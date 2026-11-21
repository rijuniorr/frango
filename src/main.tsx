import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// se algo quebrar, mostra uma tela de "recarregar" em vez de tela preta
class Guard extends Component<{ children: ReactNode }, { err: boolean }> {
  state = { err: false }
  static getDerivedStateFromError() { return { err: true } }
  componentDidCatch(e: unknown) { console.error(e) }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="splash crash">
        <img src="./logo.png" alt="" className="splash-logo" />
        <p>Deu um tropeço aqui.</p>
        <button className="btn" onClick={() => location.reload()}>Recarregar</button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Guard><App /></Guard>
  </StrictMode>,
)

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js')
