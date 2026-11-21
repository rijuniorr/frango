// node qa/pose.test.mjs — sem framework
import assert from 'node:assert/strict'
import { scorePose, easyScore, alignTransform, defaultRef, toCrop } from '../src/pose.ts'

const base = () => defaultRef('frente')
const tx = (p, f) => p.map(([x, y, v]) => { const [a, b] = f(x, y); return [a, b, v] })
const shift = (p, dx, dy = 0) => tx(p, (x, y) => [x + dx, y + dy])
const scale = (p, s) => tx(p, (x, y) => [0.5 + (x - 0.5) * s, 0.5 + (y - 0.5) * s])
const rot = (p, deg) => { const r = deg * Math.PI / 180; return tx(p, (x, y) => { const X = (x - .5) * 3, Y = (y - .5) * 4; return [.5 + (X * Math.cos(r) - Y * Math.sin(r)) / 3, .5 + (X * Math.sin(r) + Y * Math.cos(r)) / 4] }) }

// nota perfeita com pose igual
assert.equal(scorePose(base(), base(), 'frente').score, 100)
// piora ao deslocar / escalar / inclinar
const s0 = scorePose(base(), base(), 'frente').score
for (const [n, p] of [['desloca', shift(base(), 0.1)], ['escala', scale(base(), 1.2)], ['inclina', rot(base(), 10)]]) {
  const s = scorePose(p, base(), 'frente').score
  assert.ok(s < s0 - 20, `${n} deveria piorar (${s})`)
}
assert.ok(scorePose(shift(base(), 0.02), base(), 'frente').score >= 85, 'desvio pequeno ainda é alvo')
// corpo cortado
assert.equal(scorePose(shift(base(), 0, 0.2), base(), 'frente').hint, 'Corpo inteiro no quadro')
// rotação no lado (largura dos ombros)
const lado = defaultRef('lado'), vira = defaultRef('frente')
assert.equal(scorePose(vira, lado, 'lado').hint, 'Vira um pouco mais')
// distância
assert.equal(scorePose(scale(base(), 1.15), base(), 'frente').hint, 'Afasta')
assert.equal(scorePose(scale(base(), 0.85), base(), 'frente').hint, 'Chega mais perto')
// celular torto (giroscópio)
assert.equal(scorePose(base(), base(), 'frente', { pitch: 0, roll: 12 }).hint, 'Celular torto')

// DIREÇÃO: corpo à direita da TELA. Frontal espelhada: tela = espelho → anda pra esquerda dele.
// Traseira: a tela mostra como a câmera vê → esquerda da tela é a DIREITA dele.
const dir = shift(base(), 0.15)
assert.equal(scorePose(dir, base(), 'frente', null, true).hint, 'Chega pra esquerda')
assert.equal(scorePose(dir, base(), 'frente', null, false).hint, 'Chega pra direita')
const esq = shift(base(), -0.15)
assert.equal(scorePose(esq, base(), 'frente', null, true).hint, 'Chega pra direita')
assert.equal(scorePose(esq, base(), 'frente', null, false).hint, 'Chega pra esquerda')

// toCrop: ponto no lado direito do vídeo cru aparece à esquerda quando espelhado
const raw = base().map(([x, y, v]) => [0.8, y, v])
assert.ok(toCrop(raw, 1000, 750, true)[0][0] < 0.5 && toCrop(raw, 1000, 750, false)[0][0] > 0.5)
// vídeo largo 4:3 → recorte central 3:4: o centro continua no centro
assert.ok(Math.abs(toCrop(base(), 1000, 750, true)[0][0] - 0.5) < 1e-9)

// alignTransform desfaz escala/deslocamento/rotação conhecidos
const apply = (a, [x, y]) => { // CSS: translate(rotate(scale(p-o))) em unidades 3x4
  const r = a.rot * Math.PI / 180, X = (x - .5) * 3 * a.scale, Y = (y - .5) * 4 * a.scale
  return [.5 + (X * Math.cos(r) - Y * Math.sin(r)) / 3 + a.dx, .5 + (X * Math.sin(r) + Y * Math.cos(r)) / 4 + a.dy]
}
const ref = base()
for (const live of [scale(ref, 1.3), shift(ref, 0.08, -0.05), shift(scale(ref, 0.85), -0.1, 0.04), rot(ref, 6)]) {
  const a = alignTransform(ref, live)
  for (const i of [0, 11, 12, 23, 24, 27, 28]) {
    const [x, y] = apply(a, live[i])
    assert.ok(Math.abs(x - ref[i][0]) < 2e-3 && Math.abs(y - ref[i][1]) < 2e-3, `ponto ${i}: ${x},${y} vs ${ref[i]}`)
  }
}
const id = alignTransform(ref, ref)
assert.ok(Math.abs(id.scale - 1) < 1e-9 && Math.abs(id.dx) < 1e-9 && Math.abs(id.rot) < 1e-9)


// ---- versão simples (a que o app usa)
{
  const ref = base()
  assert.equal(easyScore(ref, ref).score, 100)
  assert.ok(easyScore(shift(ref, 0.06), ref).ok, 'margem grande: 6% pro lado ainda passa')
  assert.ok(!easyScore(shift(ref, 0.16), ref).ok, '16% pro lado não passa')
  assert.ok(easyScore(scale(ref, 1.12), ref).ok, '12% maior ainda passa')
  assert.equal(easyScore(scale(ref, 1.4), ref).hint, 'Dá um passo pra trás')
  assert.equal(easyScore(scale(ref, 0.7), ref).hint, 'Dá um passo pra frente')
  // joelho/pé cortado: tornozelos invisíveis não importam
  const semPe = ref.map((l, i) => (i >= 25 ? [l[0], 1.3, 0.05] : l))
  assert.equal(easyScore(semPe, ref).score, 100)
  // sem quadril visível = ninguém
  assert.equal(easyScore(ref.map((l, i) => (i === 23 ? [l[0], l[1], 0.1] : l)), ref).score, 0)
  // 1ª vez (sem referência): bem solto
  assert.ok(easyScore(shift(ref, 0.12), null).ok)
  // direção com espelho (frontal) × traseira: corpo à direita da tela
  assert.equal(easyScore(shift(ref, 0.18), ref, true).hint, 'Vai um pouco pra esquerda')
  assert.equal(easyScore(shift(ref, 0.18), ref, false).hint, 'Vai um pouco pra direita')
  // a nota cresce conforme chega perto (o bip acelera)
  const s1 = easyScore(shift(ref, 0.15), ref).score, s2 = easyScore(shift(ref, 0.08), ref).score, s3 = easyScore(shift(ref, 0.02), ref).score
  assert.ok(s1 < s2 && s2 < s3, `${s1} ${s2} ${s3}`)
}
console.log('pose.test OK')
