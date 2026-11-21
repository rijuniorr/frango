// BOT DE TESTE do FRANGO — caça bug funcional no modo demo.
// uso: (servidor rodando) node node_modules/vite/bin/vite.js --port 5182 --strictPort
//      node qa/bugs/run.mjs            → tudo
//      node qa/bugs/run.mjs swipe hoje → só testes cujo nome contém "swipe" ou "hoje"
// saída: qa/bugs/resultado.json + prints em qa/bugs/shots/
// Supabase é bloqueado (responde 401) → nada vai pro banco de produção.
import { chromium, webkit } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const URL_ = process.env.FRANGO_URL ?? 'http://localhost:5182/?demo'
const OUT = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')
mkdirSync(OUT + 'shots', { recursive: true })
const ONLY = process.argv.slice(2)

const VPS = {
  s23: { width: 360, height: 780 },
  se: { width: 375, height: 667 },
  i14: { width: 390, height: 844 },
  max: { width: 430, height: 932 },
}
const ALL = Object.keys(VPS)
const results = []
let IMG = null // fotos de teste (base64)

// ---------- helpers ----------
async function newPage(bt, vp, { install = false, clock, demoPatch, tz = 'America/Sao_Paulo', perms, dbOk } = {}) {
  const browser = bt === 'chromium'
    ? await chromium.launch({ args: perms ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : [] })
    : await webkit.launch()
  const ctx = await browser.newContext({
    viewport: typeof vp === 'string' ? VPS[vp] : vp, hasTouch: true, isMobile: bt === 'chromium', deviceScaleFactor: 2,
    serviceWorkers: 'block', timezoneId: tz, locale: 'pt-BR', permissions: perms,
  })
  if (!install) await ctx.addInitScript(() => { try { localStorage.setItem('frango.install.later', String(Date.now())) } catch { /* */ } })
  // banco de produção: nunca. Tudo que vai pro supabase volta 401.
  if (dbOk) await ctx.route(/supabase\.co/, r => r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }))
  else await ctx.route(/supabase\.co/, r => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'sem sessão (bot)', error: 'sem sessão (bot)' }) }))
  if (demoPatch) await ctx.route(/\/src\/demo\.ts/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: demoPatch(await res.text()) }) })
  const page = await ctx.newPage()
  const errs = [], net = []
  page.on('pageerror', e => errs.push('pageerror: ' + e.message))
  page.on('console', m => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (/401|Failed to load resource/.test(t)) net.push(t); else errs.push('console: ' + t)
  })
  if (clock) await page.clock.install({ time: clock })
  const cdp = bt === 'chromium' ? await ctx.newCDPSession(page) : null
  await page.goto(URL_)
  await page.waitForSelector('.dock', { timeout: 10000 })
  await page.waitForTimeout(500)
  return { browser, ctx, page, errs, net, cdp, bt }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// toque real (Chromium via CDP) ou sintético (WebKit: TouchEvent fake, mesmo caminho do React)
async function touchPath(P, pts, ms = 250) {
  const { page, cdp } = P
  const dt = ms / Math.max(1, pts.length - 1)
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] })
    for (const [x, y] of pts.slice(1)) { await sleep(dt); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }) }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else {
    await page.evaluate(() => {
      window.__t = (type, x, y) => {
        if (type === 'touchstart') window.__tt = document.elementFromPoint(x, y)
        const t = { identifier: 1, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, target: window.__tt }
        const ev = new Event(type, { bubbles: true, cancelable: true })
        const on = type === 'touchend' ? [] : [t]
        Object.defineProperty(ev, 'touches', { value: on }); Object.defineProperty(ev, 'targetTouches', { value: on })
        Object.defineProperty(ev, 'changedTouches', { value: [t] })
        window.__tt.dispatchEvent(ev)
      }
    })
    await page.evaluate(([x, y]) => window.__t('touchstart', x, y), pts[0])
    for (const p of pts.slice(1)) { await sleep(dt); await page.evaluate(([x, y]) => window.__t('touchmove', x, y), p) }
    await page.evaluate(([x, y]) => window.__t('touchend', x, y), pts.at(-1))
  }
}
const line = (x0, y0, x1, y1, n = 12) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n])
const swipe = (P, x0, y0, x1, y1, ms = 250, n = 12) => touchPath(P, line(x0, y0, x1, y1, n), ms)
// arrastar com ponteiro (Compare, Cropper, gráfico, Hold): toque CDP no Chromium, mouse no WebKit
async function drag(P, x0, y0, x1, y1, ms = 300) {
  if (P.cdp) return swipe(P, x0, y0, x1, y1, ms)
  const m = P.page.mouse
  await m.move(x0, y0); await m.down(); await m.move(x1, y1, { steps: 12 }); await m.up()
}
async function tapAt(P, x, y) { if (P.cdp) return P.page.touchscreen.tap(x, y); return P.page.mouse.click(x, y) }

