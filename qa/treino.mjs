// v2.2.1: treino vira post no feed. Uso: vite na 5182 + `node qa/treino.mjs`
// Cenário real (23/nov): o Gabriel fez check-in HOJE depois do treino do Ricardo; o treino salvo tem que ir pro topo.
import { chromium, webkit } from 'playwright'
const res = []
const ok = (n, c, i = '') => res.push(`${c ? 'OK  ' : 'FALHA'} ${n} ${i}`)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
// nenhum filho do sheet pode montar em cima de outro
const overlap = page => page.evaluate(() => {
  const els = [...document.querySelector('.sheet-card').children].filter(e => e.getClientRects().length && !e.classList.contains('grab')) // inclui altura 0 (foi assim que o bug da foto escapou)
  const bad = []
  // usa o conteúdo de dentro (filho espremido deixa os botões vazarem pra fora da caixa dele)
  const box = e => [e, ...e.querySelectorAll('*')].map(x => x.getBoundingClientRect()).filter(r => r.height).reduce((m, r) => ({ top: Math.min(m.top, r.top), bottom: Math.max(m.bottom, r.bottom) }), { top: 1e9, bottom: -1e9 })
  for (let i = 1; i < els.length; i++) { const a = box(els[i - 1]), b = box(els[i]); if (b.top < a.bottom - 1) bad.push(els[i - 1].className + ' x ' + els[i].className) }
  els.forEach(e => { if (e.scrollHeight > e.clientHeight + 2) bad.push('espremido: ' + e.className) })
  return bad
})

for (const [bt, vp] of [['chromium', { width: 369, height: 800 }], ['chromium', { width: 360, height: 640 }], ['webkit', { width: 390, height: 844 }]]) {
  const tag = `[${bt} ${vp.width}x${vp.height}]`
  const b = await (bt === 'webkit' ? webkit : chromium).launch()
  const ctx = await b.newContext({ viewport: vp, hasTouch: true, isMobile: bt === 'chromium', deviceScaleFactor: 2, serviceWorkers: 'block' })
  await ctx.route(/supabase\.co/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"path":"x"}' })) // finge sucesso, nunca toca produção
  await ctx.addInitScript(() => { localStorage.setItem('frango.install.later', '9999999999999'); localStorage.setItem('frango.dicas3', '1') })
  const page = await ctx.newPage()
  const errs = []; page.on('pageerror', e => errs.push(e.message))
  await page.goto('http://localhost:5182/?demo'); await page.waitForSelector('.dock'); await page.waitForTimeout(600)
  const feed = page.locator('main').nth(0)
  const firstPost = async () => (await feed.locator('.post').first().innerText()).replace(/\s+/g, ' ')

  ok(`${tag} feed tem posts de treino`, await feed.locator('.day-post').count() > 5)
  ok(`${tag} check-in de hoje do Gabriel (mais recente) fica em cima`, /Gabriel.*check-in/.test(await firstPost()), (await firstPost()).slice(0, 60))
  ok(`${tag} furou e besteira aparecem`, await feed.locator('.day-post.off').count() > 0 && /besteira/.test(await feed.innerText()))

  const hoje = async () => { await page.locator('.dock button[aria-label="Hoje"]').click(); await page.waitForTimeout(500) }
  const toFeed = async () => { await page.locator('.dock button[aria-label="Feed"]').click(); await page.waitForTimeout(600) }

  // 1) editar o treino de hoje: observação + foto
  await hoje()
  await page.locator('main').nth(1).locator('.big-q.yes').click(); await page.waitForTimeout(600)
  ok(`${tag} sheet sem nada sobreposto`, (await overlap(page)).length === 0, (await overlap(page)).join(' | '))
  ok(`${tag} observação vem preenchida`, (await page.locator('.obs').inputValue()) === 'Fiz 18 barras. Bora.')
  await page.locator('.obs').fill('Joguei basquete hoje')
  await page.locator('.obs-photo input[type=file]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: png })
  await page.waitForSelector('.obs-photo img', { timeout: 4000 }).catch(() => {})
  ok(`${tag} foto aparece no sheet`, await page.locator('.obs-photo img').count() === 1)
  ok(`${tag} sheet com foto sem nada sobreposto`, (await overlap(page)).length === 0, (await overlap(page)).join(' | '))
  await page.screenshot({ path: `qa/treino-sheet-${bt}-${vp.width}.png` })
  await page.getByRole('button', { name: 'Salvar treino' }).click(); await page.waitForTimeout(800)
  await toFeed()
  let top = await firstPost()
  ok(`${tag} treino salvo vai pro TOPO do feed`, /Ricardo treinou/.test(top) && /basquete/.test(top), top.slice(0, 70))
  ok(`${tag} foto do treino no post`, await feed.locator('.post').first().locator('.day-photo').count() === 1)
  await page.screenshot({ path: `qa/treino-feed-${bt}-${vp.width}.png` })

  // 2) desmarcar e marcar de novo do zero (primeiro registro do dia)
  await hoje()
  await page.locator('main').nth(1).locator('.big-q.yes').click(); await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'desmarcar treino' }).click(); await page.waitForTimeout(500)
  await toFeed()
  ok(`${tag} desmarcou: treino sai do topo`, !/Ricardo treinou/.test(await firstPost()))
  await hoje()
  await page.locator('main').nth(1).locator('.big-q.yes').click(); await page.waitForTimeout(500)
  ok(`${tag} sheet novo começa vazio`, (await page.locator('.obs').inputValue()) === '' && await page.locator('.obs-photo img').count() === 0)
  await page.locator('.kinds button', { hasText: 'Calistenia' }).click()
  await page.locator('.obs').fill('Barra fixa')
  await page.getByRole('button', { name: 'Marcar treino' }).click(); await page.waitForTimeout(800)
  const btn = await page.locator('main').nth(1).locator('.big-q.yes').innerText()
  ok(`${tag} botão Treinei mostra a categoria`, /Calistenia|🤸/.test(btn), JSON.stringify(btn))
  await toFeed()
  top = await firstPost()
  ok(`${tag} primeiro registro do dia vai pro TOPO`, /Ricardo treinou.*Calistenia/.test(top) && /Barra fixa/.test(top), top.slice(0, 70))
  ok(`${tag} sem erro de JS`, errs.length === 0, errs.join(' | '))
  await b.close()
}
console.log(res.join('\n'))
process.exit(res.some(r => r.startsWith('FALHA')) ? 1 : 0)
