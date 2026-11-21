import { createClient } from '@supabase/supabase-js'

// chave pública (feita pra ficar no app); a segurança é o RLS no banco
export const sb = createClient(
  'https://quiolvmfxlggktzrgngq.supabase.co',
  'sb_publishable_DvAYEDREa2_dJH608NeFiw_gTjrf1mX',
)

export type Angle = 'frente' | 'lado' | 'costas'
export const ANGLES: Angle[] = ['frente', 'lado', 'costas']

export type Profile = { id: string; username: string; name: string; is_admin: boolean; height_cm: number | null; goal_kg: number | null }
export type Settings = { max_skips: number; max_junk: number }
export type Day = { user_id: string; day: string; trained: boolean | null; junk: number }
export type Checkin = { id: string; user_id: string; week: string; weight: number | null; note: string | null; photos: Partial<Record<Angle, string>>; created_at: string }
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
export function weekDays(d = new Date()) {
  const m = monday(d)
  return Array.from({ length: 7 }, (_, i) => iso(new Date(m.getFullYear(), m.getMonth(), m.getDate() + i)))
}
export const fmtKg = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(1).replace('.', ','))
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
  const paths = checkins.flatMap(x => Object.values(x.photos)).filter(Boolean) as string[]
  const urls: Record<string, string> = {}
  if (paths.length) {
    const { data } = await sb.storage.from('fotos').createSignedUrls(paths, 60 * 60 * 6)
    data?.forEach(x => { if (x.path && x.signedUrl) urls[x.path] = x.signedUrl })
  }
  return {
    me,
    profiles: (p.data ?? []) as Profile[],
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
