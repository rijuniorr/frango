// "Sensor de ré": pose do corpo (MediaPipe, no aparelho) → nota 0–100 + dica + alinhamento do timelapse.
// Parte pura (sem DOM, testada em qa/pose.test.mjs) em cima; carregamento do modelo embaixo.
// Coordenadas: x,y em 0..1 do recorte 3:4 como o usuário VÊ na tela/foto (câmera frontal já espelhada).

export type LM = [number, number, number] // x, y, visibilidade
export type Pose = LM[] // 33 pontos do MediaPipe
export type Ang = 'frente' | 'lado' | 'costas'
export type TiltIn = { pitch: number; roll: number } | null

export const GOOD = 85 // nota que conta como "no alvo"
const W = 3, H = 4 // recorte 3:4: x vale 3 unidades, y vale 4 (ângulos e distâncias sem distorcer)
const NOSE = 0, SH = [11, 12], HIP = [23, 24], ANK = [27, 28]

// pose "ideal" quando não existe foto de referência: centralizado, cabeça ~8% do topo, pés ~92%
export function defaultRef(angle: Ang): Pose {
  const p: Pose = Array.from({ length: 33 }, () => [0.5, 0.5, 1] as LM)
  const sw = angle === 'lado' ? 0.04 : 0.2
  p[NOSE] = [0.5, 0.08, 1]
  p[11] = [0.5 - sw, 0.22, 1]; p[12] = [0.5 + sw, 0.22, 1]
  p[23] = [0.5 - sw * 0.6, 0.5, 1]; p[24] = [0.5 + sw * 0.6, 0.5, 1]
  p[27] = [0.45, 0.92, 1]; p[28] = [0.55, 0.92, 1]
  return p
}

// landmarks do vídeo (0..1 do quadro inteiro) → recorte 3:4 central, espelhando se for câmera frontal
export function toCrop(lm: Pose, vw: number, vh: number, mirror: boolean): Pose {
  const cw = Math.min(vw, vh * 0.75), ch = cw * 4 / 3
  return lm.map(([x, y, v]) => {
    const px = mirror ? 1 - x : x
    return [(px * vw - (vw - cw) / 2) / cw, (y * vh - (vh - ch) / 2) / ch, v] as LM
  })
}

const mid = (p: Pose, ix: number[]) => [(p[ix[0]][0] + p[ix[1]][0]) / 2, (p[ix[0]][1] + p[ix[1]][1]) / 2]
// ângulo (graus) da linha entre dois pontos, sem depender de qual é "esquerdo/direito" (o modelo troca no espelho)
function tiltDeg(p: Pose, ix: number[]) {
  let [a, b] = [p[ix[0]], p[ix[1]]]
  if (a[0] > b[0]) [a, b] = [b, a]
  return Math.atan2((b[1] - a[1]) * H, (b[0] - a[0]) * W) * 180 / Math.PI
}
const height = (p: Pose) => { const n = p[NOSE], a = mid(p, ANK); return Math.hypot((a[0] - n[0]) * W, (a[1] - n[1]) * H) }
const shW = (p: Pose) => Math.abs(p[SH[0]][0] - p[SH[1]][0]) * W / height(p) // largura aparente dos ombros (rotação)

export type Result = { score: number; hint: string; ok: boolean; worst: string }