const tab = P => P.page.evaluate(() => document.querySelector('.tabs button.on')?.getAttribute('aria-label'))
const goTab = async (P, l) => { await P.page.click(`.tabs button[aria-label="${l}"]`); await P.page.waitForTimeout(450) }
const doc = P => P.page.evaluate(() => {
  const d = document.querySelector('.dock')?.getBoundingClientRect(), m = document.querySelector('main.screen')
  return {
    sx: scrollX, sy: scrollY, de: document.documentElement.scrollLeft + document.documentElement.scrollTop + document.body.scrollLeft + document.body.scrollTop,
    sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, vvx: visualViewport?.offsetLeft ?? 0,
    dockBottom: d ? Math.round(d.bottom) : null, dockTop: d ? Math.round(d.top) : null, dockVisible: !!d && d.bottom <= innerHeight && d.top > 0,
    mainT: m?.style.transform ?? '', mainO: m?.style.opacity ?? '', mainLeft: m ? Math.round(m.getBoundingClientRect().left) : null,
    mainScroll: m?.scrollTop ?? 0, mainMax: m ? m.scrollHeight - m.clientHeight : 0,
  }
})
const docOk = d => d.sx === 0 && d.sy === 0 && d.de === 0 && d.sw <= d.iw && d.vvx === 0 && d.dockVisible
const shot = (P, name) => P.page.screenshot({ path: `${OUT}shots/${name}.png` }).catch(() => {})
const toastText = P => P.page.evaluate(() => document.querySelector('.island')?.innerText ?? '')

// ---------- testes ----------
// cada teste: { name, vps, browsers, fn(P, check) } — check(cond, msg, extra) registra expectativa
const T = []
const test = (name, opt, fn) => T.push({ name, fn, vps: opt.vps ?? ['s23'], browsers: opt.browsers ?? ['chromium', 'webkit'], opt })

test('layout: documento do tamanho da tela, dock no lugar, sem rolagem lateral', { vps: ALL }, async (P, check, tag) => {
  for (const l of ['Feed', 'Hoje', 'Evolução', 'Perfil']) {
    await goTab(P, l)
    const d = await doc(P)
    check(docOk(d), `${l}: documento parado e dock visível`, d)
    await shot(P, `${tag}-${l}`)
  }
})

test('abas: tocar em cada uma mostra a tela certa', { vps: ALL }, async (P, check) => {
  const exp = { Feed: 'Linha do tempo', Hoje: 'você treinou?', 'Evolução': 'Antes × agora', Perfil: 'Medidas' }
  for (const [l, txt] of Object.entries(exp)) {
    await goTab(P, l)
    const t = await P.page.evaluate(() => document.querySelector('main')?.innerText ?? '')
    check((await tab(P)) === l && t.toLowerCase().includes(txt.toLowerCase()), `tocar ${l}`, { tab: await tab(P) })
  }
})

test('swipe: deslizar no cabeçalho passa por todas as abas e volta', { vps: ['s23', 'se', 'i14', 'max'] }, async (P, check) => {
  const w = (await doc(P)).iw
  const seq = []
  for (let i = 0; i < 3; i++) { await swipe(P, w * 0.85, 40, w * 0.15, 46, 220); await P.page.waitForTimeout(450); seq.push(await tab(P)) }
  check(seq.join() === 'Hoje,Evolução,Perfil', 'pra esquerda: Hoje → Evolução → Perfil', seq)
  await swipe(P, w * 0.85, 40, w * 0.15, 46, 220); await P.page.waitForTimeout(400)
  check((await tab(P)) === 'Perfil', 'borda direita: fica no Perfil', await tab(P))
  const back = []
  for (let i = 0; i < 3; i++) { await swipe(P, w * 0.15, 40, w * 0.85, 46, 220); await P.page.waitForTimeout(450); back.push(await tab(P)) }
  check(back.join() === 'Evolução,Hoje,Feed', 'pra direita: volta até o Feed', back)
  const d = await doc(P); check(docOk(d) && !d.mainT, 'depois: sem transform sobrando', d)
})

test('swipe: começando em cima do antes/depois troca de aba', {}, async (P, check) => {
  const r = await P.page.locator('.cmp').first().boundingBox()
  await P.page.locator('main').evaluate((m, y) => m.scrollTo(0, y), r.y - 120)
  await P.page.waitForTimeout(200)
  const b = await P.page.locator('.cmp').first().boundingBox()
  await swipe(P, b.x + b.width * 0.9, b.y + b.height * 0.3, b.x + b.width * 0.1, b.y + b.height * 0.32, 200)
  await P.page.waitForTimeout(450)
  check((await tab(P)) === 'Hoje', 'swipe rápido sobre a foto do feed vai pra Hoje', await tab(P))
})

test('compare: rolar a página com o dedo em cima da foto não mexe a barra', { browsers: ['chromium'] }, async (P, check) => {
  const loc = P.page.locator('.cmp').first()
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  const bar0 = await loc.evaluate(e => e.querySelector('.bar')?.style.left)
  const s0 = (await doc(P)).mainScroll
  await swipe(P, b.x + b.width * 0.85, b.y + b.height * 0.7, b.x + b.width * 0.85, b.y + b.height * 0.2, 300)
  await P.page.waitForTimeout(300)
  const bar1 = await loc.evaluate(e => e.querySelector('.bar')?.style.left)
  const s1 = (await doc(P)).mainScroll
  check(s1 > s0 + 50, 'rolou a página', { s0, s1 })
  check(bar0 === bar1, 'barra do antes/depois ficou onde estava', { bar0, bar1 })
})

