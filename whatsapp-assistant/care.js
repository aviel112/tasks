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

// ===== 22.11.26 (אביאל בחר בסקר): ארבע "דחיפות" — צעדים בערב, מתאמן חדש שלא נכנס, בדיקות דם, תמונות שלא הועלו =====
const talkedToday = async (c, who, today) => D.drafts.sentFor({ name: c.name, phone: who.phone, chat_jid: who.chat_jid }).some((x) => String(x.at).slice(0, 10) === today) ||
  !!(await D.biz.inboundSince(who.chat_jid, today + 'T00:00:00+02:00').catch(() => [1])).length
const weekKey = (d) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - t.getUTCDay()); return t.toISOString().slice(0, 10) } // ראשון של השבוע

// 1) צעדים בערב (20:00): רק מי שיש לו יעד, רשם היום צעדים (אחרת לא יודעים) ורחוק ממנו ב-25%+. עד פעמיים בשבוע
async function stepsPush() {
  const st = load(); st.steps = st.steps || {}; const today = D.today(), wk = weekKey(today); let made = 0
  for (const c of await people()) {
    const rec = st.steps[c.name] || {}; if (rec.last === today || (rec.wk === wk && rec.n >= 2)) continue
    const card = await D.coachApi('dashboardClientCard', [c.name]).catch(() => null); if (!card || !card.token) continue
    const d = await D.dataOf(card.token).catch(() => null); if (!d || (d.feat && d.feat.steps === false)) continue
    const goal = +d.stepsGoal || 0, t = (d.week || []).find((x) => x.d === today), n = t && t.steps != null ? +t.steps : null
    if (!goal || n == null || n >= goal * 0.75 || goal - n < 1500) continue
    const who = await whoOf(c); if (busyWith(who) || await talkedToday(c, who, today)) continue
    const left = goal - n, mins = Math.max(10, Math.round(left / 100 / 5) * 5)
    const id = await D.alertWithDraft({ title: 'צעדים', who, headline: `${n.toLocaleString('he-IL')} מתוך ${goal.toLocaleString('he-IL')} צעדים היום`,
      situation: `השעה 20:00. ${first(c.name)} עשה/תה היום ${n} צעדים, והיעד היומי שאביאל קבע הוא ${goal}. חסרים ${left} צעדים, בערך ${mins} דקות הליכה.`,
      extraRules: 'הודעה קצרה מאוד (1–2 שורות) בקול של אביאל, דוחפת בלי לנזוף: כמה חסר והצעה אחת פשוטה (הליכה של X דקות עכשיו / אחרי האוכל). בלי הסברים על בריאות.', hold: true, noQuote: true }).catch((e) => { D.log('[care-steps]', c.name, e.message); return false })
    if (id) { st.steps[c.name] = { last: today, wk, n: rec.wk === wk ? (rec.n || 0) + 1 : 1 }; made++; save(st) }
  }
  return made
}

// 2) מתאמן חדש שלא נכנס: 2–14 ימים מתחילת הליווי ואף פעם לא פתח את האפליקציה. פעמיים לכל היותר, 4 ימים ביניהן
async function notOpened() {
  const st = load(); st.open = st.open || {}; const today = D.today(); let made = 0
  const list = (await D.coachApi('dashboardList')) || {}, seenOf = {}; (list.clients || []).forEach((x) => { seenOf[x.name] = x.seen || {} })
  for (const c of await people()) {
    const sn = seenOf[c.name] || {}; if (sn.d || sn.at || !c.start) continue
    const age = days(c.start, today), rec = st.open[c.name] || { n: 0 }; if (age < 2 || age > 14 || rec.n >= 2 || (rec.last && days(rec.last, today) < 4)) continue
    const card = await D.coachApi('dashboardClientCard', [c.name]).catch(() => null); if (!card || !card.token) continue
    const who = await whoOf(c); if (busyWith(who)) continue
    const link = await D.coachApi('dashboardAppLink', [c.name]).then((r) => r && r.link).catch(() => '')
    const id = await D.alertWithDraft({ title: 'לא נכנס לאפליקציה', who, headline: `${age} ימים מתחילת הליווי ועוד לא פתח/ה את האפליקציה`,
      situation: `${first(c.name)} התחיל/ה ליווי לפני ${age} ימים וקיבל/ה קישור לאפליקציה, אבל עוד לא פתח/ה אותה אף פעם.` + (link ? ` הקישור: ${link}` : ''),
      extraRules: 'הודעה קצרה (2–3 שורות) בקול של אביאל, בלי האשמה: לשאול אם הקישור נפתח, להזכיר שכל התפריט והתוכנית מחכים שם, ולצרף את הקישור בדיוק כמו שהוא. לסיים בהצעה לעזור אם משהו לא עובד.', hold: true, noQuote: true }).catch((e) => { D.log('[care-open]', c.name, e.message); return false })
    if (id) { st.open[c.name] = { n: rec.n + 1, last: today }; made++; save(st) }
  }
  return made
}

