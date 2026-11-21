// Checagem rápida dos pontos que o Ricardo reclamou (v0.7). Uso: vite na 5182 + `node qa/verifica.mjs`
import { chromium, webkit } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = 'qa/verifica'
mkdirSync(OUT, { recursive: true })
const URL_ = process.env.FRANGO_URL ?? 'http://localhost:5182/?demo'
const res = []
const ok = (name, cond, info = '') => { res.push(`${cond ? 'OK  ' : 'FALHA'} ${name} ${info}`) }

async function open(bt, vp, dbOk = false) {
  const b = await (bt === 'webkit' ? webkit : chromium).launch()
  const ctx = await b.newContext({ viewport: vp, hasTouch: true, isMobile: bt === 'chromium', deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'pt-BR' })
  // banco de produção nunca é tocado: tudo é respondido aqui (401 = recusa; dbOk = finge sucesso)
  await ctx.route(/supabase\.co/, r => r.fulfill(dbOk ? { status: 200, contentType: 'application/json', body: '{}' } : { status: 401, contentType: 'application/json', body: '{"message":"bot"}' }))
  await ctx.addInitScript(() => { localStorage.setItem('frango.install.later', '9999999999999'); localStorage.setItem('frango.dicas', '1') })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(e.message))
  await page.goto(URL_); await page.waitForSelector('.dock'); await page.waitForTimeout(600)
  const cdp = bt === 'chromium' ? await ctx.newCDPSession(page) : null
  return { b, page, errs, cdp }
}
// arrasto com toque real (Chromium/CDP)
async function drag(P, x0, y0, x1, y1, ms = 300, steps = 12) {
  const { cdp } = P
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }] })
    await new Promise(r => setTimeout(r, ms / steps))
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await new Promise(r => setTimeout(r, 600))
}
const tab = P => P.page.evaluate(() => document.querySelector('.tabs button.on span').textContent)
const img = async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 800, height: 600 } })
  await p.setContent('<canvas id=c width=800 height=600></canvas><script>const g=c.getContext("2d");g.fillStyle="#357";g.fillRect(0,0,800,600);g.fillStyle="#fc9";g.beginPath();g.arc(500,260,150,0,7);g.fill()</script>')
  const buf = await p.locator('#c').screenshot({ type: 'jpeg' }); await b.close(); return buf
}

const PHOTO = await img()

