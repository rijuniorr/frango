import { createClient } from '@supabase/supabase-js'

// chave pública (feita pra ficar no app); a segurança é o RLS no banco
export const sb = createClient(
  'https://quiolvmfxlggktzrgngq.supabase.co',
  'sb_publishable_DvAYEDREa2_dJH608NeFiw_gTjrf1mX',
)

export type Angle = 'frente' | 'lado' | 'costas' | 'livre'
export const ANGLES: Angle[] = ['frente', 'lado', 'costas', 'livre'] // livre = pose que quiser, timer de 10 s automático

export type Profile = { id: string; username: string; name: string; is_admin: boolean; height_cm: number | null; goal_kg: number | null; weight_kg: number | null; fat_pct: number | null; avatar: string | null }
export type Settings = { max_skips: number; max_junk: number }
export type Day = { user_id: string; day: string; trained: boolean | null; junk: number; kinds: string[] | null }

// o que dá pra marcar quando treinou
export const KINDS: [string, string][] = [
  ['academia', '🏋️ Academia'], ['aerobico', '🫀 Aeróbico'], ['corrida', '🏃 Corrida'], ['calistenia', '🤸 Calistenia'],
  ['esporte', '⚽ Esporte'], ['bike', '🚴 Bike'], ['natacao', '🏊 Natação'], ['luta', '🥊 Luta'],
  ['funcional', '🔥 Funcional'], ['alongamento', '🧘 Alongamento'],
]
export const kindLabel = (k: string) => KINDS.find(x => x[0] === k)?.[1] ?? k
export type Checkin = { id: string; user_id: string; week: string; weight: number | null; note: string | null; photos: Partial<Record<Angle, string>> & { pose?: Partial<Record<Angle, import('./pose').Pose>>; lum?: Partial<Record<Angle, number>>; tag?: 'pre' | 'pos' }; created_at: string; audience?: string[] | null }
export type Like = { checkin_id: string; user_id: string }
export type Comment = { id: string; checkin_id: string; user_id: string; body: string; created_at: string }

export type Data = {
  me: string
  profiles: Profile[]
  settings: Settings
  days: Day[]
  checkins: Checkin[]   // mais antigo → mais novo
  likes: Like[]
  comments: Comment[]
  urls: Record<string, string> // caminho da foto → link assinado
}

// admin (Ricardo) primeiro, depois os outros por nome: ordem estável pra todo mundo
export const ordered = (data: Data) => [...data.profiles].sort((a, b) => Number(b.is_admin) - Number(a.is_admin) || a.username.localeCompare(b.username))

export const avatarOf = (data: Data, uid: string) => { const a = data.profiles.find(p => p.id === uid)?.avatar; return a ? data.urls[a] : undefined }

// componente que está usando o dedo (antes/depois, gráfico, régua…) trava o deslizar entre abas
export const gesture = { lock: false }

// erro técnico → frase de gente
export function nice(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e)
  if (/fetch|network|Load failed|offline/i.test(m)) return 'Sem internet. Tenta de novo quando voltar.'
  if (/row-level|permission|401|403|JWT/i.test(m)) return 'Sem permissão. Sai e entra de novo.'
  if (/formato|decode|HEI[CF]/i.test(m)) return 'Não deu pra abrir essa foto. Se for HEIC, muda a câmera pra JPEG ou tira um print.'
  if (/NotAllowed|Permission denied/i.test(m)) return 'O app não tem permissão pra câmera. Libera nas configurações ou usa a galeria.'
  if (/NotFound|NotReadable|not supported|Not supported/i.test(m)) return 'Não deu pra abrir a câmera. Usa a galeria.'
  return 'Deu ruim. Tenta de novo.'
}

// foto → JPEG com lado maior `max`
export function shrink(src: Blob, max: number, square = false): Promise<Blob> {
  return new Promise((res, rej) => {
    const img = new Image()
    const u = URL.createObjectURL(src)
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('formato')) }
    img.onload = () => {
      URL.revokeObjectURL(u)
      if (!img.width) return rej(new Error('formato'))
      const s = square ? Math.min(img.width, img.height) : 0
      const k = Math.min(1, max / (square ? s : Math.max(img.width, img.height)))
      const cv = document.createElement('canvas')
      cv.width = Math.round((square ? s : img.width) * k); cv.height = Math.round((square ? s : img.height) * k)
      const g = cv.getContext('2d')!
      if (square) g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, cv.width, cv.height)
      else g.drawImage(img, 0, 0, cv.width, cv.height)
      cv.toBlob(b => (b ? res(b) : rej(new Error('formato'))), 'image/jpeg', 0.85)
    }
    img.src = u
  })
}

// login: usuário + senha curta. O Supabase exige 6+ caracteres, então a senha é completada aqui.
export const emailOf = (u: string) => `${u.trim().toLowerCase()}@frango.app`
export const passOf = (p: string) => `frango.${p}.app`

