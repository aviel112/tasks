// 22.11.26 (אביאל בחר בסקר): שלוש טיוטות "אכפתיות" שנכנסות לתור אחת אחת, רק עם נתונים אמיתיים מהלוח ומהאפליקציה.
// 1) תזכורת תוספים — 28 יום אחרי "קיבלתי את התוספים" (ומקסימום 3 פעמים, כל 30 יום), עם הקישורים שלו מאייהרב.
// 2) ציון דרך — חודש / חודשיים / 3 / 6 מתחילת הליווי, עם התקדמות אמיתית מהאפליקציה (משקל בתרגיל: ראשון → הכי טוב).
// 3) בדיקה אחרי אימון — בערב של יום שבו המתאמן רשם אימון באפליקציה; פעם בשבוע לכל היותר, לא אם כבר דיברתם היום.
const fs = require('fs')
const path = require('path')
const STATE = path.join(__dirname, 'care-state.json')
let D = null // deps: coachApi, planOf, alertWithDraft, drafts, biz, owner, today, log
function init(d) { D = d }
function load() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return {} } }
function save(s) { fs.writeFileSync(STATE + '.tmp', JSON.stringify(s)); fs.renameSync(STATE + '.tmp', STATE) }
const pn = (raw) => { let d = String(raw || '').replace(/\D/g, ''); if (d.startsWith('972')) return d; if (d.startsWith('0')) d = d.slice(1); return /^5\d{8}$/.test(d) ? '972' + d : '' }
const days = (a, b) => Math.round((Date.parse(String(b).slice(0, 10)) - Date.parse(String(a).slice(0, 10))) / 864e5)
const first = (n) => String(n || '').trim().split(/\s+/)[0]

async function people() {
  const [list, tags] = await Promise.all([D.coachApi('dashboardList'), D.coachApi('dashboardTagsAll').catch(() => ({}))])
  return ((list && list.clients) || []).filter((c) => c.status === 'פעיל' && pn(c.phone) && !(tags[c.name] || []).some((t) => t === 'משפחה' || t === 'בדיקה'))
}
async function whoOf(c) { const phone = pn(c.phone); const jid = (await D.biz.chatForPhone(phone).catch(() => null)) || `${phone}@s.whatsapp.net`; return { chat_jid: jid, display: c.name, phone, content: '' } }
const busyWith = (who) => !!D.drafts.pendingForPerson(who.chat_jid, who.phone).length

// התקדמות מהאפליקציה: לכל תרגיל — המשקל הראשון מול הכי טוב (רק תרגילים עם 2+ תאריכים שונים)
function liftGains(pl, max = 3) {
  const out = []
  for (const [ex, v] of Object.entries((pl && pl.lifts) || {})) {
    const h = (v.hist || []).filter((x) => x.d && +x.kg > 0); if (new Set(h.map((x) => x.d)).size < 2) continue
    const d0 = h.map((x) => x.d).sort()[0], kg0 = Math.max(...h.filter((x) => x.d === d0).map((x) => +x.kg)), best = Math.max(...h.map((x) => +x.kg))
    if (best > kg0) out.push({ ex, from: kg0, to: best, gain: best - kg0, pct: (best - kg0) / kg0 })
  }
  return out.sort((a, b) => b.pct - a.pct).slice(0, max)
}
// מה נעשה היום: תרגילים ושיאים חדשים (משקל מעל כל מה שהיה לפני היום)
function todayWorkout(pl, today) {
  const ex = [], prs = []
  for (const [name, v] of Object.entries((pl && pl.lifts) || {})) {
    const h = (v.hist || []).filter((x) => x.d); const t = h.filter((x) => x.d === today); if (!t.length) continue
    ex.push(name); const before = h.filter((x) => x.d < today && +x.kg > 0).map((x) => +x.kg), top = Math.max(...t.map((x) => +x.kg || 0))
    if (before.length && top > Math.max(...before)) prs.push({ ex: name, kg: top, prev: Math.max(...before) })
  }
  return { ex, prs }
}

async function suppRefill() {
  const st = load(); st.supp = st.supp || {}; let made = 0
  for (const c of await people()) {
    const card = await D.coachApi('dashboardClientCard', [c.name]).catch(() => null), sp = card && card.supp
    if (!sp || !sp.got || !(sp.items || []).length) continue
    const age = days(sp.got, D.today()), k = c.name + '|' + sp.at, done = st.supp[k] || 0
    if (age < 28 || done >= 3 || age < 28 + done * 30) continue
    const who = await whoOf(c); if (busyWith(who)) continue
    const items = sp.items.filter((x) => x.url).slice(0, 4)
    const situation = `לפני ${age} ימים ${first(c.name)} אישר/ה באפליקציה שקיבל/ה את התוספים שאביאל המליץ: ${sp.items.map((x) => x.t + (x.dose ? ' (' + x.dose + ')' : '')).join(', ')}. ` +
      'אריזה של חודש בערך נגמרת עכשיו. הקישורים לרכישה (הקוד של אביאל כבר בפנים):\n' + items.map((x) => x.t + ': ' + x.url).join('\n')
    const id = await D.alertWithDraft({ title: 'תזכורת תוספים', who, headline: `תזכורת תוספים (${age} ימים מאז שקיבל/ה)`, situation,
      extraRules: 'הודעה קצרה (2–4 שורות): לשאול אם זה מתחיל להיגמר ואיך מרגישים איתם, ואז הקישורים בדיוק כמו שהם, כל אחד בשורה עם שם התוסף. בלי לחץ מכירה, בלי מחירים.', hold: true, noQuote: true }).catch((e) => { D.log('[care-supp]', c.name, e.message); return false })
    if (id) { st.supp[k] = done + 1; made++; save(st) }
  }
  return made
}