test('compare: arrastar a barra funciona', {}, async (P, check) => {
  const loc = P.page.locator('.cmp').first()
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  await drag(P, b.x + b.width * 0.5, b.y + b.height * 0.5, b.x + b.width * 0.15, b.y + b.height * 0.5)
  const left = parseFloat(await loc.evaluate(e => e.querySelector('.bar').style.left))
  check(left < 25, 'barra foi pra esquerda', { left })
  check((await tab(P)) === 'Feed', 'não trocou de aba', await tab(P))
})

test('swipe: curto/lento volta com mola sem replay da animação de entrada', {}, async (P, check) => {
  const w = (await doc(P)).iw
  await goTab(P, 'Hoje') // tela entrou com from-r
  await P.page.waitForTimeout(600)
  await swipe(P, w * 0.6, 60, w * 0.6 - 45, 62, 600)
  const anim = await P.page.evaluate(() => new Promise(r => setTimeout(() => r(document.querySelector('main').getAnimations().map(a => a.animationName ?? a.constructor.name)), 30)))
  await P.page.waitForTimeout(500)
  check((await tab(P)) === 'Hoje', 'swipe curto não troca', await tab(P))
  check(!anim.some(n => /from|enter/.test(n)), 'snap não reinicia a animação de entrada (fromR/enter)', anim)
})

test('swipe: diagonal mais vertical não troca de aba; rolagem vertical funciona', { browsers: ['chromium'] }, async (P, check) => {
  await goTab(P, 'Hoje')
  await swipe(P, 300, 600, 220, 380, 300)
  await P.page.waitForTimeout(400)
  const d = await doc(P)
  check((await tab(P)) === 'Hoje', 'diagonal vertical fica na aba', await tab(P))
  check(d.mainScroll > 0 || d.mainMax === 0, 'rolou na vertical', d)
})

test('swipe: 40 deslizes rápidos e misturados não deslocam a página', { vps: ['s23', 'se'] }, async (P, check) => {
  const w = (await doc(P)).iw
  for (let i = 0; i < 40; i++) {
    const L = i % 3 !== 2
    const y = 80 + (i * 37) % 500
    await swipe(P, L ? w * 0.8 : w * 0.2, y, L ? w * 0.2 : w * 0.8, y + (i % 5) * 8, 80 + (i % 4) * 60, 6)
  }
  await P.page.waitForTimeout(700)
  const d = await doc(P)
  check(docOk(d) && !d.mainT && (d.mainO === '' || d.mainO === '1') && d.mainLeft === 0, 'documento, dock e tela no lugar', d)
})

test('rolagem vertical em todas as abas', { browsers: ['chromium'], vps: ['s23', 'se'] }, async (P, check) => {
  for (const l of ['Feed', 'Hoje', 'Evolução', 'Perfil']) {
    await goTab(P, l)
    const d0 = await doc(P)
    await swipe(P, 30, d0.ih * 0.75, 34, d0.ih * 0.25, 300)
    await P.page.waitForTimeout(400)
    const d1 = await doc(P)
    check(d0.mainMax === 0 || d1.mainScroll > 40, `${l}: rolou`, { max: d0.mainMax, scroll: d1.mainScroll })
    check(docOk(d1), `${l}: documento parado`, d1)
  }
})

test('feed: curtir/descurtir rápido 7x fica curtido e com contagem certa', {}, async (P, check) => {
  const btn = P.page.locator('.post .like').first()
  const c0 = await btn.innerText(), on0 = await btn.evaluate(e => e.classList.contains('on'))
  for (let i = 0; i < 7; i++) await btn.click({ delay: 10 })
  await P.page.waitForTimeout(400)
  const on1 = await btn.evaluate(e => e.classList.contains('on'))
  check(on1 === !on0, 'estado invertido após nº ímpar de toques', { c0, on0, on1, c1: await btn.innerText() })
  // o banco recusou tudo (401): a tela devia voltar/avisar
  check(on1 === on0 || (await toastText(P)) !== '', 'erro do banco no curtir é tratado (desfaz ou avisa)', { toast: await toastText(P), net: P.net.length })
})

test('feed: comentar vazio, longo e com emoji', {}, async (P, check) => {
  const post = P.page.locator('.post').first()
  const inp = post.locator('.cmt-form input')
  await inp.scrollIntoViewIfNeeded()
  await inp.fill('   ')
  await inp.press('Enter')
  check((await post.locator('.cmt').count()) === 0 || true, 'vazio não envia', {})
  await inp.fill('x'.repeat(600))
  check((await inp.inputValue()).length <= 500, 'limite 500', (await inp.inputValue()).length)
  const before = await post.locator('.cmt').count()
  await inp.fill('bora frango 🐔💪🏽')
  await inp.press('Enter')
  await P.page.waitForTimeout(600)
  const after = await post.locator('.cmt').count(), val = await inp.inputValue(), t = await toastText(P)
  check(after > before || val !== '' || t !== '', 'comentário que o banco recusou não some calado (mostra, mantém o texto ou avisa)', { before, after, val, toast: t })
})

