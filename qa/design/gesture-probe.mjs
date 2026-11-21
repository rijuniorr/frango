// sonda de gestos com toque real (CDP): rolar vertical em cima do antes/depois, swipe de aba com dedo "torto"
import { chromium } from 'playwright'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })
await ctx.route(/supabase\.co/, r => r.abort())
await ctx.addInitScript(() => localStorage.setItem('frango.install.later', String(Date.now())))
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) })
async function drag(a, z, steps = 12, dt = 16) {
  await touch('touchStart', [a])
  for (let i = 1; i <= steps; i++) { await touch('touchMove', [[a[0] + (z[0] - a[0]) * i / steps, a[1] + (z[1] - a[1]) * i / steps]]); await sleep(dt) }
  await touch('touchEnd', []); await sleep(600)
}
const st = () => page.evaluate(() => ({ tab: document.querySelector('.tabs .on')?.getAttribute('aria-label'), bar: document.querySelector('.cmp .bar')?.style.left, top: Math.round(document.querySelector('.screen').scrollTop) }))
await page.goto('http://localhost:5181/?demo'); await page.waitForSelector('.dock'); await sleep(800)
await page.evaluate(() => document.querySelector('.screen').scrollTop = 330); await sleep(300)
const cb = await page.locator('.cmp').first().boundingBox()
console.log('antes', await st())
// rolar a página pra cima com o polegar em cima da foto, à direita (onde o polegar fica)
await drag([cb.x + cb.width * 0.8, cb.y + cb.height * 0.7], [cb.x + cb.width * 0.78, cb.y + cb.height * 0.2])
console.log('rolagem vertical começando na foto (x=80%)', await st())
// toque simples (tap) na foto
await touch('touchStart', [[cb.x + cb.width * 0.2, cb.y + 100]]); await sleep(60); await touch('touchEnd', []); await sleep(300)
console.log('tap na foto (x=20%)', await st())
// swipe de aba com leve inclinação (30°) fora da foto
await page.evaluate(() => document.querySelector('.screen').scrollTop = 0); await sleep(300)
await drag([300, 330], [80, 230])
console.log('swipe inclinado ~25° no cartão do check-in', await st())
// swipe em cima do cartão de pessoa
await page.click('.tabs button[aria-label="Feed"]'); await sleep(600)
await drag([320, 150], [60, 150], 8, 12)
console.log('swipe em cima do card do Gabriel', await st())
// mede o deslocamento máximo visível durante o arrasto (45% do dedo)
await page.click('.tabs button[aria-label="Feed"]'); await sleep(600)
await touch('touchStart', [[320, 60]])
for (let i = 1; i <= 10; i++) { await touch('touchMove', [[320 - i * 25, 60]]); await sleep(16) }
console.log('dedo andou 250px → tela andou', await page.evaluate(() => document.querySelector('.screen').style.transform))
await touch('touchEnd', [])
await sleep(30)
console.log('30ms após soltar:', await page.evaluate(() => { const s = document.querySelector('.screen'); return { cls: s.className, t: getComputedStyle(s).transform, o: getComputedStyle(s).opacity } }))
await b.close()