// datas locais (sem fuso bagunçando)
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const today = () => iso(new Date())
export function monday(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export function weekDays(d = new Date()) {
  const m = monday(d)
  return Array.from({ length: 7 }, (_, i) => iso(new Date(m.getFullYear(), m.getMonth(), m.getDate() + i)))
}
export const fmtKg = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(1).replace('.', ','))
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const fmtDate = (s: string) => new Date(s + (s.length === 10 ? 'T12:00' : '')).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')

// vibração: Android = navigator.vibrate; iPhone (iOS 18+) = clique num <input switch>
const sw = document.createElement('label')
sw.innerHTML = '<input type="checkbox" switch>'
sw.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:-99px'
document.body.append(sw)
export function hap(ms: number | number[] = 12) {
  if (navigator.vibrate) navigator.vibrate(ms)
  else sw.click()
}

const signed = new Map<string, { url: string; t: number }>()

export async function load(me: string): Promise<Data> {
  const since = iso(new Date(Date.now() - 400 * 864e5))
  const [p, s, d, c, l, cm] = await Promise.all([
    sb.from('profiles').select('*'),
    sb.from('settings').select('*').single(),
    sb.from('days').select('*').gte('day', since),
    sb.from('checkins').select('*').order('week'),
    sb.from('likes').select('*'),
    sb.from('comments').select('*').order('created_at'),
  ])
  const checkins = (c.data ?? []) as Checkin[]
  const profiles = (p.data ?? []) as Profile[]
  const paths = [...checkins.flatMap(x => ANGLES.map(a => x.photos[a]).filter(v => typeof v === 'string')), ...profiles.map(x => x.avatar)].filter(Boolean) as string[]
  // links assinados valem 6h: reaproveita os que têm menos de 5h (senão toda foto baixa de novo e pisca)
  const now = Date.now()
  const need = paths.filter(x => !signed.has(x) || now - signed.get(x)!.t > 5 * 3600e3)
  if (need.length) {
    const { data } = await sb.storage.from('fotos').createSignedUrls(need, 60 * 60 * 6)
    data?.forEach(x => { if (x.path && x.signedUrl) signed.set(x.path, { url: x.signedUrl, t: now }) })
  }
  const urls: Record<string, string> = {}
  paths.forEach(x => { const s = signed.get(x); if (s) urls[x] = s.url })
  return {
    me,
    profiles,
    settings: (s.data ?? { max_skips: 2, max_junk: 2 }) as Settings,
    days: (d.data ?? []) as Day[],
    checkins,
    likes: (l.data ?? []) as Like[],
    comments: (cm.data ?? []) as Comment[],
    urls,
  }
}

// números da semana de alguém
export function weekStats(data: Data, uid: string, ref = new Date()) {
  const wd = weekDays(ref)
  const mine = data.days.filter(d => d.user_id === uid && wd.includes(d.day))
  return {
    days: wd.map(day => mine.find(d => d.day === day)),
    trained: mine.filter(d => d.trained === true).length,
    skips: mine.filter(d => d.trained === false).length,
    junk: mine.reduce((a, d) => a + d.junk, 0),
  }
}

// frases pra quem estourou o limite (pedido do Ricardo: pegar pesado)
const ROAST_JUNK = [
  'Parabéns, frango. Mais uma bolacha e você vira o pacote.',
  'Tá treinando pra ser o gordo do antes e depois. Só que sem o depois.',
  'Teu shape é redondo. Redondo é forma, não é shape.',
  'Comeu de novo? Ninguém muda comendo igual a quem não quer mudar.',
  'O espelho pediu férias. Culpa tua.',
  'Gordura não some com desculpa. Mas desculpa você tem de sobra, né?',
  'Teu metabolismo mandou dizer: "desisto, mano".',
  'Se comer fosse esporte você já era profissional, gordão.',
  'Vai lá, come mais. Daqui a um ano a foto vai ser a mesma. Igualzinha.',
  'Você não tem fome. Você tem fraqueza.',
]
const ROAST_SKIP = [
  'Furou de novo. O sofá agradece a lealdade.',
  'Frango que não treina vira nugget.',
  'O cara do lado tá evoluindo. Você tá só envelhecendo.',
  'Hoje não, amanhã não... o shape também não.',
  'Desculpa não levanta peso, campeão.',
  'Teu músculo tá em modo avião faz tempo.',
  'Daqui a pouco a academia te cobra pra lembrar quem você é.',
  'Quem fura treino fura a própria cara no espelho.',
]
export const roast = (kind: 'junk' | 'skip') => {
  const l = kind === 'junk' ? ROAST_JUNK : ROAST_SKIP
  return l[Math.floor(Math.random() * l.length)]
}