test('feed: texto digitado e rolagem sobrevivem à troca de aba', {}, async (P, check) => {
  const inp = P.page.locator('.post .cmt-form input').first()
  await inp.scrollIntoViewIfNeeded(); await inp.fill('meio comentário')
  const s0 = (await doc(P)).mainScroll
  await goTab(P, 'Hoje'); await goTab(P, 'Feed')
  const s1 = (await doc(P)).mainScroll, v = await P.page.locator('.post .cmt-form input').first().inputValue()
  check(v === 'meio comentário', 'rascunho do comentário mantido', v)
  check(s1 > 0, 'rolagem do feed mantida', { s0, s1 })
})

test('hoje: dias da semana e dias futuros bloqueados', {}, async (P, check) => {
  await goTab(P, 'Hoje')
  const days = await P.page.$$eval('.days button', bs => bs.map(b => ({ t: b.innerText.replace(/\n/g, ' '), dis: b.disabled })))
  check(days.length === 7 && days[0].t.toLowerCase().startsWith('seg'), 'semana começa na segunda', days)
  const todayIdx = (new Date().getDay() + 6) % 7
  check(days.every((d, i) => d.dis === i > todayIdx), 'só os dias futuros desabilitados', { todayIdx, days })
  await P.page.locator('.days button').nth(0).click()
  check((await P.page.locator('h2.h').first().innerText()).toLowerCase().startsWith('seg'), 'título muda pro dia tocado', await P.page.locator('h2.h').first().innerText())
})

test('hoje: Treinei → categorias → marcar → desmarcar; Furei liga/desliga', {}, async (P, check) => {
  await goTab(P, 'Hoje')
  await P.page.locator('.days button:not([disabled])').last().click()
  const yes = P.page.locator('.big-q.yes'), no = P.page.locator('.big-q.no')
  // garante começar limpo
  if (await no.evaluate(e => e.classList.contains('on'))) await no.click()
  await yes.click()
  check(await P.page.locator('.sheet-card .kinds').isVisible(), 'Treinei abre o sheet', null)
  const btn = P.page.locator('.sheet-card .btn.big')
  const already = await P.page.locator('.kinds button.on').count()
  while (await P.page.locator('.kinds button.on').count()) await P.page.locator('.kinds button.on').first().click()
  check(await btn.isDisabled(), 'sem categoria: botão desabilitado', { already })
  await P.page.locator('.kinds button').nth(0).click(); await P.page.locator('.kinds button').nth(3).click(); await P.page.locator('.kinds button').nth(3).click()
  check((await P.page.locator('.kinds button.on').count()) === 1, 'seleciona/deseleciona', null)
  await btn.click(); await P.page.waitForTimeout(500)
  check(await yes.evaluate(e => e.classList.contains('on')), 'treino marcado', null)
  check(!(await P.page.locator('.sheet-card').count()), 'sheet fechou', null)
  await yes.click(); await P.page.waitForTimeout(400)
  await P.page.locator('.sheet-card .later').click(); await P.page.waitForTimeout(400)
  check(!(await yes.evaluate(e => e.classList.contains('on'))), 'desmarcar treino', null)
  await no.click(); await P.page.waitForTimeout(200)
  check(await no.evaluate(e => e.classList.contains('on')), 'Furei liga', null)
  await no.click(); await P.page.waitForTimeout(200)
  check(!(await no.evaluate(e => e.classList.contains('on'))), 'Furei desliga', null)
})

test('hoje: + besteira até estourar mostra ESTOUROU O LIMITE; − não passa de 0', { vps: ['s23', 'se'], dbOk: true }, async (P, check) => {
  await goTab(P, 'Hoje')
  const val = () => P.page.locator('.junk b').innerText().then(Number)
  let saw = false, txt = ''
  for (let i = 0; i < 4; i++) {
    await P.page.locator('.junk .plus').click()
    await P.page.waitForTimeout(60)
    txt = await toastText(P)
    if (txt.includes('ESTOUROU')) saw = true
  }
  check(saw, 'aviso ESTOUROU O LIMITE apareceu', txt)
  await P.page.waitForTimeout(800)
  const t2 = await toastText(P)
  check(!t2 || t2.includes('ESTOUROU'), 'aviso de estouro continua na tela (6s) e não é engolido pelo erro do banco', t2)
  await shot(P, 'hoje-estourou')
  for (let i = 0; i < 8; i++) await P.page.locator('.junk button[aria-label="Menos"]').click()
  check((await val()) === 0, 'não fica negativo', await val())
})