// 3) בדיקות דם בוואטסאפ: 7+ ימים מתחילת הליווי ועוד לא נשלחו. כל 4 ימים, עד 3 פעמים
async function bloodNag() {
  const st = load(); st.blood = st.blood || {}; const today = D.today(); let made = 0
  for (const c of await people()) {
    if (!c.start || days(c.start, today) < 7) continue
    const rec = st.blood[c.name] || { n: 0 }; if (rec.n >= 3 || (rec.last && days(rec.last, today) < 4)) continue
    const card = await D.coachApi('dashboardClientCard', [c.name]).catch(() => null); if (!card) continue
    if (card.blood || card.bloodFile || (card.bloodFiles || []).length || card.bloodPending) continue
    const eff = card.feat && card.feat.eff; if (eff && eff.vit === false) continue // בלי ויטמינים = בלי בדיקות דם (כמו באפליקציה)
    const who = await whoOf(c); if (busyWith(who) || await talkedToday(c, who, today)) continue
    const id = await D.alertWithDraft({ title: 'בדיקות דם', who, headline: `עוד לא שלח/ה בדיקות דם (${days(c.start, today)} ימים בליווי)${rec.n ? ' · תזכורת ' + (rec.n + 1) : ''}`,
      situation: `${first(c.name)} בליווי ${days(c.start, today)} ימים ועוד לא שלח/ה בדיקות דם. שולחים מהאפליקציה, בכרטיס "בדיקות דם" במסך הבית (צילום או PDF), ומקבלים ניתוח: מה חסר, מה לבדוק אצל הרופא ואילו תוספים שווים.` + (rec.n ? ' כבר הזכרנו לפני כמה ימים.' : ''),
      extraRules: 'הודעה קצרה (2–3 שורות) בקול של אביאל: למה זה חשוב לו (להתאים תוספים ותזונה), איפה שולחים באפליקציה, ושאם אין בדיקות עדכניות — לקבוע אצל רופא המשפחה. בלי לחץ.', hold: true, noQuote: true }).catch((e) => { D.log('[care-blood]', c.name, e.message); return false })
    if (id) { st.blood[c.name] = { n: rec.n + 1, last: today }; made++; save(st) }
  }
  return made
}

// 4) תמונות שלא הועלו: האפליקציה מבקשת תמונות (photoDue) כבר 3 ימים ברצף. פעם אחת לכל בקשה
async function photosNag() {
  const st = load(); st.ph = st.ph || {}; const today = D.today(); let made = 0
  for (const c of await people()) {
    const card = await D.coachApi('dashboardClientCard', [c.name]).catch(() => null); if (!card || !card.token) continue
    const d = await D.dataOf(card.token).catch(() => null); if (!d) continue
    const rec = st.ph[c.name] || {}
    if (!d.photoDue || (d.feat && d.feat.photos === false)) { if (rec.since) { delete st.ph[c.name]; save(st) } continue }
    if (!rec.since) { st.ph[c.name] = { since: today }; save(st); continue }
    if (rec.sent || days(rec.since, today) < 3) continue
    const who = await whoOf(c); if (busyWith(who) || await talkedToday(c, who, today)) continue
    const firstTime = !(card.ba || []).length
    const id = await D.alertWithDraft({ title: 'תמונות', who, headline: `${firstTime ? 'תמונות התחלה' : 'תמונות החודש'} מחכות ${days(rec.since, today)} ימים`,
      situation: `האפליקציה מבקשת מ${first(c.name)} ${firstTime ? 'תמונות התחלה' : 'את תמונות החודש'} כבר ${days(rec.since, today)} ימים, ועוד לא הועלו. 4 תמונות: חזית, שני הצדדים וגב, באותו מקום ובאותה תאורה. רק אביאל רואה אותן.`,
      extraRules: 'הודעה קצרה (2–3 שורות) בקול של אביאל: למה התמונות חשובות (המשקל לא מראה הכל, התמונות כן), לבקש להצטלם היום, שתי דקות מול מראה. בלי לחץ ובלי מבוכה.', hold: true, noQuote: true }).catch((e) => { D.log('[care-ph]', c.name, e.message); return false })
    if (id) { rec.sent = today; st.ph[c.name] = rec; made++; save(st) }
  }
  return made
}

module.exports = { init, suppRefill, milestones, afterWorkout, stepsPush, notOpened, bloodNag, photosNag, liftGains, todayWorkout, _days: days }
