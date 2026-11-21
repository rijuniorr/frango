// Bot do SOM: abre o check-in como no celular (toque no botão verde) e confere se o áudio liga e se os bips tocam.
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=user-gesture-required'] })
const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true, serviceWorkers: 'block', permissions: ['camera'] })
await ctx.route(/supabase\.co/, r => r.fulfill({ status: 401, body: '{}' }))
await ctx.addInitScript(() => {
  localStorage.setItem('frango.install.later', '9999999999999'); localStorage.setItem('frango.dicas2', '1')
  window.__ctxs = []; window.__beeps = 0
  const AC = window.AudioContext
  window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ctxs.push(this) } }
  const st = OscillatorNode.prototype.start
  OscillatorNode.prototype.start = function (...a) { window.__beeps++; return st.apply(this, a) }
})
const p = await ctx.newPage()
const errs = []; p.on('pageerror', e => errs.push(e.message))
await p.goto(process.env.FRANGO_URL ?? 'http://localhost:5182/?demo'); await p.waitForSelector('.dock')
await p.locator('.fab').tap() // único toque: o que abre a câmera
await p.waitForTimeout(2500)
const st1 = await p.evaluate(() => window.__ctxs.map(c => c.state))
await p.locator('.shoot').tap() // 3-2-1 (bipa a cada segundo)
await p.waitForTimeout(3500)
const beeps = await p.evaluate(() => window.__beeps)
const ok = st1.includes('running') && beeps >= 3 && !errs.length
console.log(ok ? 'SOM OK' : 'SOM FALHOU', { estados: st1, bips: beeps, errs })
await b.close()
process.exit(ok ? 0 : 1)