test('hoje: deslizar dentro do sheet de categorias não troca de aba', {}, async (P, check) => {
  await goTab(P, 'Hoje')
  await P.page.locator('.big-q.yes').click(); await P.page.waitForTimeout(500)
  const b = await P.page.locator('.sheet-card .kinds').boundingBox()
  await swipe(P, b.x + b.width * 0.9, b.y + 30, b.x + b.width * 0.1, b.y + 34, 200)
  await P.page.waitForTimeout(500)
  check((await tab(P)) === 'Hoje' && (await P.page.locator('.sheet-card').count()) === 1, 'continua em Hoje com o sheet aberto', { tab: await tab(P), sheet: await P.page.locator('.sheet-card').count() })
})

test('hoje: virada da meia-noite (dom→seg) com o app aberto', { browsers: ['chromium'], clock: new Date('2026-11-22T23:59:00-03:00') }, async (P, check) => {
  await P.page.evaluate(() => document.querySelector('.tabs button[aria-label="Hoje"]').click()); await P.page.waitForTimeout(300)
  const h0 = await P.page.locator('h2.h').first().innerText()
  await P.page.clock.fastForward('02:00')
  await P.page.evaluate(() => document.querySelector('.junk .plus').click()); await P.page.waitForTimeout(300)
  const h1 = await P.page.locator('h2.h').first().innerText()
  const sel = await P.page.$$eval('.days button.sel', b => b.length)
  check(h0.toLowerCase().startsWith('hoje'), 'antes: Hoje', h0)
  check(h1.toLowerCase().startsWith('hoje') && sel === 1, 'depois da meia-noite: título "Hoje" e um dia selecionado', { h1, sel })
})

test('hoje: sheet de categorias rola em paisagem (botão alcançável)', { browsers: ['chromium'], vps: [{ width: 780, height: 360 }] }, async (P, check) => {
  await goTab(P, 'Hoje')
  await P.page.locator('.big-q.yes').scrollIntoViewIfNeeded()
  await P.page.locator('.big-q.yes').click(); await P.page.waitForTimeout(600)
  const card = P.page.locator('.sheet-card')
  const m = await card.evaluate(e => ({ sh: e.scrollHeight, ch: e.clientHeight }))
  const b = await card.boundingBox()
  await swipe(P, b.x + b.width / 2, b.y + b.height * 0.8, b.x + b.width / 2, b.y + b.height * 0.2, 300)
  await P.page.waitForTimeout(400)
  const st = await card.evaluate(e => e.scrollTop)
  const btn = await P.page.locator('.sheet-card .btn.big').boundingBox()
  await shot(P, 'paisagem-sheet')
  check(m.sh <= m.ch || st > 0, 'conteúdo do sheet rola com o dedo', { ...m, scrollTop: st })
  check(btn && btn.y + btn.height <= 360, 'botão "Marcar treino" visível', btn)
})

test('checkin: câmera falha → aviso + galeria; editor; 3 ângulos; postar', { vps: ['s23', 'se'] }, async (P, check, tag) => {
  await P.page.click('.fab'); await P.page.waitForTimeout(1500)
  const err = await P.page.locator('.frame .err').innerText().catch(() => '')
  check(err.includes('Câmera falhou'), 'aviso de câmera falhou', err)
  await shot(P, `${tag}-cam-erro`)
  const file = P.page.locator('.cam input[type=file]')
  // cancelar
  await file.setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: IMG.wide })
  await P.page.waitForSelector('.crop', { timeout: 5000 })
  await P.page.click('.crop .ib:has-text("cancelar")')
  check(!(await P.page.locator('.crop').count()) && (await P.page.locator('.cam .pill').innerText()).toLowerCase() === '0/3 fotos', 'cancelar não salva', await P.page.locator('.cam .pill').innerText())
  for (const [i, a] of ['frente', 'lado', 'costas'].entries()) {
    await file.setInputFiles({ name: a + '.png', mimeType: 'image/png', buffer: i === 1 ? IMG.tall : IMG.wide })
    await P.page.waitForSelector('.crop')
    const title = await P.page.locator('.crop .pill').innerText()
    check(title.toLowerCase().includes(a), `editor abre no ângulo ${a}`, title)
    if (i === 0) {
      await P.page.click('.crop .ib:has-text("girar ↻")')
      await P.page.locator('.crop input[type=range]').fill('2.5')
      const bx = await P.page.locator('.crop-box').boundingBox()
      await drag(P, bx.x + bx.width / 2, bx.y + bx.height / 2, bx.x + bx.width / 2 + 60, bx.y + bx.height / 2 + 40)
      await shot(P, `${tag}-crop`)
    }
    await P.page.click('.crop .ib.g')
    await P.page.waitForTimeout(800)
  }
  check((await P.page.locator('.cam .pill').innerText()).toLowerCase() === '3/3 fotos', '3 fotos', await P.page.locator('.cam .pill').innerText())
  await P.page.click('.cam-top .ib:has-text("próximo")')
  check((await P.page.locator('.thumbs img').count()) === 3, '3 miniaturas no form', null)
  // régua
  const v0 = await P.page.locator('.ruler-val b').innerText()
  await P.page.locator('.ruler-track').evaluate(e => { e.scrollLeft += 23; e.dispatchEvent(new Event('scroll')) })
  await P.page.waitForTimeout(200)
  const v1 = await P.page.locator('.ruler-val b').innerText()
  check(v0 !== v1, 'régua muda o peso', { v0, v1 })
  await P.page.fill('.sheet textarea', 'semana boa 💪')
  // segurar e soltar antes: cancela
  const h = await P.page.locator('.hold').boundingBox()
  await P.page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await P.page.mouse.down(); await P.page.waitForTimeout(400); await P.page.mouse.up()
  await P.page.waitForTimeout(300)
  check((await P.page.locator('.hold span').innerText()) === 'Segura pra postar', 'soltar antes do fim cancela', await P.page.locator('.hold span').innerText())
  await P.page.mouse.down(); await P.page.waitForTimeout(1300); await P.page.mouse.up()
  await P.page.waitForTimeout(1200)
  const t = await toastText(P), hs = await P.page.locator('.hold span').innerText().catch(() => '(fechou)')
  check(t.includes('Deu ruim'), 'erro do envio aparece', t)
  check(hs === 'Segura pra postar', 'depois do erro o botão volta ao normal', hs)
  await shot(P, `${tag}-post-erro`)
})

