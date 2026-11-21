// bot de crítica visual do FRANGO — só lê/fotografa, não muda nada no app.
// uso: node bot.mjs [viewport...]   (servidor dev em :5181, modo ?demo)
import { chromium, webkit } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:5181/'
const OUT = path.resolve('shots')
const VPS = {
  s23: { engine: chromium, w: 360, h: 780, dpr: 3, android: true },
  se1: { engine: webkit, w: 320, h: 568, dpr: 2 },
  se2: { engine: webkit, w: 375, h: 667, dpr: 2 },
  ip15: { engine: webkit, w: 390, h: 844, dpr: 3 },
  promax: { engine: webkit, w: 430, h: 932, dpr: 3 },
  // chromium com safe-area simulada (notch 59 / barra de gestos 34) pra ver o que encosta
  'ip15-notch': { engine: chromium, w: 390, h: 844, dpr: 3, insets: { top: 59, bottom: 34 } },
  'se1-chromium': { engine: chromium, w: 320, h: 568, dpr: 2 },
}
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const report = {}
const BROWSERS = []
const sleep = ms => new Promise(r => setTimeout(r, ms))

// foto de teste retangular (não quadrada) com rosto/corpo, pra testar o editor
async function makePhoto(browser) {
  const p = await browser.newPage({ viewport: { width: 900, height: 1200 } })
  await p.setContent(`<body style="margin:0;background:linear-gradient(160deg,#2b3a55,#c96b3c)">
    <div style="position:absolute;left:330px;top:160px;width:240px;height:300px;border-radius:50%;background:#e9b48f"></div>
    <div style="position:absolute;left:390px;top:270px;width:30px;height:30px;border-radius:50%;background:#222"></div>
    <div style="position:absolute;left:480px;top:270px;width:30px;height:30px;border-radius:50%;background:#222"></div>
    <div style="position:absolute;left:220px;top:470px;width:460px;height:700px;border-radius:120px 120px 0 0;background:#1b6b45"></div>
    <div style="position:absolute;left:20px;top:20px;font:700 60px sans-serif;color:#fff">TOPO-ESQ</div>
    <div style="position:absolute;right:20px;bottom:20px;font:700 60px sans-serif;color:#fff">BAIXO-DIR</div></body>`)
  const buf = await p.screenshot({ type: 'png' })
  await p.close()
  return buf
}