// ---- S23 (Chromium, toque real)
{
  const P = await open('chromium', { width: 360, height: 780 }, true)
  const { page } = P
  await page.screenshot({ path: `${OUT}/s23-feed.png` })
  // 1. foto de perfil preenche o círculo (Perfil e Feed)
  await page.locator('.tabs button').nth(3).click(); await page.waitForTimeout(500)
  await page.locator('.av-edit input').setInputFiles({ name: 'eu.jpg', mimeType: 'image/jpeg', buffer: PHOTO })
  await page.waitForSelector('.crop'); await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/s23-editor-redondo.png` })
  await page.getByRole('button', { name: 'Usar' }).click(); await page.waitForTimeout(800)
  const av = await page.evaluate(() => { const a = document.querySelectorAll('main')[3].querySelector('.av'); const i = a.querySelector('img'); return [a.offsetWidth, i?.offsetWidth ?? 0] })
  ok('avatar no Perfil preenche o círculo', av[0] === 64 && av[1] === 64, JSON.stringify(av))
  await page.screenshot({ path: `${OUT}/s23-perfil-foto.png` })
  await page.locator('.tabs button').nth(0).click(); await page.waitForTimeout(500)
  const av2 = await page.evaluate(() => [...document.querySelectorAll('main')[0].querySelectorAll('.av.mine')].map(a => [a.offsetWidth, a.querySelector('img')?.offsetWidth ?? 0]))
  ok('avatar no Feed preenche o círculo', av2.every(([a, i]) => a === i && a > 0), JSON.stringify(av2))
  await page.screenshot({ path: `${OUT}/s23-feed-avatar.png` })

  // 2. deslizar em cima da FOTO do antes/depois (longe da alça) troca de aba
  await page.evaluate(() => document.querySelectorAll('main')[0].scrollTo(0, 260)); await page.waitForTimeout(300)
  const r = await page.evaluate(() => { const c = document.querySelectorAll('main')[0].querySelector('.cmp').getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height } })
  const yy = r.t + r.h * 0.4
  const bar0 = await page.evaluate(() => document.querySelectorAll('main')[0].querySelector('.cmp .bar').style.left)
  await drag(P, r.l + r.w * 0.9, yy, r.l + r.w * 0.1, yy, 250)
  ok('deslizar em cima da foto troca de aba', (await tab(P)) === 'Hoje', await tab(P))
  const bar1 = await page.evaluate(() => document.querySelectorAll('main')[0].querySelector('.cmp .bar').style.left)
  ok('a barra do antes/depois não se mexeu', bar0 === bar1, `${bar0} → ${bar1}`)
  await drag(P, 40, 300, 330, 300, 250) // volta
  // 3. arrastar PELA ALÇA mexe a barra e não troca de aba
  const hx = r.l + r.w / 2
  await drag(P, hx, yy, hx - r.w * 0.3, yy, 400)
  const bar2 = await page.evaluate(() => document.querySelectorAll('main')[0].querySelector('.cmp .bar').style.left)
  ok('arrastar pela alça mexe o antes/depois', bar2 !== '50%', bar2)
  ok('arrastar pela alça não troca de aba', (await tab(P)) === 'Feed', await tab(P))
  // 4. rolar a página com o dedo na foto não mexe a barra
  await drag(P, r.l + r.w * 0.85, yy + 100, r.l + r.w * 0.85, yy - 150, 300)
  const bar3 = await page.evaluate(() => document.querySelectorAll('main')[0].querySelector('.cmp .bar').style.left)
  ok('rolar com o dedo na foto não mexe a barra', bar3 === bar2, `${bar2} → ${bar3}`)
  // 5. trilho: arrasto curto volta pro lugar, sem piscar
  await drag(P, 200, 200, 160, 200, 300)
  const tr = await page.evaluate(() => { const m = document.querySelectorAll('main'); return [document.querySelector('.tabs button.on span').textContent, getComputedStyle(document.querySelector('.pager')).getPropertyValue('--dx').trim(), Math.round(m[0].getBoundingClientRect().left)] })
  ok('arrasto curto volta pro lugar', tr[0] === 'Feed' && tr[2] === 0, JSON.stringify(tr))
  // meio do arrasto: aba vizinha aparece junto
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 200 }] })
  for (let i = 1; i <= 8; i++) await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - i * 20, y: 200 }] })
  await page.waitForTimeout(100)
  await page.screenshot({ path: `${OUT}/s23-arrastando.png` })
  const mid = await page.evaluate(() => [...document.querySelectorAll('main')].slice(0, 2).map(m => Math.round(m.getBoundingClientRect().left)))
  ok('no meio do arrasto a aba segue o dedo 1:1 e a próxima aparece', mid[0] === -160 && mid[1] === 200, JSON.stringify(mid))
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(600)
  ok('soltou depois de 160px → foi pra Hoje', (await tab(P)) === 'Hoje', await tab(P))
  // 6. deslizar dentro do sheet de categorias NÃO troca de aba
  await page.locator('main').nth(1).locator('.big-q.yes').click(); await page.waitForSelector('.sheet-card'); await page.waitForTimeout(500)
  await drag(P, 300, 600, 40, 600, 250)
  ok('deslizar dentro do sheet não troca de aba', (await tab(P)) === 'Hoje' && (await page.locator('.sheet-card').count()) === 1, await tab(P))
  await page.screenshot({ path: `${OUT}/s23-sheet.png` })
  // 7. botão voltar fecha o sheet (e não sai do app)
  await page.goBack(); await page.waitForTimeout(500)
  ok('voltar fecha o sheet', (await page.locator('.sheet-card').count()) === 0 && page.url().includes('localhost'))
  // 8. rolagem e rascunho mantidos ao trocar de aba
  await page.locator('.tabs button').nth(0).click(); await page.waitForTimeout(500)
  await page.evaluate(() => document.querySelectorAll('main')[0].scrollTo(0, 700)); await page.locator('main').nth(0).locator('.cmt-form input').first().fill('rascunho 🐔')
  await page.locator('.tabs button').nth(1).click(); await page.waitForTimeout(500)
  await page.locator('.tabs button').nth(0).click(); await page.waitForTimeout(500)
  const keep = await page.evaluate(() => [document.querySelectorAll('main')[0].scrollTop, document.querySelectorAll('main')[0].querySelector('.cmt-form input').value])
  ok('volta na mesma rolagem e com o rascunho', keep[0] > 600 && keep[1] === 'rascunho 🐔', JSON.stringify(keep))
  // 9. Evolução: trocar Ricardo → Gabriel e ângulos não derruba
  await page.locator('.tabs button').nth(2).click(); await page.waitForTimeout(500)
  for (const n of ['Gabriel', 'Ricardo', 'Lado a lado', 'Ricardo']) { await page.locator('main').nth(2).getByRole('button', { name: n, exact: true }).click(); await page.waitForTimeout(250) }
  for (const a of ['lado', 'costas', 'frente']) { await page.locator('main').nth(2).locator('.chips button', { hasText: a }).click(); await page.waitForTimeout(250) }
  ok('Evolução sem crash trocando pessoa/ângulo', P.errs.length === 0 && (await page.locator('.dock').count()) === 1, P.errs.join(' | '))
  await page.screenshot({ path: `${OUT}/s23-evolucao.png` })
  // 10. documento nunca desloca
  const doc = await page.evaluate(() => [scrollX, document.scrollingElement.scrollWidth, innerWidth])
  ok('documento do tamanho da tela', doc[0] === 0 && doc[1] === doc[2], JSON.stringify(doc))
  await P.b.close()
}
{
  // 11. botão de postar: texto sem rosa e destrava depois de erro (banco recusando)
  const P = await open('chromium', { width: 360, height: 780 })
  const { page } = P
  await page.locator('.fab').click(); await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Pular' }).click(); await page.waitForTimeout(400)
  const hold = page.locator('.hold')
  const hb = await hold.boundingBox()
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }] })
  await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/s23-segurando.png` })
  await page.waitForTimeout(700)
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(1500)
  ok('depois do erro ao postar o botão destrava', (await hold.innerText()).includes('Segura pra postar'), JSON.stringify(await hold.innerText()))
  await page.screenshot({ path: `${OUT}/s23-checkin-form.png` })
  await P.b.close()
}