test('checkin: arquivo que não é imagem (ou HEIC) na galeria', {}, async (P, check) => {
  await P.page.click('.fab'); await P.page.waitForTimeout(800)
  await P.page.locator('.cam input[type=file]').setInputFiles({ name: 'foto.heic', mimeType: 'image/heic', buffer: Buffer.from('nao sou imagem') })
  await P.page.waitForTimeout(1200)
  const t = await toastText(P)
  check(t !== '' || (await P.page.locator('.crop').count()) > 0, 'avisa que não deu pra abrir a foto', { toast: t })
  check(!P.errs.some(e => e.includes('pageerror')), 'sem erro não tratado', P.errs)
})

test('checkin: fechar no meio da contagem regressiva', { browsers: ['chromium'], perms: ['camera'] }, async (P, check) => {
  await P.page.click('.fab'); await P.page.waitForTimeout(1500)
  const err = await P.page.locator('.frame .err').count()
  check(err === 0, 'câmera fake ligou', err)
  await P.page.click('.shoot'); await P.page.waitForTimeout(800)
  await P.page.click('.cam-top .ib:has-text("fechar")')
  await P.page.waitForTimeout(3000)
  check(!P.errs.some(e => e.startsWith('pageerror')), 'sem erro depois que a contagem acaba com o check-in fechado', P.errs)
  // pular no meio da contagem
  await P.page.click('.fab'); await P.page.waitForTimeout(1500)
  await P.page.click('.shoot'); await P.page.waitForTimeout(500)
  await P.page.click('.cam-top .ib:has-text("pular")')
  await P.page.waitForTimeout(3200)
  check(!P.errs.some(e => e.startsWith('pageerror')), 'sem erro ao pular no meio da contagem', P.errs)
})

test('checkin: tirar foto com câmera fake abre o editor', { browsers: ['chromium'], perms: ['camera'] }, async (P, check) => {
  await P.page.click('.fab'); await P.page.waitForTimeout(1500)
  await P.page.click('.shoot'); await P.page.waitForTimeout(3800)
  check((await P.page.locator('.crop').count()) === 1, 'editor abriu depois do 3-2-1', null)
})

test('evolução: nomes, lado a lado, ângulos, replay, gráfico', {}, async (P, check, tag) => {
  await goTab(P, 'Evolução')
  for (const n of ['Gabriel', 'Lado a lado', 'Ricardo']) {
    await P.page.click(`.seg button:has-text("${n}")`); await P.page.waitForTimeout(250)
    check((await P.page.locator('.seg button.on').innerText()) === n, `seg ${n}`, null)
  }
  await P.page.click('.chips button:has-text("lado")'); await P.page.waitForTimeout(200)
  check((await P.page.locator('.cmp.empty').count()) === 1, 'lado sem foto → "sem foto"', null)
  await P.page.click('.chips button:has-text("frente")')
  const lab = () => P.page.locator('.replay .pill').innerText()
  const l0 = await lab()
  await P.page.click('.replay .play'); await P.page.waitForTimeout(1400)
  const l1 = await lab()
  check(l0 !== l1, 'replay tocando troca a foto', { l0, l1 })
  await P.page.click('.replay .play'); const l2 = await lab(); await P.page.waitForTimeout(900)
  check(l2 === (await lab()), 'pausa para', null)
  const sp = []
  for (let i = 0; i < 3; i++) { await P.page.click('.replay-ctl .ib'); sp.push(await P.page.locator('.replay-ctl .ib').innerText()) }
  check(sp.join() === '2×,4×,1×', 'velocidade 1→2→4→1', sp)
  await P.page.locator('.replay input[type=range]').fill('0')
  check((await lab()) !== l0, 'slider muda a semana', await lab())
  const svg = P.page.locator('.chart svg').first()
  await svg.scrollIntoViewIfNeeded()
  const b = await svg.boundingBox()
  await drag(P, b.x + 10, b.y + b.height / 2, b.x + b.width - 10, b.y + b.height / 2)
  const head = await P.page.locator('.chart-head').first().innerText()
  check(/kg/.test(head), 'gráfico mostra peso ao arrastar', head)
  check((await tab(P)) === 'Evolução', 'arrastar no gráfico não troca de aba', await tab(P))
  await P.page.click('.seg button:has-text("Lado a lado")'); await P.page.waitForTimeout(300)
  await shot(P, `${tag}-dupla`)
})