// mede alvos de toque pequenos, coisas saindo da tela, textos cortados
const AUDIT = () => {
  const vw = innerWidth, out = { small: [], offscreen: [], clipped: [] }
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const name = el => (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
  for (const el of document.querySelectorAll('button, label, input, textarea, a, [role=button]')) {
    if (!vis(el) || (el.tagName === 'INPUT' && el.type === 'file')) continue
    const r = el.getBoundingClientRect()
    if (r.width < 44 || r.height < 44) out.small.push(`${el.tagName.toLowerCase()}.${(typeof el.className === 'string' ? el.className : '').split(' ')[0]} "${name(el)}" ${Math.round(r.width)}×${Math.round(r.height)}`)
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    if (r.right > vw + 1 || r.left < -1) { if (!el.closest('.ruler-track, .crop-box')) out.offscreen.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${name(el)}" ${Math.round(r.left)}→${Math.round(r.right)}`) }
    if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.clipped.push(`${el.tagName.toLowerCase()} "${name(el)}"`)
    // texto que quebrou em várias linhas dentro de algo pequeno
  }
  out.small = [...new Set(out.small)]; out.offscreen = [...new Set(out.offscreen)].slice(0, 25)
  return out
}

async function run(key) {
  const v = VPS[key]
  const dir = path.join(OUT, key)
  fs.mkdirSync(dir, { recursive: true })
  // rede travada: tudo passa por um proxy morto, menos o servidor local e as fontes (no WebKit o page.route não segurou o Supabase)
  const browser = await v.engine.launch({ proxy: { server: 'http://127.0.0.1:9', bypass: 'localhost,127.0.0.1,fonts.googleapis.com,fonts.gstatic.com' + (v.engine === webkit ? ',<-loopback>' : '') } })
  BROWSERS.push(browser)
  const photo = await makePhoto(browser)
  const isChromium = v.engine === chromium
  const ctxOpts = { viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr, hasTouch: true, isMobile: true, colorScheme: 'dark', userAgent: v.android ? UA_ANDROID : UA_IOS, serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' }
  const ctx = await browser.newContext(ctxOpts)
  // o backend é produção: nada sai daqui
  await ctx.route(/supabase\.co/, r => r.abort())
  const page = await ctx.newPage()
  const R = (report[key] = { audit: {}, notes: [], console: [] })
  page.on('console', m => m.type() === 'error' && R.console.push(m.text().slice(0, 200)))
  page.on('pageerror', e => R.console.push('PAGEERROR ' + e.message))
  let cdp = null
  if (isChromium) {
    cdp = await ctx.newCDPSession(page)
    if (v.insets) {
      try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: v.insets.top, topMax: v.insets.top, bottom: v.insets.bottom, bottomMax: v.insets.bottom, left: 0, leftMax: 0, right: 0, rightMax: 0 } }); R.notes.push('safe-area simulada ' + JSON.stringify(v.insets)) } catch (e) { R.notes.push('sem safe-area override: ' + e.message) }
    }
  }
  const shot = async (n, opts = {}) => { await page.screenshot({ path: path.join(dir, n + '.png'), scale: 'css', ...opts }) }
  const audit = async n => { R.audit[n] = await page.evaluate(AUDIT) }
  const tabNow = () => page.evaluate(() => document.querySelector('.tabs button.on')?.getAttribute('aria-label'))
  const scr = (y) => page.evaluate(y => { const s = document.querySelector('.screen'); s.scrollTop = y === 'end' ? s.scrollHeight : y; return [s.scrollTop, s.scrollHeight, s.clientHeight] }, y)
  // toque real (CDP) só no chromium
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) })
  async function drag(from, to, { steps = 12, dt = 16, midShot, hold = 0 } = {}) {
    await touch('touchStart', [from]); if (hold) await sleep(hold)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      await touch('touchMove', [[from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]])
      await sleep(dt)
      if (midShot && i === Math.round(steps * 0.6)) await shot(midShot)
    }
    await touch('touchEnd', [])
    await sleep(500)
  }
  const goTab = async l => { await page.click(`.tabs button[aria-label="${l}"]`); await sleep(600) }

  // ---------- login ----------
  await page.goto(BASE)
  await page.waitForSelector('.login', { timeout: 15000 })
  await sleep(900)
  await shot('00-login-com-aviso-instalar')
  await audit('install-sheet')
  // a sheet de instalar cabe? dá pra rolar?
  R.notes.push('install sheet: ' + JSON.stringify(await page.evaluate(() => { const c = document.querySelector('.sheet-card'); return c && { h: c.getBoundingClientRect().height, sh: c.scrollHeight, vh: innerHeight, top: c.getBoundingClientRect().top, ta: getComputedStyle(c).touchAction } })))
  await page.click('.later')
  await sleep(500)
  await shot('01-login')
  await audit('login')
  await page.click('.login input')
  await sleep(300)
  await shot('02-login-foco')

  // ---------- demo ----------
  await page.evaluate(() => localStorage.setItem('frango.install.later', String(Date.now())))
  await page.goto(BASE + '?demo')
  await page.waitForSelector('.dock')
  await sleep(1200)
  await shot('10-feed-topo')
  await audit('feed')
  let [, sh, ch] = await scr(0)
  for (let y = ch * 0.8, i = 1; y < sh && i < 5; y += ch * 0.8, i++) { await scr(y); await sleep(150); await shot(`11-feed-rolado-${i}`) }
  await scr('end'); await sleep(200); await shot('12-feed-fim')
  // o dock cobre o último conteúdo?
  R.notes.push('feed fim / dock: ' + JSON.stringify(await page.evaluate(() => {
    const d = document.querySelector('.dock .tabs').getBoundingClientRect(), s = document.querySelector('.screen')
    const last = s.lastElementChild.getBoundingClientRect()
    return { dockTop: Math.round(d.top), dockBottom: Math.round(d.bottom), lastBottom: Math.round(last.bottom), vh: innerHeight }
  })))
  await scr(0)

  // estado :active nos cards (toque segurado, sem soltar)
  if (cdp) {
    const b = await page.locator('.post').first().boundingBox()
    await scr(0)
    const pb = await page.locator('.post').first().boundingBox()
    await touch('touchStart', [[pb.x + 40, Math.min(v.h - 150, pb.y + 30)]]); await sleep(250)
    await shot('13-feed-card-pressionado')
    R.notes.push('post :active transform: ' + await page.evaluate(() => getComputedStyle(document.querySelector('.post')).transform))
    await touch('touchEnd', []); await sleep(300)
  }

  // ---------- deslizar entre abas ----------
  if (cdp) {
    const y0 = 70
    await drag([v.w * 0.85, y0], [v.w * 0.15, y0], { midShot: '14-swipe-meio-arrasto' })
    R.notes.push('swipe no header do feed → ' + await tabNow())
    await sleep(60); await shot('15-swipe-apos-soltar')
    await goTab('Feed')
    // em cima do antes/depois
    const cmp = page.locator('.cmp').first()
    await cmp.scrollIntoViewIfNeeded(); await sleep(300)
    const cb = await cmp.boundingBox()
    const before = await page.evaluate(() => document.querySelector('.cmp .bar').style.left)
    await drag([cb.x + cb.width * 0.8, cb.y + cb.height * 0.5], [cb.x + cb.width * 0.1, cb.y + cb.height * 0.5], { midShot: '16-swipe-em-cima-do-antesdepois' })
    R.notes.push(`swipe em cima do antes/depois → aba ${await tabNow()}, barra ${before} → ${await page.evaluate(() => document.querySelector('.cmp .bar')?.style.left)}`)
    await shot('17-antesdepois-apos-arrasto')
    // arrastar o antes/depois de verdade, devagar
    await drag([cb.x + cb.width * 0.5, cb.y + cb.height * 0.4], [cb.x + cb.width * 0.25, cb.y + cb.height * 0.45], { steps: 20, midShot: '18-antesdepois-arrastando' })
    // arrasto diagonal (polegar real não é reto)
    await drag([cb.x + cb.width * 0.5, cb.y + cb.height * 0.6], [cb.x + cb.width * 0.85, cb.y + cb.height * 0.6 - 60], { steps: 14 })
    R.notes.push('antes/depois diagonal → barra ' + await page.evaluate(() => document.querySelector('.cmp .bar')?.style.left) + ', scrollTop ' + await page.evaluate(() => document.querySelector('.screen').scrollTop))
    await scr(0)
    // swipe curto e rápido (flick)
    await drag([v.w * 0.7, 70], [v.w * 0.45, 72], { steps: 4, dt: 10 })
    R.notes.push('flick de 90px rápido → ' + await tabNow())
    await goTab('Feed')
    // swipe na borda (Feed → direita) = elástico
    await drag([v.w * 0.2, 70], [v.w * 0.9, 70], { midShot: '19-swipe-borda-elastico' })
  }

  // ---------- hoje ----------
  await goTab('Hoje')
  await shot('20-hoje')
  await audit('hoje')
  await scr('end'); await sleep(200); await shot('21-hoje-fim'); await scr(0)
  if (cdp) {
    const db = await page.locator('.days').boundingBox()
    await drag([db.x + db.width * 0.8, db.y + db.height / 2], [db.x + db.width * 0.1, db.y + db.height / 2])
    R.notes.push('swipe começando nos dias → ' + await tabNow())
    if ((await tabNow()) !== 'Hoje') await goTab('Hoje')
  }
  await page.click('.big-q.yes'); await sleep(120); await shot('22-sheet-treinei-abrindo'); await sleep(500)
  await shot('23-sheet-treinei'); await audit('sheet-treinei')
  await page.click('.kinds button >> nth=0'); await page.click('.kinds button >> nth=2'); await sleep(400)
  await shot('24-sheet-treinei-2-escolhidos')
  await page.click('.sheet-card .btn'); await sleep(250); await shot('25-treinei-marcado-toast'); await sleep(2500)
  await page.click('.junk .plus'); await page.click('.junk .plus'); await page.click('.junk .plus'); await sleep(250)
  await shot('26-besteira-estourou-toast')
  await sleep(6200)

  // ---------- evolução ----------
  await goTab('Evolução')
  await shot('30-evo-ricardo'); await audit('evo-ricardo')
  ;[, sh, ch] = await scr(0)
  for (let y = ch * 0.8, i = 1; y < sh && i < 5; y += ch * 0.8, i++) { await scr(y); await sleep(150); await shot(`31-evo-ricardo-rolado-${i}`) }
  await scr('end'); await sleep(150); await shot('32-evo-ricardo-fim'); await scr(0)
  if (cdp) {
    const svg = page.locator('.chart svg')
    await svg.scrollIntoViewIfNeeded(); await sleep(200)
    const gb = await svg.boundingBox()
    await drag([gb.x + gb.width * 0.9, gb.y + gb.height / 2], [gb.x + gb.width * 0.1, gb.y + gb.height / 2], { midShot: '33-grafico-arrastando' })
    R.notes.push('swipe começando no gráfico → ' + await tabNow())
    await shot('34-grafico-apos-soltar')
    await scr(0)
  }
  await page.click('.seg button >> nth=1'); await sleep(150); await shot('35-evo-seg-lente-andando'); await sleep(500)
  await shot('36-evo-gabriel'); await audit('evo-gabriel')
  await page.click('.seg button >> nth=2'); await sleep(700)
  await shot('37-evo-dupla'); await audit('evo-dupla')
  await scr('end'); await sleep(150); await shot('38-evo-dupla-fim'); await scr(0)

  // ---------- perfil ----------
  await goTab('Perfil')
  await shot('40-perfil'); await audit('perfil')
  ;[, sh, ch] = await scr(0)
  for (let y = ch * 0.8, i = 1; y < sh && i < 6; y += ch * 0.8, i++) { await scr(y); await sleep(150); await shot(`41-perfil-rolado-${i}`) }
  await scr('end'); await sleep(150); await shot('42-perfil-fim'); await scr(0)
  // editor de foto de perfil
  await page.setInputFiles('.av-edit input[type=file]', { name: 'foto.png', mimeType: 'image/png', buffer: photo })
  await page.waitForSelector('.crop-box img', { timeout: 8000 }).catch(() => R.notes.push('cropper perfil não abriu'))
  await sleep(500)
  await shot('43-editor-perfil'); await audit('editor-perfil')
  if (cdp) {
    const bb = await page.locator('.crop-box').boundingBox()
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2
    // pinça
    await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]])
    for (let i = 1; i <= 10; i++) { await touch('touchMove', [[cx - 30 - i * 8, cy], [cx + 30 + i * 8, cy]]); await sleep(16); if (i === 6) await shot('44-editor-pinca-meio') }
    await touch('touchEnd', []); await sleep(300)
    R.notes.push('pinça zoom → ' + await page.locator('.crop-ctl input').inputValue())
    await drag([cx, cy], [cx + 60, cy + 40])
    await shot('45-editor-perfil-apos-pinca-arrasto')
  }
  await page.click('.crop .ib.g'); await sleep(900)
  await shot('46-perfil-com-foto')
  R.notes.push('avatar perfil: ' + JSON.stringify(await page.evaluate(() => {
    const a = document.querySelector('.card.me .av'), i = a?.querySelector('img')
    if (!a || !i) return 'sem img'
    const ra = a.getBoundingClientRect(), ri = i.getBoundingClientRect()
    const s = getComputedStyle(i), sa = getComputedStyle(a)
    return { av: [Math.round(ra.width), Math.round(ra.height)], img: [Math.round(ri.width), Math.round(ri.height)], imgOffset: [Math.round(ri.left - ra.left), Math.round(ri.top - ra.top)], natural: [i.naturalWidth, i.naturalHeight], imgCssW: s.width, imgCssH: s.height, display: sa.display, placeItems: sa.placeItems }
  })))
  await page.locator('.card.me').screenshot({ path: path.join(dir, '47-avatar-zoom.png') })
  await goTab('Feed'); await sleep(300)
  await page.locator('.duo').screenshot({ path: path.join(dir, '48-avatar-no-feed.png') })
  R.notes.push('avatar feed: ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.av')].filter(a => a.querySelector('img')).slice(0, 2).map(a => { const ra = a.getBoundingClientRect(), ri = a.querySelector('img').getBoundingClientRect(); return [Math.round(ra.width), Math.round(ri.width), Math.round(ri.height)] }))))

  // ---------- check-in ----------
  await page.click('.fab'); await sleep(150); await shot('50-checkin-abrindo'); await sleep(900)
  await shot('51-checkin-camera'); await audit('checkin-cam')
  await page.setInputFiles('.cam input[type=file]', { name: 'corpo.png', mimeType: 'image/png', buffer: photo })
  await page.waitForSelector('.crop-box img', { timeout: 8000 }).catch(() => R.notes.push('cropper check-in não abriu'))
  await sleep(500)
  await shot('52-editor-checkin'); await audit('editor-checkin')
  await page.click('.crop .ib.g'); await sleep(300); await shot('53-checkin-foto-tirada'); await sleep(700)
  await shot('54-checkin-proximo-angulo')
  await page.click('.cam-top .ib >> nth=1'); await sleep(600)
  await shot('55-checkin-form'); await audit('checkin-form')
  if (cdp) {
    const rb = await page.locator('.ruler-track').boundingBox()
    const v0 = await page.locator('.ruler-val b').textContent()
    await drag([rb.x + rb.width * 0.7, rb.y + rb.height / 2], [rb.x + rb.width * 0.3, rb.y + rb.height / 2], { steps: 15, midShot: '56-regua-arrastando' })
    await sleep(800)
    R.notes.push(`régua: ${v0} → ${await page.locator('.ruler-val b').textContent()} (arrasto de ${Math.round(rb.width * 0.4)}px)`)
  }
  const overlay = page.locator('.overlay')
  await page.evaluate(() => { const o = document.querySelector('.overlay'); o.scrollTop = o.scrollHeight })
  await sleep(200); await shot('57-checkin-form-fim')
  const hb = await page.locator('.hold').boundingBox()
  if (cdp) {
    await touch('touchStart', [[hb.x + hb.width / 2, hb.y + hb.height / 2]]); await sleep(450)
    await shot('58-segurar-pra-postar-meio')
    await touch('touchEnd', []); await sleep(300)
  } else {
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await sleep(450)
    await shot('58-segurar-pra-postar-meio'); await page.mouse.up()
  }
  await page.click('.cam-top .ib >> nth=1'); await sleep(400)

  // ---------- mudança de aba: frames da animação ----------
  await goTab('Feed')
  await page.click('.tabs button[aria-label="Evolução"]')
  for (const t of [40, 120, 250]) { await sleep(t === 40 ? 40 : t - (t === 120 ? 40 : 120)); await shot(`60-troca-aba-${t}ms`) }
  await sleep(600)

  // ---------- teclado / foco no comentário ----------
  await goTab('Feed')
  await page.locator('.cmt-form input').first().scrollIntoViewIfNeeded()
  await page.locator('.cmt-form input').first().click(); await page.keyboard.type('boa'); await sleep(300)
  await shot('61-comentario-digitando')

  await browser.close()
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(R, null, 2))
}

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VPS)
for (const k of keys) {
  try { await run(k); console.log('ok', k) } catch (e) { console.log('FALHOU', k, e.message.split(String.fromCharCode(10))[0]); fs.writeFileSync(path.join(OUT, k, 'report.json'), JSON.stringify({ ...report[k], fatal: e.stack }, null, 2)) }
  finally { for (const b of BROWSERS.splice(0)) await b.close().catch(() => {}) }
}
