// Duplas (Ricardo↔Gabriel, Ricardo↔Sara) no demo. Uso: vite na 5182 + `node qa/duplas.mjs`
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const OUT = 'qa/verifica'; mkdirSync(OUT, { recursive: true })
const BASE = process.env.FRANGO_URL ?? 'http://localhost:5182/'
const res = []
const ok = (n, c, i = '') => res.push(`${c ? 'OK  ' : 'FALHA'} ${n} ${i}`)

async function open(b, q) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'pt-BR' })
  await ctx.route(/supabase\.co/, r => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await ctx.addInitScript(() => { localStorage.setItem('frango.install.later', '9999999999999'); localStorage.setItem('frango.dicas3', '1') })
  const page = await ctx.newPage(); const errs = []
  page.on('pageerror', e => errs.push(e.message))
  await page.goto(BASE + q); await page.waitForSelector('.dock'); await page.waitForTimeout(500)
  return { page, errs }
}
const feedNames = p => p.evaluate(() => [...document.querySelectorAll('.screen:nth-child(1) .who-top b')].map(x => x.textContent))
const postNames = p => p.evaluate(() => [...document.querySelectorAll('.screen:nth-child(1) .post-top b')].map(x => x.textContent))
const tabTo = (p, l) => p.click(`.tabs button[aria-label="${l}"]`).then(() => p.waitForTimeout(700))

const b = await chromium.launch()
// ---- Ricardo
{
  const { page: p, errs } = await open(b, '?demo')
  const seg = p.locator('.dupla-seg button')
  ok('Ricardo: seletor com 2 duplas', await seg.count() === 2, await seg.allTextContents())
  const sara = p.locator('.dupla-seg button', { hasText: 'Sara' })
  const gab = p.locator('.dupla-seg button', { hasText: 'Gabriel' })
  ok('Gabriel é o padrão', (await feedNames(p)).join() === 'Ricardo,Gabriel', (await feedNames(p)).join())
  const posts = async () => (await p.locator('.screen:nth-child(1) .post').allTextContents()).join('|')
  ok('dupla Gabriel: post "só Sara" escondido', !(await posts()).includes('só Sara'))
  ok('dupla Gabriel: sem Sara no feed', !(await posts()).includes('Sara'))
  await p.screenshot({ path: `${OUT}/duplas-ricardo-gabriel.png` })
  await sara.click(); await p.waitForTimeout(500)
  ok('dupla Sara: placar mostra Ricardo e Sara', (await feedNames(p)).join() === 'Ricardo,Sara', (await feedNames(p)).join())
  ok('dupla Sara: sem Gabriel no feed', !(await posts()).includes('Gabriel'))
  ok('dupla Sara: post "só Sara" aparece', (await posts()).includes('só Sara'))
  ok('persistiu em localStorage', await p.evaluate(() => localStorage.getItem('frango.dupla')) === 'sara')
  await p.screenshot({ path: `${OUT}/duplas-ricardo-sara.png` })
  await tabTo(p, 'Evolução')
  const evoTabs = await p.locator('.screen:nth-child(3) .seg button').allTextContents()
  ok('Evolução: Ricardo | Sara | Lado a lado', evoTabs.join() === 'Ricardo,Sara,Lado a lado', evoTabs.join())
  await p.locator('.screen:nth-child(3) .seg button', { hasText: 'Lado a lado' }).click(); await p.waitForTimeout(500)
  const th = (await p.locator('.screen:nth-child(3) .tr.th').textContent())
  ok('Placar só Ricardo e Sara', th.includes('Sara') && th.includes('Ricardo') && !th.includes('Gabriel'), th)
  await p.screenshot({ path: `${OUT}/duplas-evolucao-sara.png` })
  await tabTo(p, 'Feed'); await gab.click(); await p.waitForTimeout(500)
  await tabTo(p, 'Evolução')
  ok('Evolução volta com Gabriel', (await p.locator('.screen:nth-child(3) .tr.th').textContent()).includes('Gabriel'))
  // check-in: chips de "quem vê"
  await p.click('.fab'); await p.waitForTimeout(500)
  ok('tema do Ricardo é verde', (await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--g').trim())) === '#1eff7a')
  ok('sem erros de JS', errs.length === 0, errs.join(';'))
}
// ---- Sara
{
  const { page: p, errs } = await open(b, '?demo&sara')
  ok('Sara: sem seletor', await p.locator('.dupla-seg').count() === 0)
  ok('Sara: tema rosa', (await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--g').trim())).toLowerCase() === '#ff4fa3')
  const all = async () => p.evaluate(() => document.body.innerText)
  for (const l of ['Feed', 'Hoje', 'Evolução', 'Perfil']) { await tabTo(p, l); ok(`Sara: sem Gabriel na aba ${l}`, !/gabriel/i.test(await all())) }
  await tabTo(p, 'Feed')
  ok('Sara vê Ricardo e ela', (await feedNames(p)).join() === 'Ricardo,Sara', (await feedNames(p)).join())
  await p.screenshot({ path: `${OUT}/duplas-sara-rosa.png` })
  ok('sem erros de JS', errs.length === 0, errs.join(';'))
}
await b.close()
console.log(res.join('\n'))
process.exit(res.some(r => r.startsWith('FALHA')) ? 1 : 0)