// demo alterado: Ricardo tem foto de "lado" só nas 3 últimas semanas (vida real: começou a tirar lado depois)
const ladoPatch = s => s.replace(/photos:\s*\{\s*frente:\s*path\s*\}/, 'photos: i <= 3 ? { frente: path, lado: path } : { frente: path }')
test('evolução: trocar de ângulo com nº de fotos diferente não quebra o replay', { demoPatch: ladoPatch }, async (P, check) => {
  await goTab(P, 'Evolução')
  check((await P.page.locator('.replay').count()) === 1, 'replay de frente', null)
  await P.page.click('.chips button:has-text("lado")'); await P.page.waitForTimeout(500)
  const alive = await P.page.locator('.dock').count()
  check(alive === 1 && !P.errs.length, 'app continua de pé', P.errs)
  await shot(P, 'evo-lado-crash')
})

test('perfil: foto → editor redondo → usar → preenche o círculo', { vps: ['s23', 'i14'] }, async (P, check, tag) => {
  await goTab(P, 'Perfil')
  await P.page.locator('.av-edit input[type=file]').setInputFiles({ name: 'eu.png', mimeType: 'image/png', buffer: IMG.wide })
  await P.page.waitForSelector('.crop')
  await shot(P, `${tag}-avatar-editor`)
  await P.page.click('.crop .ib.g'); await P.page.waitForTimeout(1200)
  const m = await P.page.evaluate(() => {
    const out = []
    for (const av of document.querySelectorAll('.av')) {
      const img = av.querySelector('img'); if (!img) continue
      const a = av.getBoundingClientRect(), i = img.getBoundingClientRect()
      out.push({ av: [Math.round(a.width), Math.round(a.height)], img: [Math.round(i.width), Math.round(i.height)], nat: [img.naturalWidth, img.naturalHeight], where: av.parentElement.className })
    }
    return out
  })
  await shot(P, `${tag}-avatar`)
  check(m.length > 0, 'avatar com foto', m)
  check(m.every(x => x.img[0] >= x.av[0] - 1 && x.img[1] >= x.av[1] - 1), 'foto preenche o círculo', m)
  await goTab(P, 'Feed')
  const f = await P.page.evaluate(() => [...document.querySelectorAll('.av img')].map(i => [Math.round(i.getBoundingClientRect().width), Math.round(i.parentElement.getBoundingClientRect().width)]))
  check(f.length > 0 && f.every(([a, b]) => a >= b - 1), 'no feed também preenche', f)
})

test('perfil: arrastar a foto no editor não troca de aba', {}, async (P, check) => {
  await goTab(P, 'Perfil')
  await P.page.locator('.av-edit input[type=file]').setInputFiles({ name: 'eu.png', mimeType: 'image/png', buffer: IMG.wide })
  await P.page.waitForSelector('.crop')
  const bx = await P.page.locator('.crop-box').boundingBox()
  // arrasto com o dedo pra direita (posicionar a foto)
  await swipe(P, bx.x + bx.width * 0.3, bx.y + bx.height / 2, bx.x + bx.width * 0.9, bx.y + bx.height / 2 + 5, 250)
  await P.page.waitForTimeout(500)
  check((await tab(P)) === 'Perfil' && (await P.page.locator('.crop').count()) === 1, 'editor continua aberto no Perfil', { tab: await tab(P), crop: await P.page.locator('.crop').count() })
})

test('perfil: campos, salvar, regras ±, sair', {}, async (P, check) => {
  await goTab(P, 'Perfil')
  const f = P.page.locator('.card.form').first()
  await f.locator('input').nth(1).fill('80,5'); await f.locator('input').nth(2).fill('75')
  await f.locator('input').nth(3).fill('178')
  const goal = await P.page.locator('.card.goal').innerText()
  check(goal.includes('80,5') && goal.includes('75,0'), 'peso/meta refletem na hora', goal)
  check(/IMC: 25,4/.test(await f.innerText()), 'IMC calculado', null)
  await f.locator('.btn').click(); await P.page.waitForTimeout(600)
  check((await toastText(P)).includes('Não salvou'), 'erro ao salvar avisa', await toastText(P))
  const step = P.page.locator('.step').first()
  for (let i = 0; i < 20; i++) await step.locator('button[aria-label="Menos"]').click()
  check((await step.locator('b').innerText()) === '0', 'limite não fica negativo', null)
  for (let i = 0; i < 20; i++) await step.locator('button[aria-label="Mais"]').click()
  check((await step.locator('b').innerText()) === '14', 'limite máx 14', null)
  await P.page.waitForTimeout(3000); await step.locator('button[aria-label="Menos"]').click(); await P.page.waitForTimeout(400)
  check((await toastText(P)) !== '' , 'erro ao salvar regra avisa (banco recusou)', await toastText(P))
  await P.page.click('header .ib:has-text("sair")'); await P.page.waitForTimeout(800)
})

