// sonda: por que a foto do avatar não preenche o círculo
import { chromium, webkit } from 'playwright'
for (const eng of [chromium, webkit]) {
  const b = await eng.launch()
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  await p.route(/supabase\.co/, r => r.abort())
  await p.addInitScript(() => localStorage.setItem('frango.install.later', String(Date.now())))
  await p.goto('http://localhost:5181/?demo'); await p.waitForSelector('.dock')
  // injeta foto no estado do perfil do jeito que o app faz: troca o conteúdo do .av por uma img 500x500
  const r = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 500
    const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 500, 500)
    const url = c.toDataURL()
    const out = []
    for (const av of document.querySelectorAll('.av')) {
      av.textContent = ''; const i = new Image(); i.src = url; av.append(i)
      await i.decode()
      const ra = av.getBoundingClientRect(), ri = i.getBoundingClientRect()
      const rules = []
      for (const sh of document.styleSheets) for (const ru of sh.cssRules) if (ru.selectorText && (av.matches(ru.selectorText) || i.matches(ru.selectorText))) rules.push(ru.selectorText + ' {' + ru.style.cssText.slice(0, 120) + '}')
      out.push({ av: [ra.width, ra.height], img: [ri.width, ri.height], disp: getComputedStyle(av).display, lh: getComputedStyle(av).lineHeight, rules })
      if (out.length > 1) break
    }
    return out
  })
  console.log(eng.name(), JSON.stringify(r, null, 1))
  await b.close()
}
