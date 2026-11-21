// só no PC (npm run dev → /?demo): dados de mentira pra ver as telas sem logar
import { iso, monday, type Data } from './lib'

const svg = (w: number, hue: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="#1a1b1a"/><circle cx="150" cy="70" r="30" fill="${hue}"/><rect x="${150 - w}" y="110" width="${w * 2}" height="150" rx="40" fill="${hue}"/><rect x="${150 - w + 10}" y="250" width="${w - 14}" height="140" rx="12" fill="${hue}"/><rect x="154" y="250" width="${w - 14}" height="140" rx="12" fill="${hue}"/></svg>`)

// pose de exemplo (só pra ver o molde no modo demo)
const DEMO_POSE = Array.from({ length: 33 }, (_, i) => { const P: Record<number, [number, number]> = { 0: [.5, .12], 11: [.4, .24], 12: [.6, .24], 13: [.36, .4], 14: [.64, .4], 15: [.35, .55], 16: [.65, .55], 23: [.44, .55], 24: [.56, .55], 25: [.44, .75], 26: [.56, .75], 27: [.44, .93], 28: [.56, .93] }; const p = P[i]; return (p ? [p[0], p[1], 1] : [.5, .5, 0]) as [number, number, number] })

export function demo(): Data {
  const R = 'r', F = 'f'
  const m = monday()
  const wk = (i: number) => iso(new Date(m.getFullYear(), m.getMonth(), m.getDate() - 7 * i))
  const checkins: Data['checkins'] = []
  const urls: Record<string, string> = {}
  for (let i = 7; i >= 1; i--) {
    for (const [u, base, hue] of [[R, 84.6, '#cfd2ce'], [F, 91.2, '#9fa39e']] as const) {
      const path = `${u}/${wk(i)}/frente.jpg`
      urls[path] = svg(62 - (7 - i) * 3, hue)
      checkins.push({ id: u + i, user_id: u, week: wk(i), weight: +(base - (7 - i) * 0.5).toFixed(1), note: i === 1 ? 'Supino 70. Bora.' : null, photos: { frente: path, ...(i === 7 && u === R ? { pose: { frente: DEMO_POSE } } : {}) }, created_at: wk(i) })
    }
  }
  const days: Data['days'] = []
  for (let i = 0; i < 40; i++) {
    const d = iso(new Date(Date.now() - i * 864e5))
    days.push({ user_id: R, day: d, trained: i % 3 !== 2, junk: i % 4 === 0 ? 1 : 0, kinds: i % 2 ? ['academia'] : ['corrida', 'aerobico'] })
    days.push({ user_id: F, day: d, trained: i % 4 === 3 ? false : true, junk: i % 3 === 0 ? 2 : 0, kinds: ['academia'] })
  }
  return {
    me: R,
    profiles: [
      { id: R, username: 'ricardo', name: 'Ricardo', is_admin: true, height_cm: 178, goal_kg: 78, weight_kg: 81.6, fat_pct: 22, avatar: null },
      { id: F, username: 'gabriel', name: 'Gabriel', is_admin: false, height_cm: 182, goal_kg: 85, weight_kg: null, fat_pct: null, avatar: null },
    ],
    settings: { max_skips: 2, max_junk: 2 },
    days, checkins, urls,
    likes: [{ checkin_id: 'f1', user_id: R }],
    comments: [{ id: 'c1', checkin_id: 'f1', user_id: R, body: 'Tá saindo do frango!', created_at: '' }],
  }
}