const MILES = [30, 60, 90, 180]
async function milestones() {
  const st = load(); st.mile = st.mile || {}; let made = 0
  for (const c of await people()) {
    if (!c.start) continue
    const age = days(c.start, D.today()), m = MILES.find((x) => age >= x && age <= x + 3); if (!m) continue
    const k = c.name + '|' + c.start + '|' + m; if (st.mile[k]) continue
    const who = await whoOf(c); if (busyWith(who)) continue
    const card = await D.coachApi('dashboardClientCard', [c.name]).catch(() => null)
    const pl = card && card.token ? await D.planOf(card.token).catch(() => null) : null
    const g = liftGains(pl), f = await D.coachApi('dashboardWeekFacts', [c.name]).catch(() => null)
    const label = m === 30 ? 'חודש' : m === 60 ? 'חודשיים' : m === 90 ? '3 חודשים' : 'חצי שנה'
    const facts = [g.length ? 'התקדמות בכוח מאז שהתחיל/ה (מהאפליקציה): ' + g.map((x) => `${x.ex} ${x.from}→${x.to} ק"ג`).join(', ') : '',
      f && f.weighs && f.avg ? `שקילות השבוע: ${f.weighs}, ממוצע ${f.avg} ק"ג` : ''].filter(Boolean)
    st.mile[k] = new Date().toISOString(); save(st) // גם בלי נתונים — לא לחזור על אותו ציון דרך
    if (!facts.length) continue // בלי מספר אמיתי אין חגיגה — לא ממציאים
    const strong = g.some((x) => x.pct >= 0.15)
    const id = await D.alertWithDraft({ title: 'ציון דרך', who, headline: `${label} מתחילת הליווי${strong ? ' (התקדמות יפה — אפשר לבקש המלצה)' : ''}`,
      situation: `היום ${label} מאז ש${first(c.name)} התחיל/ה ללוות עם אביאל (${c.start}). ${facts.join('. ')}.`,
      extraRules: 'הודעת חגיגה קצרה (2–4 שורות) בקול של אביאל: לציין את הזמן ולהביא נתון אמיתי אחד או שניים מלמעלה, בלי להגזים ובלי מספר שלא מופיע. ' +
        (strong ? 'נוסח 1: לסיים בשאלה מה הכי השתנה אצלו/ה. נוסח 2: אותו דבר, ובסוף בקשה רכה למשפט קצר על התהליך שאפשר לשתף (המלצה), בלי לחץ.' : 'לסיים בשאלה אחת: מה הכי השתנה אצלו/ה מאז שהתחלנו.'), hold: true, noQuote: true }).catch((e) => { D.log('[care-mile]', c.name, e.message); return false })
    if (id) made++
  }
  return made
}

async function afterWorkout() {
  const st = load(); st.wk = st.wk || {}; const today = D.today(); let made = 0
  for (const c of await people()) {
    const last = st.wk[c.name]; if (last && days(last, today) < 7) continue
    const card = await D.coachApi('dashboardClientCard', [c.name]).catch(() => null); if (!card || !card.token) continue
    const pl = await D.planOf(card.token).catch(() => null); const w = todayWorkout(pl, today); if (w.ex.length < 2) continue
    const who = await whoOf(c); if (busyWith(who)) continue
    const talked = D.drafts.sentFor({ name: c.name, phone: who.phone, chat_jid: who.chat_jid }).some((x) => String(x.at).slice(0, 10) === today) ||
      (await D.biz.inboundSince(who.chat_jid, today + 'T00:00:00+02:00').catch(() => [1])).length
    if (talked) continue
    const id = await D.alertWithDraft({ title: 'אחרי אימון', who, headline: `התאמן/ה היום באפליקציה${w.prs.length ? ' · שיא חדש ב' + w.prs[0].ex : ''}`,
      situation: `היום ${first(c.name)} רשם/ה אימון באפליקציה: ${w.ex.slice(0, 6).join(', ')}.` + (w.prs.length ? ' שיאים חדשים היום: ' + w.prs.map((x) => `${x.ex} ${x.kg} ק"ג (לפני כן ${x.prev})`).join(', ') + '.' : ''),
      extraRules: 'הודעה קצרה מאוד (1–2 שורות) בקול של אביאל: ' + (w.prs.length ? 'לפרגן על השיא בתרגיל עם המספר, ' : 'להתייחס לתרגיל אחד מהאימון בשם, ') + 'ולשאול שאלה אחת: איך הגוף מרגיש אחרי. לא דוח, לא הסבר.', hold: true, noQuote: true }).catch((e) => { D.log('[care-wk]', c.name, e.message); return false })
    if (id) { st.wk[c.name] = today; made++; save(st) }
  }
  return made
}

module.exports = { init, suppRefill, milestones, afterWorkout, liftGains, todayWorkout, _days: days }