// ---- iPhone SE 320 (WebKit): sheets rolam e cabem, nada estoura a lateral
for (const vp of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 430, height: 932 }]) {
  const P = await open('webkit', vp)
  const { page } = P
  const tag = vp.width + 'x' + vp.height
  for (let i = 0; i < 4; i++) {
    await page.locator('.tabs button').nth(i).click(); await page.waitForTimeout(500)
    const over = await page.evaluate(i => { const W = innerWidth; return [...document.querySelectorAll('main')[i].querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > W + 1 || r.left < -1) && !e.closest('.ruler-track, .cmp') }).map(e => e.className).slice(0, 4) }, i)
    ok(`${tag} aba ${i} nada estoura a lateral`, over.length === 0, JSON.stringify(over))
    await page.screenshot({ path: `${OUT}/${tag}-aba${i}.png` })
  }
  await page.locator('.tabs button').nth(1).click(); await page.waitForTimeout(400)
  await page.locator('main').nth(1).locator('.big-q.yes').click(); await page.waitForSelector('.sheet-card'); await page.waitForTimeout(500)
  const sh = await page.evaluate(() => { const c = document.querySelector('.sheet-card'); const b = [...c.querySelectorAll('.kinds button')].map(x => x.getBoundingClientRect().right); return { fits: Math.max(...b) <= innerWidth, scroll: c.scrollHeight > c.clientHeight, ta: getComputedStyle(c).touchAction } })
  ok(`${tag} sheet categorias cabe na largura`, sh.fits, JSON.stringify(sh))
  ok(`${tag} sheet rola com o dedo se precisar`, sh.ta.includes('pan-y'), sh.ta)
  await page.screenshot({ path: `${OUT}/${tag}-sheet.png` })
  await P.b.close()
}
// aviso de instalar no SE: "Agora não" alcançável
{
  const b = await webkit.launch()
  const ctx = await b.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' })
  await ctx.route(/supabase\.co/, r => r.fulfill({ status: 401, body: '{}' }))
  const page = await ctx.newPage(); await page.goto('http://localhost:5182/'); await page.waitForSelector('.install'); await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/se320-instalar.png` })
  const later = await page.evaluate(() => { const c = document.querySelector('.sheet-card'); c.scrollTop = 9999; const r = document.querySelector('.install .later').getBoundingClientRect(); return [Math.round(r.bottom), innerHeight] })
  ok('SE 320: "Agora não" alcançável', later[0] <= later[1], JSON.stringify(later))
  await b.close()
}

// virada da meia-noite com o app aberto: Hoje passa pro dia novo sozinho
{
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true, serviceWorkers: 'block', timezoneId: 'America/Sao_Paulo' })
  await ctx.route(/supabase\.co/, r => r.fulfill({ status: 401, body: '{}' }))
  await ctx.addInitScript(() => { localStorage.setItem('frango.install.later', '9999999999999'); localStorage.setItem('frango.dicas', '1') })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date('2026-11-22T23:58:30-03:00') }) // domingo
  await page.goto(URL_); await page.waitForSelector('.dock'); await page.waitForTimeout(500)
  await page.locator('.tabs button').nth(1).click(); await page.waitForTimeout(500)
  const before = await page.evaluate(() => [document.querySelectorAll('main')[1].querySelector('.h').textContent, document.querySelectorAll('main')[1].querySelector('.days .sel b').textContent])
  await page.clock.runFor(3 * 60e3); await page.waitForTimeout(300)
  const after = await page.evaluate(() => [document.querySelectorAll('main')[1].querySelector('.h').textContent, document.querySelectorAll('main')[1].querySelector('.days .sel b')?.textContent])
  ok('meia-noite: Hoje vira pro dia novo (segunda 23)', before[1] === '22' && after[0] === 'Hoje você treinou?' && after[1] === '23', JSON.stringify([before, after]))
  await b.close()
}
// curtir/descurtir com o banco ok: cada toque (com o anterior já respondido) inverte
{
  const P = await open('chromium', { width: 360, height: 780 }, true)
  const like = P.page.locator('main').nth(0).locator('.like').first()
  const st = () => like.evaluate(e => e.classList.contains('on'))
  const s0 = await st(); await like.click(); await P.page.waitForTimeout(300)
  const s1 = await st(); await like.click(); await P.page.waitForTimeout(300)
  const s2 = await st(); await like.click(); await P.page.waitForTimeout(300)
  const s3 = await st()
  ok('curtir/descurtir inverte a cada toque', s1 !== s0 && s2 === s0 && s3 !== s0, JSON.stringify([s0, s1, s2, s3]))
  await P.b.close()
}

console.log(res.join('\n'))