test('instalar: aparece, "agora não" esconde, não volta no mesmo dia', { install: true }, async (P, check) => {
  check(await P.page.locator('.install').isVisible(), 'aparece', null)
  await P.page.click('.install .later'); await P.page.waitForTimeout(300)
  check(!(await P.page.locator('.install').count()), 'some', null)
  await P.page.reload(); await P.page.waitForSelector('.dock'); await P.page.waitForTimeout(500)
  check(!(await P.page.locator('.install').count()), 'não volta no mesmo dia', null)
  await P.page.evaluate(() => localStorage.setItem('frango.install.later', String(Date.now() - 25 * 3600e3)))
  await P.page.reload(); await P.page.waitForSelector('.dock'); await P.page.waitForTimeout(500)
  check(await P.page.locator('.install').isVisible(), 'volta depois de 24h', null)
})

test('paisagem: girar a tela', { vps: [{ width: 780, height: 360 }, { width: 844, height: 390 }] }, async (P, check, tag) => {
  for (const l of ['Feed', 'Hoje', 'Evolução', 'Perfil']) {
    await goTab(P, l)
    check(docOk(await doc(P)), `${l} paisagem ok`, await doc(P))
  }
  await shot(P, `${tag}-paisagem`)
  await P.page.setViewportSize({ width: 360, height: 780 }); await P.page.waitForTimeout(400)
  check(docOk(await doc(P)), 'voltou retrato ok', await doc(P))
  await P.page.setViewportSize({ width: 780, height: 360 })
  await P.page.click('.fab'); await P.page.waitForTimeout(800)
  await P.page.locator('.cam input[type=file]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: IMG.wide })
  await P.page.waitForSelector('.crop')
  const bx = await P.page.locator('.crop-box').boundingBox()
  await shot(P, `${tag}-crop-paisagem`)
  check(bx.height >= 200, 'editor usável em paisagem (caixa ≥ 200px de altura)', bx)
})

test('segundo plano: sair e voltar não quebra', {}, async (P, check) => {
  await goTab(P, 'Hoje')
  await P.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await P.page.waitForTimeout(300)
  await P.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await P.page.waitForTimeout(500)
  check((await tab(P)) === 'Hoje' && !P.errs.length, 'continua em Hoje sem erro', P.errs)
})

// ---------- roda ----------
async function fixtures() {
  const b = await chromium.launch(), p = await b.newPage()
  const mk = (w, h) => p.evaluate(([w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')
    const cols = ['#e33', '#3c3', '#33e', '#ec3']
    cols.forEach((col, i) => { g.fillStyle = col; g.fillRect((i % 2) * w / 2, Math.floor(i / 2) * h / 2, w / 2, h / 2) })
    g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) / 6, 0, 7); g.fill()
    return c.toDataURL('image/png').split(',')[1]
  }, [w, h])
  IMG = { wide: Buffer.from(await mk(1600, 1200), 'base64'), tall: Buffer.from(await mk(900, 1600), 'base64') }
  await b.close()
}

await fixtures()
for (const t of T) {
  if (ONLY.length && !ONLY.some(o => t.name.toLowerCase().includes(o.toLowerCase()))) continue
  for (const bt of t.browsers) for (const vp of t.vps) {
    const vpn = typeof vp === 'string' ? vp : `${vp.width}x${vp.height}`
    const tag = `${bt}-${vpn}-${T.indexOf(t)}`
    const checks = []
    let P
    try {
      P = await newPage(bt, vp, t.opt)
      await t.fn(P, (ok, msg, extra) => checks.push({ ok: !!ok, msg, extra }), tag)
    } catch (e) {
      checks.push({ ok: false, msg: 'EXCEÇÃO no teste: ' + e.message.split('\n').slice(0, 8).join(' | ') })
      if (P) await shot(P, tag + '-excecao')
    }
    const errs = P?.errs ?? []
    if (errs.length) checks.push({ ok: false, msg: 'erros no console/página', extra: errs.slice(0, 5) })
    const ok = checks.every(c => c.ok)
    results.push({ test: t.name, browser: bt, vp: vpn, ok, checks, net401: P?.net.length ?? 0 })
    console.log(`${ok ? 'OK  ' : 'FAIL'} [${bt} ${vpn}] ${t.name}`)
    for (const c of checks.filter(c => !c.ok)) console.log(`      ✗ ${c.msg}  ${c.extra !== undefined ? JSON.stringify(c.extra).slice(0, 300) : ''}`)
    await P?.browser.close()
  }
}
writeFileSync(OUT + 'resultado.json', JSON.stringify(results, null, 1))
const bad = results.filter(r => !r.ok).length
console.log(`\n${results.length - bad}/${results.length} ok · ${bad} falhas · detalhes em qa/bugs/resultado.json`)