// penalidade 0 = igual, 1 = "bem fora"; nota = 100·exp(-Σp²/2)
export function scorePose(live: Pose | null, ref: Pose, angle: Ang, tilt: TiltIn = null, mirror = true): Result {
  if (!live) return { score: 0, hint: 'Entra no quadro', ok: false, worst: 'sumiu' }
  const key = [NOSE, ...SH, ...HIP, ...ANK]
  const inside = key.every(i => live[i][2] > 0.5 && live[i][0] > -0.02 && live[i][0] < 1.02 && live[i][1] > -0.02 && live[i][1] < 1.02)
  if (!inside) return { score: 0, hint: 'Corpo inteiro no quadro', ok: false, worst: 'quadro' }
  const dx = mid(live, HIP)[0] - mid(ref, HIP)[0] // >0: corpo está pra direita DA TELA
  const ratio = height(live) / height(ref)
  const parts: Record<string, number> = {
    x: Math.abs(dx) / 0.1,
    h: Math.abs(Math.log(ratio)) / Math.log(1.12),
    tilt: Math.max(Math.abs(tiltDeg(live, SH) - tiltDeg(ref, SH)), Math.abs(tiltDeg(live, HIP) - tiltDeg(ref, HIP))) / 8,
    w: angle === 'lado' ? Math.abs(shW(live) - shW(ref)) / 0.07 : 0,
    cel: tilt ? Math.hypot(tilt.pitch / 6, tilt.roll / 4) : 0,
  }
  // dx: tela = o que o usuário vê. Frontal espelhada: esquerda da tela = esquerda dele. Traseira: é o contrário.
  const left = mirror ? 'esquerda' : 'direita', right = mirror ? 'direita' : 'esquerda'
  const worst = Object.keys(parts).reduce((a, b) => (parts[b] > parts[a] ? b : a))
  const say: Record<string, string> = {
    x: dx > 0 ? `Chega pra ${left}` : `Chega pra ${right}`, // corpo na direita da tela → ele anda pro lado ESQUERDO da tela
    h: ratio > 1 ? 'Afasta' : 'Chega mais perto',
    tilt: 'Endireita o corpo',
    w: shW(live) > shW(ref) ? 'Vira um pouco mais' : 'Vira um pouco menos',
    cel: 'Celular torto',
  }
  const score = Math.round(100 * Math.exp(-Object.values(parts).reduce((a, p) => a + p * p, 0) / 2))
  return { score, hint: score >= GOOD ? 'Isso! Fica assim' : say[worst], ok: score >= GOOD, worst }
}

// ---- versão SIMPLES (a que o app usa): só ombros + quadril (joelho/pé cortado não importa), margem grande.
// 3 coisas: tá no meio? tá na distância certa? o celular tá na mesma altura? Nada de giroscópio/rotação/inclinação.
export const EASY_OK = 50
export function easyScore(live: Pose | null, ref: Pose | null, mirror = true): Result {
  const need = [...SH, ...HIP]
  if (!live || !need.every(i => live[i][2] > 0.4)) return { score: 0, hint: 'Entra na frente da câmera', ok: false, worst: 'sumiu' }
  const r = ref && need.every(i => ref[i][2] > 0.4) ? ref : null
  const loose = r ? 1 : 1.8 // sem foto de referência (1ª vez): bem mais solto
  const s = mid(live, SH), h = mid(live, HIP)
  const rs = r ? mid(r, SH) : [0.5, 0.27], rh = r ? mid(r, HIP) : [0.5, 0.56]
  const torso = (a: number[], b: number[]) => Math.hypot((a[0] - b[0]) * W, (a[1] - b[1]) * H)
  const dx = (s[0] + h[0]) / 2 - 0.5 // CENTRO ABSOLUTO (Ricardo: sempre no meio da tela, em toda foto). >0: corpo à direita
  const dy = s[1] - rs[1] //                             >0: corpo mais baixo na tela
  const ratio = torso(s, h) / torso(rs, rh)
  const pen = { x: Math.abs(dx) / 0.14 /* margem curta e fixa: passa só com até 7% do centro */, size: Math.abs(Math.log(ratio)) / (Math.log(1.4) * loose), y: Math.abs(dy) / (0.2 * loose) }
  const worst = (Object.keys(pen) as (keyof typeof pen)[]).reduce((a, b) => (pen[b] > pen[a] ? b : a))
  const score = Math.round(100 * Math.max(0, 1 - pen[worst]))
  const left = mirror ? 'esquerda' : 'direita', right = mirror ? 'direita' : 'esquerda'
  const say = {
    x: dx > 0 ? `Vai um pouco pra ${left}` : `Vai um pouco pra ${right}`,
    size: ratio > 1 ? 'Dá um passo pra trás' : 'Dá um passo pra frente',
    y: dy > 0 ? 'Abaixa um pouco o celular' : 'Sobe um pouco o celular',
  }
  const ok = score >= EASY_OK
  return { score, hint: ok ? 'Isso! Fica parado' : say[worst], ok, worst }
}

// de frente, de lado ou de costas? (largura dos ombros ÷ tronco; rosto visível = frente)
export function orient(p: Pose | null): Ang | null {
  if (!p || ![...SH, ...HIP].every(i => p[i][2] > 0.4)) return null
  const s = mid(p, SH), h = mid(p, HIP)
  const torso = Math.hypot((s[0] - h[0]) * W, (s[1] - h[1]) * H)
  const shw = Math.abs(p[SH[0]][0] - p[SH[1]][0]) * W
  if (shw / torso < 0.5) return 'lado'
  const face = Math.max(p[NOSE][2], p[2]?.[2] ?? 0, p[5]?.[2] ?? 0) // nariz/olhos
  return face > 0.6 ? 'frente' : 'costas'
}
export const turnHint = (a: Ang) => (a === 'frente' ? 'Vira de frente pra câmera' : a === 'lado' ? 'Vira de lado pra câmera' : 'Vira de costas pra câmera')

// transformação (CSS) que leva a pose `pose` em cima da `ref`: translate(dx,dy em fração da caixa) rotate(rot°) scale(scale)
export type Align = { scale: number; dx: number; dy: number; rot: number }
export function alignTransform(ref: Pose, pose: Pose): Align {
  const pts = (p: Pose) => [mid(p, SH), mid(p, HIP), mid(p, ANK)].map(([x, y]) => [x * W, y * H])
  const A = pts(pose), B = pts(ref)
  const cen = (q: number[][]) => [q.reduce((s, v) => s + v[0], 0) / 3, q.reduce((s, v) => s + v[1], 0) / 3]
  const ca = cen(A), cb = cen(B)
  let dot = 0, cross = 0, na = 0, nb = 0
  A.forEach((a, i) => {
    const ax = a[0] - ca[0], ay = a[1] - ca[1], bx = B[i][0] - cb[0], by = B[i][1] - cb[1]
    dot += ax * bx + ay * by; cross += ax * by - ay * bx; na += ax * ax + ay * ay; nb += bx * bx + by * by
  })
  const rot = Math.atan2(cross, dot)
  const s = Math.sqrt(nb / (na || 1))
  const c = Math.cos(rot), sn = Math.sin(rot), o = [W / 2, H / 2]
  // t = s·R·(o − ca) + cb − o
  const tx = s * (c * (o[0] - ca[0]) - sn * (o[1] - ca[1])) + cb[0] - o[0]
  const ty = s * (sn * (o[0] - ca[0]) + c * (o[1] - ca[1])) + cb[1] - o[1]
  return { scale: s, dx: tx / W, dy: ty / H, rot: rot * 180 / Math.PI }
}
export const alignCss = (a: Align) => `translate(${(a.dx * 100).toFixed(2)}%, ${(a.dy * 100).toFixed(2)}%) rotate(${a.rot.toFixed(2)}deg) scale(${a.scale.toFixed(4)})`

// luz: média de luminância (0..1) de um ImageData/pixels RGBA
export function luma(px: Uint8ClampedArray) {
  let s = 0
  for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
  return s / (px.length / 4) / 255
}
export const tooDark = (live: number, ref: number | undefined) => ref != null && live < ref * 0.78

export const round = (p: Pose): Pose => p.map(([x, y, v]) => [+x.toFixed(3), +y.toFixed(3), +v.toFixed(2)] as LM)

// ---- modelo (carrega só quando a câmera abre; falhou = o check-in segue sem o sensor)
const VER = '1.2.3'
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/wasm`
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
type Landmarker = import('@mediapipe/tasks-vision').PoseLandmarker
let loading: Promise<Landmarker> | null = null
export function loadPose() {
  loading ??= (async () => {
    const m = await import('@mediapipe/tasks-vision')
    const files = await m.FilesetResolver.forVisionTasks(WASM)
    const mk = (delegate: 'GPU' | 'CPU') => m.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses: 1 })
    try { return await mk('GPU') } catch { return await mk('CPU') }
  })()
  loading.catch(() => { loading = null }) // deixa tentar de novo na próxima vez
  return loading
}
export function releasePose() { const l = loading; loading = null; l?.then(x => x.close()).catch(() => {}) }

const pick = (r: { landmarks: { x: number; y: number; visibility: number }[][] }): Pose | null =>
  r.landmarks[0]?.map(l => [l.x, l.y, l.visibility ?? 1] as LM) ?? null

export function detectVideo(lm: Landmarker, v: HTMLVideoElement, t: number) { return pick(lm.detectForVideo(v, t)) }
// foto final recortada (modo IMAGE) → pose + luz; volta pro modo VIDEO
export async function detectPhoto(lm: Landmarker, blob: Blob): Promise<{ pose: Pose | null; lum: number }> {
  const bmp = await createImageBitmap(blob)
  try {
    await lm.setOptions({ runningMode: 'IMAGE' })
    const pose = pick(lm.detect(bmp))
    const c = new OffscreenCanvas(24, 32), g = c.getContext('2d')!
    g.drawImage(bmp, 0, 0, 24, 32)
    return { pose: pose && round(pose), lum: +luma(g.getImageData(0, 0, 24, 32).data).toFixed(3) }
  } finally { bmp.close(); await lm.setOptions({ runningMode: 'VIDEO' }) }
}
