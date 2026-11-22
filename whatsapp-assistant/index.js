// העוזרת האישית של אביאל — בוט ווטסאפ שמחובר ל-Claude ולמערכות העסק
const { Client, LocalAuth, MessageMedia, Poll } = require('whatsapp-web.js')
const qrcode = require('qrcode')
const cron = require('node-cron')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const { askBrain, askBrainOnce, resetSession, isLimitError } = require('./brain')
const biz = require('./business-whatsapp')
const drafts = require('./drafts')
const profiles = require('./profiles')
const transcripts = require('./transcripts')
const promisesMod = require('./promises')
const api = require('./api')
const { buildWeeklyScripts } = require('./weekly-scripts')
const advisor = require('./advisor-bots') // בוטי היועץ: סוגר לידים, חידושים, הוכחות, הפניות, "נסגר", דוח מנכ"ל (22.10.26)
const { loadRequests, saveRequests, parseRequestMessage } = require('./recipe-requests')

const ROOT = __dirname
const CONFIG_PATH = path.join(ROOT, 'config.json')
const STATUS_PATH = path.join(ROOT, 'status.json')
const QR_PATH = path.join(ROOT, 'qr.png')

const PAIR_PHRASE = 'הפעל עוזר'
const DIGEST_PROMPT =
  'הכיני את הודעת הבוקר לפי "שגרת הבוקר" ב-CLAUDE.md: הלוז של היום מהמערכת, תזכורות של היום מ-reminders.json, בקשות ממתינות, ושאלת מיקוד אחת. החזירי רק את ההודעה עצמה.'
const EVENING_PROMPT =
  'הכיני את הודעת הערב לפי "שגרת הערב" ב-CLAUDE.md: הלוז של מחר מהמערכת, מה כדאי להכין, ושאלת סיכום יום אחת. החזירי רק את ההודעה עצמה.'
const WEEKLY_PROMPT =
  'הכיני את הסיכום השבועי לפי "הסיכום השבועי" ב-CLAUDE.md: נתוני השבוע מהמערכות (אימונים, ביטולים, לידים, סכנת נטישה) + תובנה אחת. החזירי רק את ההודעה עצמה.'
const REELS_PROMPT =
  'הכיני את "רעיונות ראשון" לפי CLAUDE.md: משכי את המחקר הטרי מ-data.js והציעי 3 רעיונות רילס לשבוע לפי תמהיל התוכן של אביאל, עם הוק מנוסח לכל אחד. החזירי רק את ההודעה עצמה.'
const MONTHLY_PROMPT =
  'הכיני את "דוח חודשי" לפי CLAUDE.md: הכנסות החודש שחלף מה-CRM (payments), מס\' תשלומים, מס\' לקוחות ששילמו, לקוח עם ההכנסה הגבוהה ביותר. החזירי רק את ההודעה עצמה.'

let config = {
  owner: null,
  digestCron: '0 9 * * *',
  eveningCron: '0 21 * * *',
  weeklyCron: '0 9 * * 0',
  reelsCron: '0 10 * * 0',
  monthlyCron: '0 9 1 * *',
}
try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } } catch {}
const saveConfig = () => fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))

function setStatus(state, extra = {}) {
  const s = { state, at: new Date().toISOString(), owner: config.owner, ...extra }
  fs.writeFileSync(STATUS_PATH, JSON.stringify(s, null, 2))
  console.log(`[status] ${state}`, extra.reason || '')
}

// סימן בלתי-נראה בתחילת כל תשובה של הבוט — כדי שלא יגיב להודעות של עצמו
const BOT_MARK = '​'

// המרת Markdown רגיל לפורמט של ווטסאפ
function toWhatsApp(text) {
  return (
    BOT_MARK +
    drafts.stripEmoji(text)
      .replace(/\*\*(.+?)\*\*/g, '*$1*')
      .replace(/^#{1,6}\s*(.+)$/gm, '*$1*')
      .replace(/^[ \t]*[-*]\s+/gm, '• ')
      .trim()
  )
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(ROOT, '.wwebjs_auth') }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  webVersion: '2.3000.1055156383', webVersionCache: { type: 'local', path: path.join(ROOT, '.wwebjs_cache'), strict: true }, // 18.11.26: גרסת ווטסאפ ווב החדשה נתקעת אחרי authenticated
})
const routes = require('./routes') // 19.11.26: פיצול ההודעות לאביאל ל-3 קבוצות (מתאמנים / עסק / אישי)
let ROUTE_REPLY = { gid: '', until: 0 } // אחרי הודעה של אביאל בקבוצה: 3 דקות שבהן המענה חוזר לאותה קבוצה
// 22.11.26 (אביאל: "אל תשלח יותר הודעות על מתאמנים בפרטי, רק בקבוצה"): כל הודעה לאביאל שמזכירה מתאמן בשם → קבוצת המתאמנים
let TRAINEE_RE = null
async function refreshTraineeNames() { try { const l = await coachApi('dashboardList'); const ns = new Set(); for (const c of (l && l.clients) || []) { const n = String(c.name || '').trim(); if (!n) continue; ns.add(n); const f = n.split(' ')[0]; if (f.length >= 3) ns.add(f) }
  if (ns.size) TRAINEE_RE = new RegExp('(^|[^\u0590-\u05FF])[ולב]?(' + [...ns].sort((a, b) => b.length - a.length).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=$|[^\u0590-\u05FF])') } catch (e) { console.error('[trainee-names]', e.message) } }
setTimeout(refreshTraineeNames, 5000); setInterval(refreshTraineeNames, 30 * 60 * 1000)
const aboutTrainee = (t) => !!(TRAINEE_RE && TRAINEE_RE.test(String(t || '')))
const OUT_SEEN = [] // הודעות שיצאו בפועל (message_create), 60 שניות אחרונות
const TECH_RE = /```|python3? -c|\bcd ~\/|במסוף|בטרמינל|תריץ את (?:הפקודה|זה)|npm (?:run|install)|node [\w./-]+\.js/ // 22.11.26: אביאל לא מקבל קוד/פקודות
{ const _send = client.sendMessage.bind(client); client.sendMessage = (to, ...r) => { let dest = to
    if (to === config.owner && typeof r[0] === 'string' && TECH_RE.test(r[0])) { try { fs.appendFileSync(path.join(ROOT, 'brain', 'tech-todo.md'), `\n## ${new Date().toISOString()}\n${r[0].slice(0, 3000)}\n`) } catch {} console.log('[tech-filter] held a technical message for Claude Code'); r[0] = toWhatsApp('משהו טכני לא הצליח אצלי. העברתי לתיקון, לא צריך לעשות כלום.') }
    try { if (to === config.owner) { if (UPD_UNTIL > Date.now() && updGid()) dest = updGid(); else if (ROUTE_REPLY.until > Date.now() && ROUTE_REPLY.gid) dest = ROUTE_REPLY.gid; else { const txt = typeof r[0] === 'string' ? r[0] : ((r[1] && r[1].caption) || ''); let cat = routes.classify(txt); if ((!cat || cat === 'biz') && aboutTrainee(txt) && !/^\*?(ליד|5 לסגור)/.test(txt.replace(/^[\u200b\s]+/, ''))) cat = 'coach'; dest = routes.gidFor(cat) || to } } } catch (e) { dest = to }
    const body = typeof r[0] === 'string' ? r[0] : ''
    return _send(dest, ...r).catch(async (e) => { // 22.11.26: ווטסאפ לפעמים זורק שגיאה אחרי שההודעה כבר יצאה → בודקים לפני שמנסים שוב (אחרת כפילויות)
      if (body) { await new Promise((res) => setTimeout(res, 4000)); const hit = OUT_SEEN.find((x) => x.to === dest && x.body === body && Date.now() - x.at < 60000); if (hit) { console.log('[send] error but delivered, not resending'); return hit.msg } }
      if (dest !== to) { console.error('[routes] group send failed, falling back', e.message); return _send(to, ...r) } throw e }) } } // 5.11.26 מענה בקבוצת העדכונים

// ── פעולות אמיתיות שהמוח מבקש בפורמט מובנה (לא קוד חופשי) ──
const REM_PATH = path.join(ROOT, 'reminders.json')
const loadRems = () => { try { return JSON.parse(fs.readFileSync(REM_PATH, 'utf8')) } catch { return [] } }
const saveRems = (r) => { const tmp = REM_PATH + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(r, null, 2)); fs.renameSync(tmp, REM_PATH) }
const parseAt = (s) => new Date(String(s).trim().replace(' ', 'T')) // "YYYY-MM-DD HH:MM" בשעון מקומי

// בדיקת תזכורות שהגיע זמנן — כל 30 שניות
let remBusy = false
setInterval(async () => {
  if (!config.owner || !clientReady || remBusy) return // לא למחוק תזכורת כשווטסאפ לא מחובר — היא תישלח כשיתחבר
  const due = loadRems().filter((r) => parseAt(r.at).getTime() <= Date.now())
  if (!due.length) return
  remBusy = true
  try {
    for (const r of due) {
      const ok = await Promise.race([client.sendMessage(config.owner, toWhatsApp('⏰ *תזכורת:* ' + r.text)).then(() => true), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 60000))]).catch((e) => { console.error('[reminder]', e.message); return false }) // שליחה תקועה לא עוצרת את כל התזכורות
      if (!ok) break // נשארת ברשימה — ניסיון נוסף בעוד 30 שניות
      if (r.file && fs.existsSync(r.file)) await client.sendMessage(config.owner, MessageMedia.fromFilePath(r.file), { sendMediaAsDocument: true }).catch((e) => console.error('[reminder file]', e.message)) // 6.11: תזכורת עם קובץ מצורף (נשלח כמסמך כדי לשמור איכות)
      saveRems(loadRems().filter((x) => !(x.at === r.at && x.text === r.text))) // נמחקת רק אחרי שנשלחה
      console.log('[reminder] fired:', r.text)
    }
  } finally { remBusy = false }
}, 30000)

// אירוע ביומן אפל (iCloud) — יומן "בית" מאומת שמסונכרן בפועל לאייפון של אביאל
// (היומן "aviamira5@gmail.com" בקלנדר המק מקושר לגוגל ולא הגיע לטלפון — לא בשימוש)
const ICLOUD_CALENDAR = 'בית'

function addCalendarEvent(at, durMin, title) {
  return new Promise((resolve, reject) => {
    const d = parseAt(at)
    if (isNaN(d)) return reject(new Error('תאריך לא תקין: ' + at))
    const mins = Math.max(5, parseInt(durMin, 10) || 60)
    const t = String(title).replace(/["\\]/g, '').slice(0, 120)
    const script = [
      'set d to current date',
      `set year of d to ${d.getFullYear()}`,
      `set month of d to ${d.getMonth() + 1}`,
      `set day of d to ${d.getDate()}`,
      `set hours of d to ${d.getHours()}`,
      `set minutes of d to ${d.getMinutes()}`,
      'set seconds of d to 0',
      'tell application "Calendar"',
      `  tell calendar "${ICLOUD_CALENDAR}"`,
      `    make new event with properties {summary:"${t}", start date:d, end date:d + (${mins} * minutes)}`,
      '  end tell',
      'end tell',
    ].join('\n')
    execFile('/usr/bin/osascript', ['-e', script], { timeout: 30000 }, (err, out, serr) =>
      err ? reject(new Error((serr || err.message).slice(0, 200))) : resolve()
    )
  })
}

// קריאת אירועי היומן האישי (iCloud "בית") ליום מסוים — dayOffset: 0=היום, 1=מחר
function getCalendarEvents(dayOffset) {
  return new Promise((resolve, reject) => {
    const script = [
      'set d1 to current date',
      'set hours of d1 to 0',
      'set minutes of d1 to 0',
      'set seconds of d1 to 0',
      `set d1 to d1 + (${dayOffset} * days)`,
      'set d2 to d1 + 1 * days',
      'set nl to (ASCII character 10)',
      'tell application "Calendar"',
      `  tell calendar "${ICLOUD_CALENDAR}"`,
      '    set evs to (every event whose start date ≥ d1 and start date < d2)',
      '    set out to ""',
      '    repeat with e in evs',
      '      set sd to start date of e',
      '      set hh to text -2 thru -1 of ("0" & (hours of sd))',
      '      set mm to text -2 thru -1 of ("0" & (minutes of sd))',
      '      set out to out & hh & ":" & mm & " - " & (summary of e) & nl',
      '    end repeat',
      '    return out',
      '  end tell',
      'end tell',
    ].join('\n')
    execFile('/usr/bin/osascript', ['-e', script], { timeout: 20000 }, (err, out, serr) =>
      err ? reject(new Error((serr || err.message).slice(0, 200))) : resolve(String(out || '').trim())
    )
  })
}

// ── תמלול הודעות קוליות (whisper.cpp מקומי, חינם) ──
const WHISPER_PATHS = ['/usr/local/bin/whisper-cli', '/opt/homebrew/bin/whisper-cli']
const WHISPER_MODEL = path.join(ROOT, 'models', 'ggml-small.bin')
const whisperBin = () => WHISPER_PATHS.find((p) => fs.existsSync(p))
const voiceReady = () => !!whisperBin() && fs.existsSync(WHISPER_MODEL)

function transcribeVoice(msg) {
  return new Promise(async (resolve, reject) => {
    try {
      const media = await msg.downloadMedia()
      if (!media?.data) return reject(new Error('no media'))
      const base = path.join(ROOT, 'voice-' + Date.now())
      fs.writeFileSync(base + '.ogg', Buffer.from(media.data, 'base64'))
      execFile('/usr/local/bin/ffmpeg', ['-y', '-i', base + '.ogg', '-ar', '16000', '-ac', '1', base + '.wav'], { timeout: 60000 }, (err) => {
        if (err) { fs.rmSync(base + '.ogg', { force: true }); return reject(err) }
        execFile(whisperBin(), ['-m', WHISPER_MODEL, '-l', 'he', '-f', base + '.wav', '-np', '-nt'], { timeout: 180000, maxBuffer: 5 * 1024 * 1024 }, (err2, stdout) => {
          fs.rmSync(base + '.ogg', { force: true })
          fs.rmSync(base + '.wav', { force: true })
          if (err2) return reject(err2)
          resolve(String(stdout).trim())
        })
      })
    } catch (e) {
      reject(e)
    }
  })
}

// הוספת ליד חדש כאיש קשר בטלפון — כדי שה-Caller ID יזהה אותו כשמתקשר
function addContact(name, phone) {
  return new Promise((resolve, reject) => {
    const n = String(name || 'ליד חדש').replace(/["\\]/g, '').slice(0, 80)
    const p = String(phone || '').replace(/["\\]/g, '').slice(0, 20)
    if (!p) return resolve()
    const script = `tell application "Contacts"
  set p to make new person with properties {first name:"${n}", note:"ליד — נוסף אוטומטית ע\\"י העוזרת האישית"}
  make new phone at end of phones of p with properties {label:"mobile", value:"${p}"}
  save
end tell`
    execFile('/usr/bin/osascript', ['-e', script], { timeout: 20000 }, (err, out, serr) =>
      err ? reject(new Error((serr || err.message).slice(0, 200))) : resolve()
    )
  })
}

// ── התראת ליד חדש: בדיקת לשונית הלידים בלוח המתאמנים כל 15 דקות (ה-CRM ב-Railway הוצא משימוש) ──
const SEEN_PATH = path.join(ROOT, 'seen-leads-board.json')
const leadKey = (l) => String(l.id)

async function checkNewLeads() {
  if (!config.owner) return
  try {
    const { coachAlerts } = JSON.parse(fs.readFileSync(path.join(ROOT, 'brain', 'secrets.local.json'), 'utf8'))
    const res = await fetch(`${coachAlerts.api}?api=leads&k=${encodeURIComponent(coachAlerts.key)}`, { redirect: 'follow' }).then((r) => r.json())
    if (!res.ok || !Array.isArray(res.r)) return
    const leads = res.r

    let seen = null
    try { seen = JSON.parse(fs.readFileSync(SEEN_PATH, 'utf8')) } catch {}
    const isFirstRun = !seen
    const seenSet = new Set(seen?.keys || [])
    const fresh = leads.filter((l) => !seenSet.has(leadKey(l)))

    fs.writeFileSync(SEEN_PATH, JSON.stringify({ keys: leads.map(leadKey) }, null, 2))
    if (isFirstRun || !fresh.length) return // בריצה הראשונה רק מסמנים, בלי הצפה

    for (const l of fresh.slice(0, 5)) {
      const lines = ['*ליד חדש נכנס*', '']
      if (l.name) lines.push(l.name)
      if (l.phone) lines.push(l.phone)
      if (l.source) lines.push(`מקור: ${l.source}`)
      if (l.notes) lines.push(l.notes)
      lines.push('', 'מי שעונה מהר סוגר. לטיוטת פתיחה כתוב: נסחי פתיחה ל' + (l.name || 'ליד'))
      client.sendMessage(config.owner, toWhatsApp(lines.join('\n'))).catch(console.error)
      console.log('[lead] notified:', l.name || l.phone)
      if (l.phone) addContact(l.name, l.phone).catch((e) => console.error('[contact]', e.message))
    }
  } catch (e) {
    console.error('[leads]', e.message)
  }
}
setInterval(checkNewLeads, 15 * 60 * 1000)
setTimeout(checkNewLeads, 90 * 1000) // ריצה ראשונה קצת אחרי העלייה

// ── התראת ביטול פגישה בזמן אמת: בדיקת ה-Booking כל 10 דקות ──
const { booking: BOOKING_SECRETS } = JSON.parse(fs.readFileSync(path.join(ROOT, 'brain', 'secrets.local.json'), 'utf8'))
const SEEN_BOOKINGS_PATH = path.join(ROOT, 'seen-bookings.json')

async function checkBookingChanges() {
  if (!config.owner) return
  try {
    const res = await fetch(BOOKING_SECRETS.api, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'admin', op: 'list', key: BOOKING_SECRETS.adminKey }),
      redirect: 'follow',
    }).then((r) => r.json())
    if (!res.ok || !Array.isArray(res.bookings)) return

    let prev = null
    try { prev = JSON.parse(fs.readFileSync(SEEN_BOOKINGS_PATH, 'utf8')) } catch {}
    const isFirstRun = !prev
    const prevMap = prev?.map || {}
    const nextMap = {}
    const today = new Date().toISOString().slice(0, 10)

    for (const b of res.bookings) {
      nextMap[b.id] = b.status
      const prevStatus = prevMap[b.id]
      // התראה רק על ביטול פגישה שהייתה מאושרת/ממתינה, לפגישה שעוד לא עברה
      if (
        !isFirstRun &&
        prevStatus &&
        (prevStatus === 'approved' || prevStatus === 'pending') &&
        b.status === 'cancelled' &&
        b.date >= today
      ) {
        const lines = [
          '❌ *פגישה בוטלה*',
          '',
          `👤 ${b.name || 'לקוח'}`,
          `📅 ${b.date} בשעה ${b.time}`,
          b.serviceName ? `🏋️ ${b.serviceName}` : '',
          '',
          '⚡ יש חלון פנוי — שווה להציע ללקוח אחר',
        ].filter(Boolean)
        client.sendMessage(config.owner, toWhatsApp(lines.join('\n'))).catch(console.error)
        console.log('[booking] cancellation notified:', b.name, b.date, b.time)
      }
    }
    fs.writeFileSync(SEEN_BOOKINGS_PATH, JSON.stringify({ map: nextMap }, null, 2))
  } catch (e) {
    console.error('[bookingCheck]', e.message)
  }
}
setInterval(checkBookingChanges, 10 * 60 * 1000)

// ── התראת כאב/פציעה מצ׳ק-אין של מתאמן: בדיקה כל 15 דקות ──
const { coachAlerts: COACH_ALERTS } = JSON.parse(fs.readFileSync(path.join(ROOT, 'brain', 'secrets.local.json'), 'utf8'))
const SEEN_PAIN_PATH = path.join(ROOT, 'seen-pain.json')

async function checkPainCheckins() {
  if (!config.owner || !COACH_ALERTS) return
  try {
    const url = `${COACH_ALERTS.api}?api=alerts&k=${encodeURIComponent(COACH_ALERTS.key)}`
    const res = await fetch(url, { redirect: 'follow' }).then((r) => r.json())
    if (!res.ok || !Array.isArray(res.r)) return
    let seen = null
    try { seen = JSON.parse(fs.readFileSync(SEEN_PAIN_PATH, 'utf8')) } catch {}
    const seenSet = new Set(seen?.keys || [])
    const fresh = res.r.filter((a) => !seenSet.has(a.id))
    fs.writeFileSync(SEEN_PAIN_PATH, JSON.stringify({ keys: [...seenSet, ...fresh.map((a) => a.id)].slice(-300) }, null, 2))
    for (const a of fresh.slice(0, 5)) {
      const lines = ['*כאב או פציעה בצ׳ק-אין*', '', `${a.name} · ${a.at}`, `"${a.note}"`, '', 'כדאי לדבר איתו היום ולהתאים את התוכנית לפני האימון הבא.']
      client.sendMessage(config.owner, toWhatsApp(lines.join('\n'))).catch(console.error)
      console.log('[pain] notified:', a.name)
    }
  } catch (e) {
    console.error('[painCheck]', e.message)
  }
}
setInterval(checkPainCheckins, 15 * 60 * 1000)
setTimeout(checkPainCheckins, 2 * 60 * 1000)
setTimeout(checkBookingChanges, 120 * 1000) // ריצה ראשונה קצת אחרי העלייה

// ── דוח חיפוש דירות יומי: כתוב ע"י ה-Cloud Scheduled Task "daily-apartment-search-center" ──
// (רץ מחוץ לבוט הזה, כולל גלישה בפועל ביד2 ואימות פינוי-בינוי מול מפת המדינה)
// הבוט רק קורא את הקובץ ושולח בווטסאפ, ומוחק אותו אחרי שליחה כדי לא לשלוח כפול
const APARTMENT_REPORT_PATH = path.join(ROOT, 'apartment-report.json')

// אם ה-WhatsApp client נתקע (Puppeteer frame detached וכו') - שליחות נכשלות בשקט בלי ניתוק אמיתי.
// אחרי כמה כשלונות רצופים - יוצאים מהתהליך כדי שה-LaunchAgent יפעיל תהליך חדש עם דפדפן נקי.
let consecutiveSendFailures = 0
// כשלון שליחה לפני ש-WhatsApp מחובר הוא לא תקיעה — אחרת ה-watchdog מפיל את התהליך בלולאה וה-QR לא נשאר על המסך
let clientReady = false

// קבוצת הדירות עם אמא — הדוחות נשלחים אליה, וכל מה שנכתב בה נרשם לקובץ כדי שקלוד יקרא את הפידבק (16.11.26)
const APT_GROUP_NAME = 'דירה עד יולי'
const APT_FEEDBACK_PATH = path.join(ROOT, '..', 'rishon-deals', 'group-feedback.jsonl')
// getChats() קורס בחשבון הזה ("r") ומפיל את התהליך — מזהים את הקבוצה מהודעה שנכתבת בה ושומרים לקובץ
const APT_GID_PATH = path.join(ROOT, 'apartment-group.json')
let aptGid = null
try { aptGid = JSON.parse(fs.readFileSync(APT_GID_PATH, 'utf8')).gid || null } catch (_) {}
async function resolveAptGroup() { return aptGid }
function aptGroupAdopt(msg, cid) {
  console.log('[apartment] group msg seen', cid)
  msg.getChat().then((c) => {
    console.log('[apartment] group name', JSON.stringify((c && c.name) || ''))
    if (aptGid || String((c && c.name) || '').trim() !== APT_GROUP_NAME) return
    aptGid = cid
    fs.writeFileSync(APT_GID_PATH, JSON.stringify({ gid: cid, at: new Date().toISOString() }))
    console.log('[apartment] group adopted', cid)
    logAptFeedback(msg)
  }).catch((e) => {
    console.error('[apartment] getChat failed', e && e.message)
    if (String(msg.body || '').trim() === 'בדיקה' && (msg.fromMe || msg.author === config.owner)) { aptGid = cid; fs.writeFileSync(APT_GID_PATH, JSON.stringify({ gid: cid, at: new Date().toISOString(), via: 'בדיקה' })); console.log('[apartment] group adopted via בדיקה', cid) }
  })
}
function logAptFeedback(msg) {
  try {
    const row = { ts: new Date((msg.timestamp || Date.now() / 1000) * 1000).toISOString(), fromMe: !!msg.fromMe, author: msg.author || msg.from, type: msg.type, body: String(msg.body || '').slice(0, 2000) }
    if (row.fromMe && row.body.startsWith('🏠')) return // הדוחות שלנו
    fs.appendFileSync(APT_FEEDBACK_PATH, JSON.stringify(row) + '\n')
  } catch (e) { console.error('[apartment] feedback log', e.message) }
}

function checkApartmentReport() {
  if (!config.owner || !clientReady) return
  let data = null
  try { data = JSON.parse(fs.readFileSync(APARTMENT_REPORT_PATH, 'utf8')) } catch (e) {
    if (e.code !== 'ENOENT') console.error('[apartment] failed to parse report file:', e.message) // אין דוח = מצב רגיל
    return
  }
  if (!data || !data.report) return
  if (data.sendAt && Date.now() < Date.parse(data.sendAt)) return // מתוזמן — עוד לא הגיע הזמן
  // 16.11.26: to:"group" → לקבוצת "דירה עד יולי" (אביאל + אמא), לא לאביאל
  const destP = data.to === 'group' ? resolveAptGroup() : Promise.resolve(config.owner)
  destP
    .then((dest) => { if (!dest) { console.log('[apartment] group not known yet — report kept'); return 'skip' } return client.sendMessage(dest, toWhatsApp('🏠 *דירות לאמא*\n\n' + data.report)).then(async () => {
      // סקר אחרי הדוח: {question, options[]} — ההצבעות נרשמות ל-group-feedback.jsonl (vote_update)
      // הדוח כבר יצא — מוחקים מיד, שכשל בסקר לא יגרום לשליחה כפולה לקבוצה של אמא
      try { fs.unlinkSync(APARTMENT_REPORT_PATH) } catch (_) {}
      try {
        if (data.poll && Array.isArray(data.poll.options) && data.poll.options.length >= 2) {
          const pm = await client.sendMessage(dest, new Poll(data.poll.question, data.poll.options.slice(0, 12), { allowMultipleAnswers: true }))
          fs.appendFileSync(APT_FEEDBACK_PATH, JSON.stringify({ ts: new Date().toISOString(), type: 'poll_sent', question: data.poll.question, options: data.poll.options, msgId: pm && pm.id && pm.id._serialized }) + '\n')
        }
        if (data.followup) await client.sendMessage(dest, toWhatsApp(data.followup))
      } catch (e) { console.error('[apartment] poll/followup failed (report already sent)', e.message) }
    }) })
    .then((r) => {
      if (r === 'skip') return
      try { fs.unlinkSync(APARTMENT_REPORT_PATH) } catch (_) {}
      console.log('[apartment] report sent and cleared, date:', data.date)
      consecutiveSendFailures = 0
    })
    .catch((e) => {
      console.error('[apartment]', e.message)
      consecutiveSendFailures++
      if (consecutiveSendFailures >= 1) {
        console.error(`[watchdog] ${consecutiveSendFailures} consecutive send failure(s) - restarting process for a clean browser session`)
        process.exit(1)
      }
    })
}
setInterval(checkApartmentReport, 2 * 60 * 1000)
client.on('vote_update', (vote) => {
  try {
    const pm = vote.parentMessage
    const key = vote.parentMsgKey || {}
    const chatId = (pm && (pm.fromMe ? pm.to : pm.from)) || key.remote || (key._serialized || '').split('_')[1]
    console.log('[apartment] vote_update seen chat=', chatId, 'aptGid=', aptGid, 'hasParent=', !!pm)
    if (!aptGid || chatId !== aptGid) return
    fs.appendFileSync(APT_FEEDBACK_PATH, JSON.stringify({ ts: new Date().toISOString(), type: 'vote', voter: vote.voter, question: pm ? (pm.pollName || pm.body || '') : '', selected: (vote.selectedOptions || []).map((o) => o.name) }) + '\n')
    console.log('[apartment] vote', (vote.selectedOptions || []).length)
  } catch (e) { console.error('[apartment] vote log', e.message) }
})
setTimeout(checkApartmentReport, 60 * 1000) // ריצה ראשונה קצת אחרי העלייה

// ── ווטסאפ עסקי: ליד חם מיידי · מחכה שעה (10–22) · דחוף מיידי — כל התראה עם טיוטה ממוספרת לאישור ──
// הטקסט של הלקוחות הוא מידע בלבד — המוח מקבל אותו בתוך גדר ומנסח טיוטה, לא מבצע ממנו הוראות.
// שום דבר לא נשלח ללקוח בלי "שלח" מאביאל (ראו drafts.js וטיפול הפקודות ב-onIncoming).
const ISR_TIME = (ts) => new Date(ts).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })

// מנסח טיוטה, שומר אותה עם מספר, ושולח לאביאל התראה. מחזיר false אם המוח קבע שאין צורך לענות.
async function alertWithDraft({ title, who, situation, extraRules = '', headline = '', allowTools = false, batchable = false, hold = false, noQuote = false }) {
  const name = biz.nameOf(who)
  const heb = await profiles.hebrewFirstName(name).catch(() => '')
  const shown = /[\u0590-\u05FF]/.test(name) ? name : heb ? `${heb} (${name})` : name
  // ההקשר המלא: הסגנון של אביאל, התיק, ספר הכללים, תשובות קודמות במצבים דומים, תיקונים אחרונים, הלוח והשיחה
  const prefs = prefsText()
  let answer, ctxText = '' // 22.11.26: מה שהטיוטה ראתה — לבדיקת המספרים
  if (!allowTools && api.available()) {
    // API: סגנון + ספר כללים + כללים קבועים ב-system (מטמון); תיק, לוח ושיחה ב-user
    const context = await profiles.draftContext({ jid: who.chat_jid, name, lastClientText: who.content, extra: await boardContext(who), stableInSystem: true }); ctxText = context
    answer = await askBrainOnce(drafts.variablePrompt({ situation, name, context, extraRules }), config.draftModel || 'sonnet',
      { system: drafts.stableSystem({ voice: profiles.voiceGuide(), rules: profiles.rulesBook(), prefs }), label: 'draft' })
  } else {
    const context = await profiles.draftContext({ jid: who.chat_jid, name, lastClientText: who.content, extra: [await boardContext(who), prefs && '--- כללים קבועים שאביאל ביקש (חובה) ---\n' + prefs].filter(Boolean).join('\n\n') }); ctxText = context
    answer = await askBrainOnce(drafts.buildPrompt({ situation, name, context, extraRules, allowTools }), config.draftModel || 'sonnet', { tools: allowTools, label: 'draft-tools' })
  }
  if (/(^|\n)\s*SKIP\s*$/i.test(answer.trim())) return false // SKIP בסוף גם אם המוח הסביר קודם
  const parsed = drafts.splitBrainDraft(answer)
  // כל מה שהלקוח כתב מאז התשובה האחרונה של אביאל (לא רק השורה האחרונה)
  const recent = (await biz.recentMessages(who.chat_jid, 8).catch(() => '')).split('\n')
  let streak = recent.slice(recent.map((l) => l.startsWith('אביאל:')).lastIndexOf(true) + 1).map((l) => l.replace(/^הוא\/היא:\s*/, '')).filter(Boolean)
  { const ls = drafts.recentSent(200).filter((x) => x.chat_jid === who.chat_jid).pop() // 22.11.26: מה שאביאל אישר יצא דרך הגשר ולא נשמר כ"שלו" — הציטוט מתחיל אחרי ההודעה האחרונה שנשלחה
    if (ls) { const after = await biz.inboundSince(who.chat_jid, ls.at).catch(() => null); if (after) streak = after.map((r) => String(r.content || '')).filter(Boolean) } }
  const saidFull = noQuote ? '' : (streak.length ? streak.join('\n') : String(who.content || '')).trim().slice(0, 500) // 22.11.26: הודעה יזומה (סיכום שבוע) — בלי ציטוט של צ'יט-צ'ט ישן
  const said = saidFull.replace(/\s+/g, ' ').slice(0, 160)
  const id = parsed ? drafts.add({ chat_jid: who.chat_jid, phone: who.phone, name, alias: heb, text: parsed.draft, alt: parsed.alt, alt2: parsed.alt2 || '', clientText: saidFull, risk: parsed.risk }) : null
  // שגרתי → נכנס לסבב הבא (12/16/20) במקום להקפיץ עכשיו
  if (false && id && batchable && parsed.risk === 'low') { // 22.11.26: בוטל — גם שגרתיות עוברות בתור אחת אחת
    drafts.setBatch(id, { shown, said })
    return true
  }
  // 22.11.26 (שומר מספרים): מספר בטיוטה שלא מופיע בשום מקור → שורת "לבדוק" מתחת לנוסחים
  const srcAll = [ctxText, situation, extraRules, headline, saidFull, who.content].join(' ')
  const unv = parsed ? [parsed.draft, parsed.alt, parsed.alt2].map((t, i) => ({ i: i + 1, n: t ? drafts.unverifiedNumbers(t, srcAll) : [] })).filter((x) => x.n.length) : []
  const tms = parsed ? [parsed.draft, parsed.alt, parsed.alt2].map((t, i) => ({ i: i + 1, n: t ? drafts.unverifiedTimes(t, [saidFull, who.content, situation].join(' ')) : [] })).filter((x) => x.n.length) : []
  for (const x of tms) { const u = unv.find((y) => y.i === x.i); if (u) u.n = [...new Set(u.n.concat(x.n))]; else unv.push(x) }
  const unvLine = unv.length ? '*לבדוק לפני ששולחים — מספר שלא מצאתי בנתונים:* ' + unv.map((x) => x.n.join(', ') + ` (נוסח ${x.i})`).join(' · ') : ''
  if (unv.length) console.log('[guard] unverified', name, JSON.stringify(unv))
  const quoteBlock = saidFull ? saidFull.split('\n').map((l) => '> ' + l).join('\n') : ''
  const head = headline ? `*${shown}* ${headline}` : `*${shown}* כתב${parsed && parsed.risk === 'low' ? ' (שגרתי)' : parsed ? ' (לבדוק)' : ''}:`
  const lines = parsed
    ? [head, quoteBlock, '', parsed.alt ? '*1.*' : '*התשובה שאשלח:*', parsed.draft, ...(parsed.alt ? ['', '*2.*', parsed.alt] : []), ...(parsed.alt2 ? ['', '*3.*', parsed.alt2] : []), ...(unvLine ? ['', unvLine] : []), '', drafts.approvalHint(id, heb || name, !!parsed.alt, !!parsed.alt2)]
    : [head, quoteBlock, '', drafts.stripEmoji(answer)]
  if (id) { draftQueuePush(id, lines.join('\n'), config.owner, !hold && !!String(who.content || '').trim()); return true } // 22.11.26: הכל בתור, אחת בכל פעם; לקוח שכתב — לפני טיוטות יזומות
  let sent; try { sent = await client.sendMessage(config.owner, toWhatsApp(lines.join('\n'))) } catch (e) { if (id) drafts.remove(id); throw e } // בלי התראה אין טיוטה (אחרת היא חוסמת את הלקוח 36 שעות)
  if (id && sent?.id?._serialized) drafts.setAlertMsgId(id, sent.id._serialized)
  if (id) offerDraft(id)
  return true
}

// ── סבב תשובות: כל הטיוטות השגרתיות בהודעה אחת, 12:00 / 16:00 / 20:00 ──
async function flushBatch() {
  if (!config.owner || !clientReady) return
  await dropAnsweredDrafts().catch(() => {})
  const ids = drafts.batchedIds()
  if (!ids.length) return
  const blocks = ids.map((i) => {
    const it = drafts.get(i)
    const k = String(it.alias || it.name).split(/\s+/)[0]
    const said = String(it.clientText || it.batch.said || '').split('\n').map((l) => '> ' + l).join('\n')
    return `*${it.batch.shown || it.name}* כתב:\n${said}\n*1 ${k}:* ${it.text.replace(/\n/g, ' / ')}` + (it.alt ? `\n*2 ${k}:* ${it.alt.replace(/\n/g, ' / ')}` : '') + (it.alt2 ? `\n*3 ${k}:* ${it.alt2.replace(/\n/g, ' / ')}` : '')
  })
  const names = ids.map((i) => String(drafts.get(i).alias || drafts.get(i).name).split(/\s+/)[0])
  const msg = [`*סבב תשובות* (${ids.length})`, '', blocks.join('\n\n'), '', `לבחור לכל אחד: "1 ${names[0]}", "2 ${names[0]}" או "3 ${names[0]}", כמה ביחד בפסיקים${names[1] ? ` (למשל: 1 ${names[0]}, 2 ${names[1]})` : ''} · "לא" עם שם = לא שולחת`].join('\n')
  const sent = await client.sendMessage(config.owner, toWhatsApp(msg)).catch(() => null)
  if (!sent) { console.error('[batch] send failed — kept for next round'); return }
  for (const i of ids) drafts.clearBatch(i, null) // הודעת סבב מכילה כמה — מאשרים לפי שם, לא לפי ציטוט
  lastOfferedDraftId = null; prevOfferedDraftId = null
  console.log('[batch] sent', ids.length)
}
for (const h of config.batchHours || [12, 16, 20]) cron.schedule(`0 ${h} * * 0-5`, () => { markRan('batch' + h); return flushBatch() }, { timezone: 'Asia/Jerusalem' })

let bizBusy = false
async function checkBusinessLeads() {
  if (!config.owner || !clientReady || bizBusy) return
  bizBusy = true
  try {
    if (!(await biz.bridgeAlive())) return
    for (const lead of (await biz.newHotLeads()).filter((l) => !biz.isSelf(l)).slice(0, 3)) {
      await alertWithDraft({
        title: 'ליד חם בעסקי',
        who: lead,
        situation: `ליד כתב עכשיו לווטסאפ העסקי של אביאל (${lead.prior === 0 ? 'פנייה ראשונה' : 'שיחה חדשה יחסית'}).`,
        extraRules: 'שאלה פתוחה אחת שממשיכה שיחה, רמז למודל של "מתאמן איתך" בלי למכור. בלי מחירים אם לא שאל.',
      })
      console.log('[biz-lead] notified:', biz.nameOf(lead))
      if (lead.prior === 0) try { advisor.registerLead({ phone: lead.phone, name: lead.display, source: 'ווטסאפ' }) } catch (e) { console.error('[advisor-register]', e.message) }
    }
  } catch (e) {
    if (!isLimitError(e)) console.error('[biz-lead]', e.message)
  } finally {
    bizBusy = false
  }
}
setInterval(checkBusinessLeads, 3 * 60 * 1000)
setTimeout(checkBusinessLeads, 90 * 1000)

// מתאמן שלא נענה שעה בשעות הפעילות (10:00–22:00) — התראה אחת לכל הודעה, עם טיוטה לאישור.
// הודעה שנכנסה בלילה מתחילה "לתקתק" רק מ-10:00. בשבת לא מתריעים (מוצ"ש ממשיך מאיפה שעצר).
const FILE_RE = /(תשלח|תשלחי|שלח|אין לי|לא מוצא|לא מוצאת|איפה).{0,25}(תפריט|תוכנית|התוכנית|התפריט|הקובץ|המסמך)|(תפריט|תוכנית) (מעודכן|מעודכנת|חדש|חדשה)/
const LEAD_HOT_RE = /כמה (זה )?עולה|מחיר|עלות|ליווי|להתחיל|להצטרף|מעוניין|מעוניינת|רוצה להתאמן|איך מתחילים|מתחיל|price|פרטים על/i
const ALLOWED_RE = /מותר|אפשר לאכול|יכול לאכול|יכולה לאכול|אפשר לשתות|להחליף ב|במקום ה|זה בסדר ש|מה דעתך על|זה טוב\?|זה בסדר\?/
const ACTIVE_FROM = 8, ACTIVE_TO = 23
const WAIT_MINUTES = Number(config.waitingMinutes ?? 3) // דקות שקט מאז ההודעה האחרונה של הלקוח
const NUDGED_PATH = path.join(ROOT, 'biz-nudged.json')
const CLOSER_RE = /^[\s\p{Extended_Pictographic}\p{Emoji_Modifier}‍️]*(תודה( רבה| על [^?]{0,20})?|אמן|סבבה|אוקי|אוקיי|ok|יאללה|מעולה|חח+|ח ח|סגור|פיקס|אחלה|מושלם|בסדר|קיבלתי|הבנתי)?[\s!.\p{Extended_Pictographic}\p{Emoji_Modifier}‍️]*$/iu

function israelParts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false, weekday: 'short' })
    .formatToParts(d).map((x) => [x.type, x.value]))
  return { hour: Number(p.hour) % 24, sat: p.weekday === 'Sat' }
}
const isActive = (d) => { const t = israelParts(d); return !t.sat && t.hour >= ACTIVE_FROM && t.hour < ACTIVE_TO }

// כמה דקות "פעילות" עברו מאז ההודעה — סופרים בצעדים של 5 דקות רק בתוך 10:00–22:00
function activeMinutesSince(ts, now = new Date()) {
  let mins = 0
  for (let t = new Date(ts).getTime(); t < now.getTime(); t += 5 * 60000) if (isActive(new Date(t))) mins += 5
  return mins
}

const loadNudged = () => { try { return JSON.parse(fs.readFileSync(NUDGED_PATH, 'utf8')) } catch { return {} } }
const saveNudged = (n) => { const tmp = NUDGED_PATH + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(n)); fs.renameSync(tmp, NUDGED_PATH) }
const markNudged = (w) => { const n = loadNudged(); const prev = n[w.chat_jid]; n[w.chat_jid] = w.timestamp; saveNudged(n); return prev }
const unmarkNudged = (w, prev) => { const n = loadNudged(); if (n[w.chat_jid] !== w.timestamp) return; if (prev === undefined) delete n[w.chat_jid]; else n[w.chat_jid] = prev; saveNudged(n) } // הניסוח נכשל — לנסות שוב בסבב הבא

let waitingBusy = false, waitingPauseUntil = 0 // מגבלת שימוש — לא לנסות כל דקה
// שני זמנים פנויים לשיחת היכרות — מתוך הבוקינג (מאושרים) והיומן האישי, בחלון שעות ברירת מחדל 10–20, לא בשבת
async function freeSlots({ days = 3, from = Number(config.leadCallFrom) || 10, to = Number(config.leadCallTo) || 20 } = {}) {
  let bookings = []
  try {
    const res = await fetch(BOOKING_SECRETS.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'admin', op: 'list', key: BOOKING_SECRETS.adminKey }), redirect: 'follow' }).then((r) => r.json())
    bookings = Array.isArray(res.bookings) ? res.bookings.filter((x) => /approved|pending/.test(x.status || '')) : []
  } catch {}
  const out = []
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  for (let off = 1; off <= days + 1 && out.length < 2; off++) {
    const d = new Date(Date.now() + off * 864e5)
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(d).map((x) => [x.type, x.value]))
    if (parts.weekday === 'Sat') continue
    const dateStr = `${parts.year}-${parts.month}-${parts.day}`
    const busy = []
    for (const bk of bookings) {
      const bd = String(bk.date || bk.day || '').slice(0, 10), bt = String(bk.time || bk.start || '')
      if (bd !== dateStr || !/^\d{1,2}:\d{2}/.test(bt)) continue
      const [h, m] = bt.split(':').map(Number); busy.push([h * 60 + m, h * 60 + m + (Number(bk.dur) || 60)])
    }
    const cal = await getCalendarEvents(off).catch(() => '')
    for (const line of String(cal).split('\n')) { const mm = line.match(/^(\d{2}):(\d{2})/); if (mm) busy.push([Number(mm[1]) * 60 + Number(mm[2]), Number(mm[1]) * 60 + Number(mm[2]) + 60]) }
    const dayLabel = off === 1 ? `מחר (${dayNames[d.getDay()]})` : `יום ${dayNames[d.getDay()]}`
    for (let h = from; h < to && out.length < 2; h++) {
      const start = h * 60
      if (busy.some(([a, z]) => start < z + 15 && start + 15 > a - 15)) continue
      out.push(`${dayLabel} ${String(h).padStart(2, '0')}:00`)
      break // זמן אחד ליום, כדי להציע שני ימים שונים
    }
  }
  return out
}

// 22.11.26 (שני שאלה "בכמה משקל התחלנו?" והטיוטה ענתה "אני בודק"): המספרים האמיתיים מכרטיס המתאמן — כדי שהטיוטה תענה עם הנתון
const NUMS_C = {}
async function traineeNumbers(name) {
  const hit = NUMS_C[name]; if (hit && Date.now() - hit.at < 30 * 60e3) return hit.v
  const card = await coachApi('dashboardClientCard', [name]); const sp = ((card && card.spark) || []).filter((x) => x && Number(x.kg) > 0)
  const L = []
  if (sp.length) {
    const last7 = sp.slice(-7).map((x) => Number(x.kg)), avg = Math.round(last7.reduce((a, b) => a + b, 0) / last7.length * 10) / 10
    const start = Number(card.first) || Number(sp[0].kg), low = Math.min(...sp.map((x) => Number(x.kg))), d = Math.round((avg - start) * 10) / 10
    L.push(`משקל התחלה: ${start} ק״ג (${sp[0].d})`, `ממוצע 7 השקילות האחרונות: ${avg} (${d > 0 ? '+' : ''}${d} מההתחלה)`, `שקילה אחרונה: ${sp[sp.length - 1].kg} ב-${sp[sp.length - 1].d}`, `הכי נמוך: ${low}`)
  }
  const lf = ((card && card.lifts) || []).filter((x) => x && x.first && x.best > x.first).sort((a, b) => (b.best - b.first) - (a.best - a.first)).slice(0, 3)
  if (lf.length) L.push('התקדמות בכוח: ' + lf.map((x) => `${x.ex} ${x.first}→${x.best} ק״ג`).join(', '))
  const v = L.length ? 'המספרים של המתאמן (אמיתיים, מהאפליקציה — לענות איתם ישירות על שאלה על משקל/התקדמות, לא "אני בודק"): ' + L.join(' · ') : ''
  NUMS_C[name] = { at: Date.now(), v }; return v
}
// מהלוח (גיליון המתאמנים): מטרה, קצב, התחלה, ימים שנותרו, פגישה הבאה, יתרה — ומההתראה היומית של הלוח: מי לא נשקל / לא בקצב
const BOARD_ALERTS_PATH = path.join(ROOT, 'brain', 'board-alerts.json')
async function boardContext(who) {
  const lines = []
  try {
    const { clients } = await advisor.readBoard()
    const pn = String(who.phone || '').replace(/\D/g, '').slice(-9)
    const first = String(biz.nameOf(who)).split(/\s+/)[0]
    const c = clients.find((x) => pn && String(x.phone || '').replace(/\D/g, '').endsWith(pn)) || clients.find((x) => first && String(x.name || '').startsWith(first))
    if (c) {
      const f = (d) => (d ? new Date(d).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric' }) : '')
      lines.push([c.goal && `מטרה: ${c.goal}`, c.pace && `קצב יעד: ${c.pace} ק"ג בשבוע`, c.start && `התחיל: ${f(c.start)}`, c.daysLeft != null && `נותרו בתהליך: ${c.daysLeft} ימים`,
        c.nextMeet && `פגישה הבאה: ${f(c.nextMeet)}`, c.balance ? `יתרה פתוחה: ${c.balance} ₪` : null, c.coach && `מאמן: ${c.coach}`].filter(Boolean).join(' · '))
      const nums = await traineeNumbers(c.name).catch(() => ''); if (nums) lines.push(nums)
    }
  } catch {}
  try {
    const alerts = JSON.parse(fs.readFileSync(BOARD_ALERTS_PATH, 'utf8'))
    const first = String(biz.nameOf(who)).split(/\s+/)[0]
    const hit = Object.entries(alerts.items || {}).find(([n]) => n.startsWith(first) || first.startsWith(n.split(/\s+/)[0]))
    if (hit) lines.push(`התראת הלוח מ-${alerts.date || 'היום'}: ${hit[1]}`)
  } catch {}
  return lines.length ? '--- מהלוח של אביאל ---\n' + lines.join('\n') : ''
}

// פעם ביום (9:50) — המוח קורא את מייל ההתראות של הלוח ("לא נשקלו 3+ ימים", "לא בקצב") ושומר JSON לפי שם
async function syncBoardAlerts() {
  try {
  markRan('board')
    const out = await askBrainOnce(
      'חפשי ב-Gmail את המייל האחרון מהיממה האחרונה שנשלח מהלוח/המערכת של אביאל ומכיל התראות על מתאמנים (למשל "לא נשקלו", "לא בקצב", "צריכים אותי", "צ\'ק-אין"). ' +
        'קראי אותו והחזירי JSON בלבד: {"date":"YYYY-MM-DD","items":{"שם המתאמן":"ההערה בקצרה (למשל: לא נשקל 6 ימים)"}}. אם אין מייל כזה — {"date":"","items":{}}. בלי טקסט מחוץ ל-JSON.',
      'haiku', { tools: true }
    )
    const j = JSON.parse(String(out).replace(/^[^{]*/, '').replace(/[^}]*$/, ''))
    if (j && j.items) fs.writeFileSync(BOARD_ALERTS_PATH, JSON.stringify(j, null, 2))
    console.log('[board-alerts]', Object.keys(j.items || {}).length)
  } catch (e) { console.error('[board-alerts]', e.message) }
}
cron.schedule('50 9 * * *', syncBoardAlerts, { timezone: 'Asia/Jerusalem' })

// ── מעקב הבטחות: סריקה כל 15 דק', תזכורת בבוקר ובערב, "הבטחות" / "סיימתי שון" ──
setInterval(() => { if (clientReady) promisesMod.scan(36).catch((e) => console.error('[promises]', e.message)) }, 15 * 60 * 1000)
setTimeout(() => promisesMod.scan(36).catch(() => 0), 45 * 1000)
async function promisesBlock() {
  try { await promisesMod.scan(36) } catch {}
  const list = promisesMod.open()
  return list.length ? `\n\nהבטחות פתוחות של אביאל למתאמנים (מההודעות שלו עצמו — להזכיר בקצרה, לפי דחיפות):\n${promisesMod.render(list)}` : ''
}

// הטיוטה שהעוזרת הציעה אחרונה לאביאל — "כן"/"1"/"2" בלי שם חלים רק עליה
let lastOfferedDraftId = null
let prevOfferedDraftId = null, lastOfferedAt = 0 // ההצעה הקודמת ומתי הגיעה החדשה — "כן" שנכתב לפני שההתראה החדשה הגיעה שייך לקודמת
let AMBIG = null // 22.11.26: "יש כמה" שמחכה למספר
const EDIT_MSGS = new Set() // הודעות "ערוך": ציטוט עליהן = טקסט לשליחה, אף פעם לא הוראת תיקון
function offerDraft(id) { if (id !== lastOfferedDraftId) prevOfferedDraftId = lastOfferedDraftId; lastOfferedDraftId = id; lastOfferedAt = Date.now() }
const PREFS_PATH = path.join(ROOT, 'brain', 'prefs.md')
const prefsText = () => { try { return fs.readFileSync(PREFS_PATH, 'utf8').trim() } catch { return '' } }

let bridgeWarnedDay = null
async function bridgeOk() {
  if (await biz.bridgeAlive()) return true
  const day = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })
  if (bridgeWarnedDay !== day) {
    bridgeWarnedDay = day
    await client.sendMessage(config.owner, toWhatsApp('הווטסאפ העסקי כבוי אצלי (החלון השחור סגור), אז אני לא רואה מי כתב ומי ענה. תפעיל אותו ואמשיך.')).catch(() => {})
  }
  return false
}

// טיוטה שאביאל כבר ענה עליה בעצמו (טקסט/קולי/תמונה) — למחוק בשקט וללמוד מהתשובה שלו
async function dropAnsweredDrafts() {
  for (const id of drafts.pendingIds()) {
    const it = drafts.get(id)
    if (!it) continue
    let actual = await biz.repliesSince(it.chat_jid, it.at).catch(() => '')
    if (!actual && it.phone) { const alt = await biz.chatForPhone(it.phone).catch(() => null); for (const j of [...new Set([alt, String(it.phone).replace(/\D/g, '') + '@s.whatsapp.net'])]) { if (actual || !j || j === it.chat_jid) continue; actual = await biz.repliesSince(j, it.at).catch(() => '') } } // אותו אדם בשתי הכתובות (LID ורגילה)
    if (!actual) continue
    if (!/^\[.*\]$/.test(actual.trim())) profiles.recordCorrection({ name: it.name, clientText: it.clientText || '', draft: it.text, final: actual, how: 'manual' })
    drafts.remove(id); bump('manual')
    console.log('[draft] dropped, answered by Aviel:', it.name)
  }
}

async function checkWaitingClients() {
  if (!config.owner || !clientReady || waitingBusy || !isActive(new Date()) || Date.now() < waitingPauseUntil) return
  waitingBusy = true
  try {
    if (!(await bridgeOk())) return
    await dropAnsweredDrafts()
    const nudged = loadNudged()
    const due = (await biz.waitingForReply(0, 3)).filter((w) =>
      nudged[w.chat_jid] !== w.timestamp && !CLOSER_RE.test(String(w.content || '').trim()) &&
      (Date.now() - Date.parse(String(w.timestamp).replace(' ', 'T'))) / 60000 >= WAIT_MINUTES)
    for (const w of due.slice(0, 6)) {
      // הודעה קולית של הלקוח → לתמלל קודם, כדי שהטיוטה תענה על מה שהוא באמת שאל
      if (w.media_type === 'audio' && !/^\[קולי\]/.test(w.content || '')) {
        await transcripts.transcribeClientAudio(w.chat_jid, { hours: 3, max: 3 }).catch(() => 0)
        const tr = transcripts.transcriptOf(w.id)
        if (tr) w.content = '[קולי] ' + tr
      }
      if (CLOSER_RE.test(String(w.content || '').replace(/^\[קולי\]\s*/, '').trim())) { markNudged(w); continue }
      // אביאל באמצע שיחה איתו (כתב לו ב-15 הדקות האחרונות)? לא להפריע
      const mine = await biz.repliesSince(w.chat_jid, new Date(Date.now() - 15 * 60000).toISOString()).catch(() => '')
      if (mine) continue
      // כבר מחכה תשובה לאישור על האדם הזה — לא לשלוח עוד אחת
      if (drafts.pendingForChat(w.chat_jid, w.phone, true)) { markNudged(w); continue }
      const prevNudge = markNudged(w) // גם אם המוח סינן — לא לשאול שוב על אותה הודעה
      // שאלת "מותר?" — בודקים מול התפריט של הלקוח (תיק + דרייב), ואם יש תמונה טרייה — מורידים אותה למוח
      const streak = await biz.recentMessages(w.chat_jid, 4).then((t) => t.split('\n').filter((l) => !l.startsWith('אביאל:')).join(' ')).catch(() => String(w.content || ''))
      const allowedQ = ALLOWED_RE.test(streak)
      const fileQ = !allowedQ && FILE_RE.test(streak)
      // ליד שמתעניין (מחיר/להתחיל) — להציע שיחת היכרות עם שני זמנים פנויים אמיתיים
      const leadHot = !allowedQ && LEAD_HOT_RE.test(streak) && (await biz.messageCount(w.chat_jid).catch(() => 99)) < 40
      const slots = leadHot ? await freeSlots().catch(() => []) : []
      let photoNote = ''
      // 22.11.26 (עידו שלח תמונה והטיוטה ענתה "לא מופיעה בתוכן"): כל תמונה טרייה מהמתאמן נכנסת לטיוטה, לא רק בשאלת "מותר?"
      const freshImgs = await biz.recentImages(w.chat_jid, allowedQ ? 45 : 20).catch(() => [])
      if (freshImgs.length) {
        const imgs = freshImgs
        for (const im of imgs.slice(0, 2)) {
          const src = await biz.downloadMedia(im.id, im.chat_jid)
          if (!src) continue
          const dst = path.join(ROOT, 'photos', `biz-${Date.now()}-${path.basename(src)}`)
          try { fs.mkdirSync(path.join(ROOT, 'photos'), { recursive: true }); fs.copyFileSync(src, dst); photoNote += `\nתמונה שהלקוח שלח: ${dst} — פתחי אותה עם Read והתייחסי למה שרואים (מנה, כמות משוערת).`; setTimeout(() => fs.rmSync(dst, { force: true }), 30 * 60 * 1000) } catch {}
        }
      }
      if (freshImgs.length && !photoNote) { photoNote = '\nהמתאמן שלח תמונה שלא הצלחתי לפתוח. לא להעמיד פנים שראית אותה: תשובה כללית או לבקש לכתוב במילה מה יש בה.'; console.log('[biz-photo] download failed', biz.nameOf(w)) } // 22.11.26
      const sent = await alertWithDraft({
        title: 'מחכה לך בעסקי',
        who: w,
        batchable: !leadHot && !allowedQ && !fileQ && !photoNote,
        allowTools: allowedQ || fileQ || !!photoNote, // תמונה = המוח צריך Read כדי לראות אותה
        situation: `מתאמן/ליד כתב לווטסאפ העסקי של אביאל ב-${ISR_TIME(w.timestamp)}.` + (allowedQ ? ' זו שאלה של "מותר לי?" / "אפשר לאכול?".' : '') + (photoNote && !allowedQ ? photoNote.replace('(מנה, כמות משוערת)', '(מה רואים בתמונה: צלחת, מסך, משקל, תוצאה — ולענות עליה עניינית, לא "התמונה לא מופיעה")') : ''),
        headline: leadHot ? `מתעניין: "${String(w.content || '').slice(0, 80)}" (לבדוק)` : '',
        extraRules: fileQ
          ? 'המתאמן מבקש קובץ (תפריט/תוכנית). למצוא אותו ב-Google Drive: חיפוש בתיקיית המתאמנים (folder id 1BgKSHeNMxfePdv0A7D-ZOLZqn3SZqV9g) או לפי השם הפרטי + "תפריט"/"תוכנית", לבחור את העדכני ביותר, ולבדוק עם get_file_permissions שיש גישה למי שיש לו קישור. ' +
            'אם יש גישה — לשים בטיוטה שורה קצרה + הקישור (webViewLink). אם אין גישה או לא נמצא — טיוטה קצרה "שולח לך עכשיו" ובשורה הראשונה (מה הוא רוצה) לציין לאביאל: "הקובץ לא משותף/לא נמצא: <קישור או שם>". עד 4 קריאות כלים, קריאה בלבד.'
          : leadHot
          ? `הליד מתעניין. המטרה: לקבוע שיחת היכרות של 10 דקות, לא למכור בהודעה. ${slots.length ? `להציע בדיוק את שני הזמנים האלה: ${slots.join(' או ')}, ולשאול מה מתאים לו, ושאם לא — שיגיד מתי כן.` : 'לשאול מתי נוח לו לשיחה קצרה של 10 דקות, בוקר או ערב.'} בלי מחירים בהודעה הזו (אם שאל על מחיר — לומר שבשיחה הוא יקבל תשובה מדויקת לפי מה שהוא צריך). חם, בטוח, קצר.`
          : allowedQ
          ? 'חובה לבדוק מול התפריט שלו לפני שעונים: (1) סעיף "התוכנית הנוכחית" בתיק; (2) אם זה לא מספיק — חיפוש אחד ב-Google Drive של שם הלקוח (למשל "תפריט " + שם פרטי) וקריאת קובץ התפריט/התוכנית שלו (עד 3 קריאות כלים, קריאה בלבד); (3) לענות לפי התפריט: מותר / לא / כן אבל בכמות X, ומה להחליף או להוריד במקום. אם אין תפריט בשום מקום — לענות לפי העקרונות שאביאל נתן לו בשיחה, ולומר בטיוטה שזה לפי מה שסיכמתם. לא להמציא כמויות.' + photoNote
          : 'דיווח של מתאמן (מה אכל, משקל, תמונה, צ\'ק-אין), שאלה או בקשה — תמיד צריכים תשובה עניינית.',
      }).catch((e) => { if (isLimitError(e)) { if (!drafts.pendingForChat(w.chat_jid, w.phone, true)) unmarkNudged(w, prevNudge); throw e } console.error('[biz-waiting] skip', biz.nameOf(w), e.message); return false }) // מגבלה: לנסות שוב אחרי הפסקה; תקלה אחרת: ממשיכים ללקוח הבא (לא חוסמים את כולם)
      console.log('[biz-waiting]', sent ? 'nudged:' : 'skipped:', biz.nameOf(w))
    }
  } catch (e) {
    if (isLimitError(e)) waitingPauseUntil = Date.now() + 10 * 60000
    else console.error('[biz-waiting]', e.message)
  } finally {
    waitingBusy = false
  }
}
setInterval(checkWaitingClients, 60 * 1000)
setTimeout(checkWaitingClients, 2 * 60 * 1000)

// הודעה דחופה ("דחוף", "תענה", כאב/פציעה) — התראה מיידית, בכל שעה, בלי לחכות לשעה.
// אותו biz-nudged.json — כך שהודעה שכבר הוקפצה כדחופה לא תוקפץ שוב אחרי שעה.
const URGENT_RE = /דחוף|דחופה|בדחיפות|אורגנט|urgent|asap|SOS|תענה|תעני|תענו|תחזור אליי?|תחזרי אליי?|מחכה לתשובה|מחכה לך|למה אתה לא עונה|כואב לי|כאב חזק|נפצעתי|פציעה|נקע|סחרחורת|התעלפ|מיגרנה|לחץ בחזה|קוצר נשימה|בית חולים|מיון/i

let urgentBusy = false
async function checkUrgentClients() {
  if (!config.owner || !clientReady || urgentBusy) return
  urgentBusy = true
  try {
    if (!(await biz.bridgeAlive())) return
    const nudged = loadNudged()
    for (const w of (await biz.waitingForReply(0, 1)).filter((x) => nudged[x.chat_jid] !== x.timestamp)) { // גם כשיש טיוטה שגרתית שממתינה — דחוף קודם
      if (w.media_type === 'audio' && !/^\[קולי\]/.test(w.content || '')) await transcripts.transcribeClientAudio(w.chat_jid, { hours: 2, max: 2 }).catch(() => 0)
      // רק מה שנכתב מאז התשובה האחרונה של אביאל
      const lines = (await biz.recentMessages(w.chat_jid, 8)).split('\n')
      const streak = lines.slice(lines.map((l) => l.startsWith('אביאל:')).lastIndexOf(true) + 1).join('\n')
      if (!URGENT_RE.test(streak)) continue
      const oldD = drafts.pendingForChat(w.chat_jid, w.phone, true); if (oldD) drafts.remove(oldD) // הטיוטה הישנה כבר לא רלוונטית: הלקוח כתב משהו דחוף
      const prevNudge = markNudged(w)
      await alertWithDraft({
        title: 'דחוף בעסקי',
        who: w,
        situation: 'הודעה דחופה בווטסאפ העסקי של אביאל.',
        extraRules: 'תשובה רגועה ואכפתית. אם מדובר בכאב חזק, פציעה, לחץ בחזה, קוצר נשימה, התעלפות או מצב רפואי — להפנות לרופא/מיון קודם כל, בלי אבחנה. לא לכתוב SKIP בהודעה דחופה.',
      }).catch(async (e) => { // אין ניסוח כרגע (מגבלה/תקלה) — דחוף לא מחכה: התראה בלי טיוטה
        const quote = streak.split('\n').map((l) => l.replace(/^הוא\/היא:\s*/, '')).filter(Boolean).map((l) => '> ' + l).join('\n')
        const ok = await client.sendMessage(config.owner, toWhatsApp(`*דחוף בעסקי* — ${biz.nameOf(w)}:\n${quote}\n\nלא הצלחתי לנסח תשובה כרגע. כדאי לענות ישירות.`)).then(() => true).catch(() => false)
        if (!ok) { if (!drafts.pendingForChat(w.chat_jid, w.phone, true)) unmarkNudged(w, prevNudge); throw e }
      })
      console.log('[biz-urgent] notified:', biz.nameOf(w))
    }
  } catch (e) {
    if (!isLimitError(e)) console.error('[biz-urgent]', e.message)
  } finally {
    urgentBusy = false
  }
}
setInterval(checkUrgentClients, 2 * 60 * 1000)
setTimeout(checkUrgentClients, 75 * 1000)

// תזכורת שבועית לניקוי המחשב — עם מצב האחסון הנוכחי
function sendCleanupReminder() {
  if (!config.owner || !clientReady) return
  execFile('/bin/df', ['-g', '/System/Volumes/Data'], (err, out) => {
    const cols = err ? [] : String(out).trim().split('\n').pop().split(/\s+/)
    const free = cols[3] ? `${cols[3]}GB פנוי (${cols[4]} תפוס)` : 'לא הצלחתי לבדוק'
    const msg =
      '🧹 *ניקוי שבועי למחשב*\n' +
      `💾 מצב האחסון: ${free}\n\n` +
      '• להעביר לדרייב חומרי גלם של רילסים שכבר עלו\n' +
      '• לבדוק את ההורדות (סרטונים מהטלפון / ווטסאפ)\n' +
      '• לכתוב לקלוד קוד "תנקה" — הוא יעשה את השאר'
    client.sendMessage(config.owner, toWhatsApp(msg)).catch(console.error)
    console.log('[cleanup-reminder] sent')
  })
}
cron.schedule(config.cleanupCron || '0 12 * * 5', sendCleanupReminder, { timezone: 'Asia/Jerusalem' }) // שישי 12:00

// ── למידה לילית: תיקי מתאמנים, אינדקס תשובות, סגנון (פעם בשבוע), ותיקונים מתשובות ידניות ──
async function nightlyLearning({ full = false } = {}) {
  try {
  markRan('learn')
    // טיוטות שלא אושרו ואביאל ענה בעצמו — מה שהוא כתב בפועל הוא דוגמה ללמידה
    for (const id of drafts.pendingIds()) {
      const it = drafts.get(id)
      if (!it || Date.now() - Date.parse(it.at) < 60 * 60 * 1000) continue
      const actual = await biz.repliesSince(it.chat_jid, it.at).catch(() => '')
      if (actual) {
        profiles.recordCorrection({ name: it.name, clientText: it.clientText || '', draft: it.text, final: actual, how: 'manual' })
        drafts.remove(id)
      }
    }
    // לתמלל את הקוליות של היממה האחרונה כדי שהתיקים ילמדו גם ממה שנאמר בקול
    for (const c of await profiles.listClients().catch(() => [])) await transcripts.transcribeClientAudio(c.jid, { hours: 30, max: 8 }).catch(() => 0)
    const pairs = await profiles.buildReplyIndex()
    const n = await profiles.refreshProfiles({ onlyStale: !full, max: 20 })
    const sunday = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }) === 'Sun'
    if (full || sunday) { await profiles.buildVoiceGuide(); await profiles.buildRulesBook().catch((e) => console.error('[rules]', e.message)) }
    console.log(`[learn] pairs=${pairs} profiles=${n} voice=${full || sunday}`)
    return { pairs, n }
  } catch (e) {
    console.error('[learn]', e.message)
    return null
  }
}
cron.schedule('30 3 * * *', () => nightlyLearning(), { timezone: 'Asia/Jerusalem' })

// ── זיהוי נטישה מוקדם: מתאמן ששותק הרבה יותר מהרגיל שלו → הודעה אישית לאישור, פעם בשבוע לכל היותר ──
const CHURN_PATH = path.join(ROOT, 'churn-state.json')
async function checkChurn() {
  markRan('churn')
  if (!config.owner || !clientReady || !isActive(new Date()) || !(await biz.bridgeAlive())) return
  let st = {}
  try { st = JSON.parse(fs.readFileSync(CHURN_PATH, 'utf8')) } catch {}
  const rows = await biz.cadence(60).catch(() => [])
  // 22.11.26 (אביאל על רון פרטוק: "לקוח עבר"): שקט חריג רק למתאמנים פעילים בלוח, בלי משפחה/בדיקה
  let act = null; try { const [l, tg] = await Promise.all([coachApi('dashboardList'), coachApi('dashboardTagsAll').catch(() => ({}))]); act = new Set(((l && l.clients) || []).filter((c) => c.status === 'פעיל' && !(tg[c.name] || []).some((t) => t === 'משפחה' || t === 'בדיקה')).map((c) => String(c.phone || '').replace(/\D/g, '').slice(-9)).filter(Boolean)) } catch (e) { console.error('[churn] board', e.message); return }
  for (const r of rows) {
    if (!act.has(String(r.phone || '').replace(/\D/g, '').slice(-9))) continue
    if (r.active_days < 5 || !r.avg_gap) continue // אין מספיק היסטוריה כדי לדעת מה "רגיל" אצלו
    const threshold = Math.max(3, r.avg_gap * 2.5)
    if (r.silent_days < threshold || r.silent_days > 21) continue
    if (r.mine_days != null && r.mine_days < 2) continue // אביאל כבר פנה אליו
    if (st[r.chat_jid] && Date.now() - Date.parse(st[r.chat_jid]) < 7 * 24 * 3600000) continue
    if (drafts.pendingForChat(r.chat_jid)) continue
    st[r.chat_jid] = new Date().toISOString(); fs.writeFileSync(CHURN_PATH, JSON.stringify(st))
    const sent = await alertWithDraft({
      title: 'שקט חריג',
      who: { chat_jid: r.chat_jid, display: r.display, phone: r.phone, content: '' },
      headline: `שקט כבר ${Math.round(r.silent_days)} ימים (בדרך כלל כותב כל ${r.avg_gap <= 1.2 ? 'יום' : Math.round(r.avg_gap) + ' ימים'})`,
      situation: `מתאמן שבדרך כלל כותב לאביאל כל ${r.avg_gap} ימים שותק כבר ${Math.round(r.silent_days)} ימים. אביאל רוצה לפנות אליו לפני שהוא נעלם.`,
      extraRules: 'הודעת "מה קורה" אישית וחמה, לא לחץ ולא אשמה: להתייחס לדבר האחרון שדיברו עליו או למטרה שלו מהתיק, ולסיים בשאלה אחת קלה שמחזירה אותו לשיחה. 1–3 שורות. לא לכתוב SKIP.',
      noQuote: true,
    })
    console.log('[churn]', sent ? 'alert:' : 'skip:', biz.nameOf(r))
  }
}
cron.schedule('30 10 * * 0-5', checkChurn, { timezone: 'Asia/Jerusalem' })

// ── סיכום שבוע אישי: יום ראשון 10:00 — לכל מתאמן פעיל בלוח (בלי משפחה/בדיקה), לפי נתוני השבוע מהאפליקציה; אחת אחת עם 3 אופציות ──
// 22.11.26 (אביאל): מחליף את "פתיחת שבוע" שנשענה רק על השיחה בווטסאפ ורק על מי שכתב לאחרונה
const weekFacts = require('./week-facts')
const proofStory = require('./proof-story') // 22.11.26: תמונת סטורי הוכחה
async function weeklyCheckin(opts = {}) {
  markRan('checkin')
  if (!config.owner || !clientReady || !(await biz.bridgeAlive())) return
  const [list, tags] = await Promise.all([coachApi('dashboardList'), coachApi('dashboardTagsAll').catch(() => ({}))])
  const pn = (raw) => { let d = String(raw || '').replace(/\D/g, ''); if (d.startsWith('972')) return d; if (d.startsWith('0')) d = d.slice(1); return /^5\d{8}$/.test(d) ? '972' + d : '' }
  const rows = ((list && list.clients) || []).filter((c) => c.status === 'פעיל' && pn(c.phone) && !(tags[c.name] || []).some((t) => t === 'משפחה' || t === 'בדיקה') && (!opts.only || opts.only.includes(c.name)))
  if (!rows.length) return
  await client.sendMessage(config.owner, toWhatsApp(`*סיכום שבוע אישי*${opts.only ? ' (השלמה)' : ''} — מכינה הודעה ל-${rows.length} מתאמנים לפי הנתונים של השבוע. אחת בכל פעם: הבאה מגיעה רק אחרי שטיפלת בקודמת.`)).catch(() => {})
  let made = 0; const skipped = [], proof = [], usage = [], proofPeople = []
  for (const c of rows) {
    const phone = pn(c.phone), first = String(c.name).split(' ')[0]
    try {
      const jid = (await biz.chatForPhone(phone).catch(() => null)) || `${phone}@s.whatsapp.net`
      const f = await coachApi('dashboardWeekFacts', [c.name]).catch(() => null), noApp = (tags[c.name] || []).includes(weekFacts.NOAPP_TAG)
      usage.push({ first, f, seen: c.seen && c.seen.d, noApp })
      const pr = noApp ? '' : weekFacts.proofLine(first, f); if (pr) { proof.push(pr); proofPeople.push({ name: c.name, first, f, jid, phone }) } // 22.11.26 (אביאל): סימון לסטורי הוכחה
      // 22.11.26 (אביאל: "הודעה אחת לכל מתאמן"): כל מה שפתוח לו (תשובה שלא ענית, חידוש, בקשת תמונה, תזכורת) נכנס לאותה הודעה, והטיוטות הישנות נמחקות
      const open = drafts.pendingForPerson(jid, phone)
      const openTxt = open.map((d) => d.clientText ? `${first} כתב/ה לאביאל ועוד לא קיבל/ה תשובה: "${String(d.clientText).slice(0, 300)}" (טיוטת התשובה שהוכנה: "${String(d.text).slice(0, 200)}")` : `הודעה שהבוט הכין ועוד לא נשלחה: "${String(d.text).slice(0, 300)}"`).join('\n')
      const ok = await alertWithDraft({
        title: 'סיכום שבוע',
        who: { chat_jid: jid, display: c.name, phone, content: '' },
        headline: 'סיכום שבוע' + (noApp ? ' (בלי אפליקציה)' : '') + (open.length ? ` + ${open.length} ${open.length === 1 ? 'דבר פתוח' : 'דברים פתוחים'}` : '') + (weekFacts.hasData(f, noApp) ? '\n' + weekFacts.factsLine(f, noApp) : noApp ? '\nלא הגיעו שקילות השבוע' : '\nאין נתונים מהשבוע באפליקציה'),
        situation: weekFacts.situation(first, f, noApp) + (openTxt ? '\n\nבנוסף, דברים פתוחים מול ' + first + ' שחייבים להיכנס לאותה הודעה (בקצרה, בלי לאבד את הבקשה עצמה: חידוש, תמונה, תשובה לשאלה):\n' + openTxt : ''),
        extraRules: weekFacts.RULES + (openTxt ? ' יש דברים פתוחים: לשלב אותם בטבעיות באותה הודעה, עד 5 שורות. אם הוא/היא שאל/ה משהו — לענות קודם.' : ''),
        hold: true,
        noQuote: true,
      })
      if (ok) { made++; open.forEach((d) => drafts.remove(d.id)); if (open.length) console.log('[checkin] folded', open.length, 'into', first) } else skipped.push(first)
    } catch (e) { console.error('[checkin]', c.name, e.message); skipped.push(first + ' (תקלה)') }
  }
  if (opts.only) { try { const o = JSON.parse(fs.readFileSync(WKSUM_PATH, 'utf8')); o.items = o.items.filter((x) => !opts.only.includes(x.name)).concat(rows.map((c) => ({ name: c.name, first: String(c.name).split(' ')[0], phone: pn(c.phone) }))); fs.writeFileSync(WKSUM_PATH, JSON.stringify(o)) } catch {}
    return client.sendMessage(config.owner, toWhatsApp(`השלמת סיכום שבוע: ${made} טיוטות מוכנות.` + (skipped.length ? ' בלי טיוטה: ' + skipped.join(', ') + '.' : ''))).catch(() => {}) }
  try { fs.writeFileSync(WKSUM_PATH, JSON.stringify({ at: new Date().toISOString(), items: rows.map((c) => ({ name: c.name, first: String(c.name).split(' ')[0], phone: pn(c.phone) })) })) } catch (e) { console.error('[wksum]', e.message) }
  // 22.11.26 (אביאל: "סטורי הוכחה מוכן"): לכל מי שבסימון — תמונת סטורי בלי שם + בקשת רשות מהמתאמן/ת, בתור (אחרי הסיכומים)
  for (const p of proofPeople) {
    try {
      const fem = await advisor.femOf(p.phone, p.name), sd = proofStory.storyData(p.f); if (!sd) continue
      const img = await proofStory.render({ ...sd, fem }, `proof-${p.phone}-${Date.now()}.png`)
      const kg = Math.abs(p.f.diff) === 0.5 ? 'חצי קילו' : Math.abs(p.f.diff) + ' ק״ג', ex = p.f.up[0].ex
      const t1 = fem ? `${p.first}, השבוע ${p.f.diff < 0 ? 'ירדת' : 'עלית'} ${kg} בממוצע ושברת שיא ב${ex}. אפשר לשים את זה בסטורי שלי? בלי שם ובלי תמונה שלך, רק המספרים` : `${p.first}, השבוע ${p.f.diff < 0 ? 'ירדת' : 'עלית'} ${kg} בממוצע ושברת שיא ב${ex}. אפשר לשים את זה בסטורי שלי? בלי שם ובלי תמונה שלך, רק המספרים`
      const t3 = fem ? `${p.first}, אפשר להעלות את התוצאה של השבוע לסטורי? בלי שם` : `${p.first}, אפשר להעלות את התוצאה של השבוע לסטורי? בלי שם`
      const id = drafts.add({ chat_jid: p.jid, phone: p.phone, name: p.name, alias: p.first, text: t1, alt: t3 })
      draftQueuePush(id, `*${p.name}: סטורי הוכחה* (#${id})\nהתמונה מוכנה (בלי שם). אם ${fem ? 'היא מאשרת' : 'הוא מאשר'} — מעלים כמו שהיא.\n\n*1.*\n${t1}\n\n*2.*\n${t3}\n\n${drafts.approvalHint(id, p.first, true, false)}`, config.owner, false, img)
    } catch (e) { console.error('[proof-story]', p.name, e.message) }
  }
  const rep = weekFacts.usageReport(usage) // 22.11.26: סיום הסבב, הוכחות ומי משתמש במה — בהודעה אחת
  await client.sendMessage(config.owner, toWhatsApp(`סיכום שבוע: ${made} טיוטות מוכנות מתוך ${rows.length}, מגיעות אחת אחת.` + (skipped.length ? ' בלי טיוטה: ' + skipped.join(', ') + '.' : '') + (rep ? '\n\n' + rep : '') +
    (proof.length ? '\n\n*חומר לסטורי הוכחה* (התקדמו לפי המטרה וגם שברו שיא השבוע):\n' + proof.join('\n') + '\nלבקש אישור לפני שמפרסמים.' : ''))).catch(() => {})
}

// ── תור טיוטות (22.11.26, אביאל: "אתה שולח הכל רצוף... רק כשאני מתייחס לאחד תמשיך לשלוח למתאמן אחר"):
// טיוטות הסבב נשמרות בתור, ומוצגת אחת בכל פעם. הבאה עולה רק כשהנוכחית נשלחה / בוטלה / נענתה בעצמו
const DQ_PATH = path.join(ROOT, 'draft-queue.json')
const dqLoad = () => { try { return JSON.parse(fs.readFileSync(DQ_PATH, 'utf8')) } catch { return { cur: null, items: [], total: 0, shown: 0 } } }
const dqSave = (q) => fs.writeFileSync(DQ_PATH, JSON.stringify(q))
function draftQueuePush(id, text, to, front, img) { const q = dqLoad(); if (!q.items.length && !q.cur) { q.total = 0; q.shown = 0 }
  const it = { id, text, to: to || config.owner }; if (img) it.img = img; if (front) { const k = q.items.findIndex((x) => !x.front); it.front = true; q.items.splice(k < 0 ? q.items.length : k, 0, it) } else q.items.push(it)
  q.total++; dqSave(q); setTimeout(draftQueueTick, 500) }
// "הבא" / "דלג": מעבירים את הנוכחית לסוף התור (היא נשארת פתוחה לאישור לפי שם או מספר)
function draftQueueSkip() { const q = dqLoad(); if (!q.items.length && !q.cur) return false
  if (!q.items.some((x) => x.id !== q.cur && drafts.get(x.id) && !(x.notBefore && Date.now() < x.notBefore))) { client.sendMessage(config.owner, toWhatsApp('זה האחרון בתור להיום. אפשר לענות עליו, או *לא* כדי לבטל.')).catch(() => {}); return true } // 22.11.26: "הבא" על האחרון הציג אותו שוב
   if (q.cur && drafts.get(q.cur) && q.curText) q.items.push({ id: q.cur, text: q.curText, to: q.curTo, again: true, shows: (q.curShows || 1) + 1 }); q.cur = null; dqSave(q); draftQueueTick(); return true }
let dqBusy = false
async function draftQueueTick() {
  if (dqBusy || !config.owner || !clientReady) return
  // 22.11.26 (ההודעה לעומר נדרסה כשנכתבה ישירות לקובץ התור): הוספה מבחוץ = קובץ בתיקיית queue-inbox; רק התהליך הזה כותב ל-draft-queue.json
  try { const dir = path.join(ROOT, 'queue-inbox'); if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) { const fp = path.join(dir, f); try { const x = JSON.parse(fs.readFileSync(fp, 'utf8')); fs.rmSync(fp); if (x && x.id && drafts.get(x.id)) draftQueuePush(x.id, x.text, x.to || config.owner, !!x.front, x.img) } catch (e) { console.error('[dq-inbox]', f, e.message); try { fs.renameSync(fp, fp + '.bad') } catch {} } } } catch (e) {}
  const q = dqLoad(); if (q.cur && drafts.get(q.cur) && Date.now() - (q.curAt || 0) < 15 * 60e3) return // אביאל עוד לא טיפל בנוכחית
  // 22.11.26 (אביאל: "תמשיך לשלוח לי" — נתקע 40 דק׳ על עידן): 15 דקות בלי תגובה → הנוכחית לסוף התור (נשארת פתוחה), וממשיכים
  if (q.cur && drafts.get(q.cur) && q.items.some((x) => x.id !== q.cur && drafts.get(x.id) && !(x.notBefore && Date.now() < x.notBefore))) { q.items.push({ id: q.cur, text: q.curText, to: q.curTo, again: true, shows: (q.curShows || 1) + 1 }); q.cur = null; dqSave(q) }
  else if (q.cur && drafts.get(q.cur)) return
  if (!q.cur && !q.items.some((x) => !(x.notBefore && Date.now() < x.notBefore))) return
  dqBusy = true
  try {
    q.cur = null; const later = []
    while (q.items.length) {
      const it = q.items.shift(); if (!drafts.get(it.id)) continue // בוטלה או נענתה בינתיים
      if (it.notBefore && Date.now() < it.notBefore) { later.push(it); continue } // נדחתה למחר
      if (it.again && (it.shows || 1) >= 3) { /* הופעה שלישית → למחר */ const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(10, 0, 0, 0); later.push({ ...it, again: false, shows: 0, notBefore: t.getTime() }); console.log('[dq] shown twice without answer → tomorrow:', it.id); continue } // 22.11.26: עידן עלה 6 פעמים
      { const d = drafts.get(it.id), pn = String(d.phone || '').replace(/\D/g, '').slice(-9) // 22.11.26: כבר שלחת לו/ה משהו ב-12 השעות האחרונות → לא מציעים הודעה שנייה ברצף
        const ilDay = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }), today = ilDay(Date.now()) // 22.11.26: "ברצף" = באותו יום, לא 12 שעות (עידן נדחה בגלל הודעה מאמש)
        const sentRecently = drafts.recentSent(200).some((x) => ilDay(Date.parse(x.at)) === today && (x.chat_jid === d.chat_jid || (pn && String(x.jid || '').replace(/\D/g, '').slice(-9) === pn)))
        const last = sentRecently ? null : await biz.lastMessage(d.chat_jid).catch(() => null)
        const wroteRecently = last && last.is_from_me && ilDay(Date.parse(String(last.timestamp).replace(' ', 'T'))) === today && !d.clientText
        if (!d.clientText && (sentRecently || wroteRecently)) { /* תשובה ללקוח שכתב — לא נוגעים */
          if (!it.postponed) { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(10, 0, 0, 0); drafts.touch && drafts.touch(it.id); later.push({ ...it, postponed: true, notBefore: t.getTime() }); console.log('[dq] postponed to tomorrow:', d.name, it.id); continue } // פעם אחת למחר בבוקר, לא נמחק
          drafts.remove(it.id); q.total = Math.max(0, q.total - 1); console.log('[dq] dropped (already messaged):', d.name, it.id); continue } }
      if (!it.again) q.shown++
      const left = q.items.filter((x) => drafts.get(x.id) && !(x.notBefore && Date.now() < x.notBefore)).length
      const cap = toWhatsApp(it.text + (left ? `\n\n_(עוד ${left} בתור · *הבא* = לדלג לבינתיים)_` : ''))
      const sent = it.img && fs.existsSync(it.img) ? await client.sendMessage(it.to || config.owner, MessageMedia.fromFilePath(it.img), { caption: cap }) : await client.sendMessage(it.to || config.owner, cap) // 22.11.26: סטורי הוכחה — התמונה עם הטיוטה
      if (sent?.id?._serialized) drafts.setAlertMsgId(it.id, sent.id._serialized)
      offerDraft(it.id); q.cur = it.id; q.curAt = Date.now(); q.curText = it.text; q.curTo = it.to; q.curShows = it.shows || 1; break
    }
    q.items = q.items.concat(later)
    dqSave(q)
  } catch (e) { console.error('[dq]', e.message) } finally { dqBusy = false }
}
setInterval(draftQueueTick, 15 * 1000)

// ── מעקב חידושים (22.11.26, אביאל: "מעקב חידושים במסך אחד"): שני 10:00 או "חידושים" — מי מסיים ב-30 יום, מה כבר נשלח, אם ענה, ומה הצעד הבא ──
async function renewalBoard(force) {
  markRan('renewboard')
  if (!config.owner || !clientReady) return
  const [list, tags] = await Promise.all([coachApi('dashboardList'), coachApi('dashboardTagsAll').catch(() => ({}))])
  let adv = {}; try { adv = JSON.parse(fs.readFileSync(path.join(ROOT, 'advisor-state.json'), 'utf8')).renewals || {} } catch {}
  let sent = []; try { sent = JSON.parse(fs.readFileSync(path.join(ROOT, 'sent-log.json'), 'utf8')) } catch {}
  const pn = (raw) => { let d = String(raw || '').replace(/\D/g, ''); if (d.startsWith('972')) return d; if (d.startsWith('0')) d = d.slice(1); return /^5\d{8}$/.test(d) ? '972' + d : '' }
  const rows = ((list && list.clients) || []).filter((c) => c.status === 'פעיל' && c.daysLeft !== '' && c.daysLeft != null && Number(c.daysLeft) <= 30 && Number(c.daysLeft) >= -7 && !(tags[c.name] || []).some((t) => t === 'משפחה' || t === 'בדיקה'))
    .sort((a, b) => Number(a.daysLeft) - Number(b.daysLeft))
  if (!rows.length) { if (force) await client.sendMessage(config.owner, toWhatsApp('*חידושים*: אף אחד לא מסיים ב-30 הימים הקרובים.')).catch(() => {}); return }
  const dm = (iso) => { const d = new Date(iso); return `${d.getDate()}.${d.getMonth() + 1}` }
  const L = [`*חידושים — 30 הימים הקרובים* (${rows.length})`, '']
  for (const c of rows) {
    const first = String(c.name).split(' ')[0], dl = Number(c.daysLeft), st = (adv[c.name] || {}).sent || {}
    const stages = Object.entries(st).filter(([, v]) => /^\d{4}-/.test(v)).sort((a, b) => a[1] < b[1] ? -1 : 1)
    const firstStage = stages[0] && stages[0][1]
    const RENEW_RE = /התהליך (שלנו )?נגמר|ממשיכים|למבנה של 3 חודשים|להמשיך איתי|חידוש|נשאר לנו|מסיימ/ // רק הודעת חידוש אמיתית, לא כל הודעה
    const mine = sent.filter((x) => x.name === c.name && RENEW_RE.test(String(x.text || '')) && Date.now() - Date.parse(x.at) < 40 * 864e5)
    let replied = null
    if (mine.length) { try { const jid = mine[mine.length - 1].chat_jid || (await biz.chatForPhone(pn(c.phone))); replied = (await biz.inboundSince(jid, mine[mine.length - 1].at)).length > 0 } catch {} }
    const bal = Number(c.balance) || 0, fem = await advisor.femOf(pn(c.phone), c.name).catch(() => false)
    const next = bal > 0 ? `יתרה פתוחה ${bal.toLocaleString('en-US')} ₪ — קודם התשלום`
      : !mine.length && !stages.length ? (dl > 14 ? 'הודעת החידוש יוצאת לבד 14 יום לפני' : 'עוד לא נשלחה הודעת חידוש — לשלוח היום')
      : !mine.length ? 'הודעת חידוש הוכנה אבל עוד לא נשלחה — ממתינה בתור או בוטלה'
      : replied ? `הודעת חידוש יצאה ב-${dm(mine[mine.length - 1].at)} ומאז ${fem ? 'היא כתבה' : 'הוא כתב'} — לבדוק אם נסגר (600 × 3)`
      : `הודעת חידוש יצאה ב-${dm(mine[mine.length - 1].at)} ${fem ? 'והיא לא ענתה' : 'והוא לא ענה'} — שווה שיחת טלפון`
    L.push(`*${first}* · ${dl < 0 ? `נגמר לפני ${-dl} ימים` : dl === 0 ? 'נגמר היום' : dl === 1 ? `נגמר מחר (${dm(c.end)})` : `עוד ${dl} ימים (${dm(c.end)})`}`, `  ${next}`)
  }
  await client.sendMessage(config.owner, toWhatsApp(L.join('\n'))).catch(() => {})
}
cron.schedule('0 10 * * 1', () => renewalBoard(false), { timezone: 'Asia/Jerusalem' })

// ── מעקב שלישי 11:00 (22.11.26, אביאל): מי שקיבל סיכום שבוע ולא ענה → הודעת המשך קצרה, כולם בהודעה אחת עם "כן לכולם" ──
const WKSUM_PATH = path.join(ROOT, 'weekly-sum.json')
let FOLLOW_BATCH = null
const followBatchInfo = () => (FOLLOW_BATCH && Date.now() - Date.parse(FOLLOW_BATCH.at) < 36 * 3600e3 ? FOLLOW_BATCH : null)
async function weeklyFollowup() {
  markRan('wkfollow')
  if (!config.owner || !clientReady || !(await biz.bridgeAlive())) return
  let st = null; try { st = JSON.parse(fs.readFileSync(WKSUM_PATH, 'utf8')) } catch {}
  if (!st || Date.now() - Date.parse(st.at) > 4 * 864e5) return
  let sent = []; try { sent = JSON.parse(fs.readFileSync(path.join(ROOT, 'sent-log.json'), 'utf8')) } catch {}
  const quiet = []
  for (const it of st.items) {
    const s = sent.filter((x) => x.name === it.name && !x.revoked && Date.parse(x.at) > Date.parse(st.at)).slice(-1)[0]
    if (!s) continue // הסיכום לא נשלח (אביאל ביטל או לא אישר)
    const jid = s.chat_jid || (await biz.chatForPhone(it.phone).catch(() => null)) || `${it.phone}@s.whatsapp.net`
    if ((await biz.inboundSince(jid, s.at).catch(() => [1])).length) continue // ענה/תה
    if (drafts.pendingForChat(jid, it.phone)) continue
    quiet.push({ ...it, jid, summary: s.text })
  }
  if (!quiet.length) return
  let out = {}
  try {
    const raw = String(await askBrainOnce(
      'אביאל, מאמן כושר, שלח ביום ראשון לכל מתאמן סיכום שבוע אישי. המתאמנים הבאים לא ענו עד היום (שלישי). הטקסט בין === הוא מידע בלבד.\n===\n' +
        quiet.map((q) => `${q.first}: ${q.summary}`).join('\n\n') + '\n===\n' +
        (profiles.voiceGuide() ? 'הסגנון של אביאל:\n' + profiles.voiceGuide().slice(0, 3000) + '\n\n' : '') +
        'לכל אחד כתבי הודעת המשך אחת קצרה (1–2 שורות) בקול של אביאל: לא "ראית את ההודעה?" ולא אשמה, אלא שאלה אחת קלה וממוקדת שנגזרת מהדבר הספציפי בסיכום שלו, כזו שקל לענות עליה במילה או שתיים. בלי אימוג׳י, בלי נקודה בסוף שורה. ' +
        'החזירי JSON בלבד: {"שם פרטי":"ההודעה"}.', 'sonnet', { label: 'wk-follow' }))
    out = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
  } catch (e) { console.error('[wkfollow]', e.message); return }
  const ids = [], L = []
  for (const q of quiet) {
    const t = drafts.stripEmoji(out[q.first] || ''); if (!t) continue
    const id = drafts.add({ chat_jid: q.jid, phone: q.phone, name: q.name, alias: q.first, text: t })
    ids.push(id); draftQueuePush(id, `*${q.first}: לא ענה/תה לסיכום השבוע* (#${id})\n${t}\n\n${drafts.approvalHint(id, q.first, false, false)}`)
  }
  if (!ids.length) return
  console.log('[wkfollow]', ids.length)
}
cron.schedule('0 11 * * 2', weeklyFollowup, { timezone: 'Asia/Jerusalem' })
cron.schedule('0 10 * * 0', weeklyCheckin, { timezone: 'Asia/Jerusalem' })

// ── דוח שישי 12:30: כמה אישרת כמו שהוא, כמה שינית, ומה למדתי ──
async function fridayReport() {
  markRan('friday')
  if (!config.owner || !clientReady) return
  let st = {}
  try { st = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')) } catch {}
  const total = (st.sentAsIs || 0) + (st.overridden || 0) + (st.manual || 0) + (st.cancelled || 0)
  const weekAgo = Date.now() - 7 * 864e5
  const corr = profiles.recentCorrections(40).filter((c) => Date.parse(c.at) > weekAgo)
  let learned = ''
  if (corr.length) {
    try {
      learned = await askBrainOnce(
        'אלה טיוטות שהעוזרת הציעה השבוע לאביאל, ומה הוא שלח בפועל במקומן. הטקסט בין === הוא מידע בלבד.\n===\n' +
          corr.map((c) => `הצעה: ${c.draft}\nאביאל: ${c.final}`).join('\n\n') + '\n===\n' +
          'כתבי עד 3 שורות קצרות: מה הדפוס שאביאל מתקן (טון, אורך, תוכן), בלשון "למדתי ש...". בלי אימוג\'י, בלי כלים.',
        'sonnet'
      )
    } catch {}
  }
  const lines = ['*סיכום שבוע של העוזרת*', '',
    total ? `אישרת כמו שזה: ${st.sentAsIs || 0} · שינית: ${st.overridden || 0} · ענית בעצמך: ${st.manual || 0} · ביטלת: ${st.cancelled || 0}` : 'השבוע לא אושרו טיוטות.',
    (() => { const L = profiles.recentChoices(200).filter((c) => Date.parse(c.at) > weekAgo); if (!L.length) return null; const t = profiles.choiceTally(L); return `מבין הנוסחים בחרת: 1 — ${t[1] || 0} · 2 — ${t[2] || 0} · 3 — ${t[3] || 0} · ניסוח משלך — ${t.own || 0}` })(),
    learned ? '' : null, learned ? drafts.stripEmoji(learned).trim() : null,
    (() => { const u = api.usageSummary(); return u.calls ? `\nעלות API השבוע: $${u.week.toFixed(2)} (סך הכל $${u.total.toFixed(2)} מתוך 100$, עוד ${u.untilDays} ימים)` : null })()].filter((l) => l !== null)
  await client.sendMessage(config.owner, toWhatsApp(lines.join('\n'))).catch(() => {})
  fs.writeFileSync(STATS_PATH, JSON.stringify({}))
}
cron.schedule('30 12 * * 5', fridayReport, { timezone: 'Asia/Jerusalem' })

// ── דוח מתאמנים שבועי, ראשון 8:05: שורה לכל מתאמן (משקל, שקילות, אימונים, צעדים) מהשרת ──
async function weekClientsReport() {
  markRan('weekrep')
  if (!config.owner || !clientReady) return
  try {
    const r = await fetch('https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec', { method: 'POST', body: JSON.stringify({ api: 'coach', k: 'c7dfe880cf024fc59fcc9a8a', fn: 'dashboardWeekReport', args: [] }) })
    const j = await r.json(), txt = typeof j === 'string' ? j : (j && (j.result || j.r || j.data))
    if (typeof txt === 'string' && txt.trim()) await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji(txt).trim())).catch(() => {})
  } catch (e) { console.error('weekClientsReport', e.message) }
}
cron.schedule('5 8 * * 0', weekClientsReport, { timezone: 'Asia/Jerusalem' })

// ── התראות חשובות מהאפליקציה (הערה קריטית של מתאמן, בדיקה עצמית שנכשלה): מושכים כל 2 דק׳ ושולחים לאביאל ──
// 31.10.26: תשובה לסרטון טכניקה — "שלח שחף" שולח את התשובה המוכנה לאפליקציה שלו, "שלח שחף: טקסט" שולח טקסט משלך
const TECH_PENDING = {}
// 2.11.26: בקשת החלפה בתפריט — "אשר יאן" מאשר את ההצעה, "אשר יאן: טקסט" מאשר תחליף אחר, "דחה יאן" לא מאשר
const SWAP_PENDING = {}
// 2.11.26: סיכום פגישה מתמלול המיט — "סיכום יאן" שולח לו את הסיכום לאפליקציה (עם התראה)
const MEET_PENDING = {}
async function meetSend(text) { const m = String(text || '').trim().match(/^סיכום\s+(\S+)$/); if (!m) return false; const p = MEET_PENDING[m[1]]; if (!p || Date.now() - p.at > 4 * 864e5) return false
  try { const r = await fetch('https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec', { method: 'POST', body: JSON.stringify({ api: 'coach', k: 'c7dfe880cf024fc59fcc9a8a', fn: 'dashboardMeetSend', args: [p.name, p.text] }) }); const j = await r.json(); if (!j.ok) throw new Error(j.error || 'שגיאה')
    delete MEET_PENDING[m[1]]; await client.sendMessage(config.owner, 'הסיכום נשלח ל' + m[1] + ' באפליקציה').catch(() => {}) } catch (e) { await client.sendMessage(config.owner, 'לא נשלח: ' + e.message).catch(() => {}) }
  return true }
async function swapDecide(text) { const m = String(text || '').trim().match(/^(אשר|דחה)\s+([^\s:：]+)\s*(?:[:：]\s*([\s\S]+))?$/); if (!m) return false; const p = SWAP_PENDING[m[2]]; if (!p || Date.now() - p.at > 4 * 864e5) return false
  const ok = m[1] === 'אשר'
  try { const r = await fetch('https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec', { method: 'POST', body: JSON.stringify({ api: 'coach', k: 'c7dfe880cf024fc59fcc9a8a', fn: 'dashboardSwapDecide', args: [p.name, p.id, ok, (m[3] || '').trim()] }) }); const j = await r.json(); if (!j.ok) throw new Error(j.error || 'שגיאה')
    delete SWAP_PENDING[m[2]]; await client.sendMessage(config.owner, ok ? 'אושר. התפריט של ' + m[2] + ' עודכן: ' + ((j.r && j.r.alt) || '') + '. קיבל/ה התראה' : 'נדחה. ' + m[2] + ' קיבל/ה הודעה שנשארים עם התפריט').catch(() => {}) } catch (e) { await client.sendMessage(config.owner, 'לא בוצע: ' + e.message).catch(() => {}) }
  return true }
async function techReply(text) { const m = String(text || '').trim().match(/^שלח\s+([^\s:：]+)\s*(?:[:：]\s*([\s\S]+))?$/); if (!m) return false; const p = TECH_PENDING[m[1]]; if (!p || Date.now() - p.at > 3 * 864e5) return false
  const body = (m[2] || p.reply).trim()
  try { const r = await fetch('https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec', { method: 'POST', body: JSON.stringify({ api: 'coach', k: 'c7dfe880cf024fc59fcc9a8a', fn: 'dashboardTechReply', args: [p.name, body] }) }); const j = await r.json(); if (!j.ok) throw new Error(j.error || 'שגיאה')
    delete TECH_PENDING[m[1]]; await client.sendMessage(config.owner, 'נשלח ל' + m[1] + ' באפליקציה' + (j.r && j.r.devices ? ', עם התראה' : ' (בלי התראות פעילות, יראה כשייכנס)')).catch(() => {}) } catch (e) { await client.sendMessage(config.owner, 'לא נשלח: ' + e.message).catch(() => {}) }
  return true }
// ── קבוצת "עדכוני מתאמנים" (5.11.26, אביאל): ניתוח בדיקות דם ותמונות נשלחים לשם, לא לצ'אט עם העוזרת ──
// אביאל פותח את הקבוצה מהטלפון וכותב בה משהו; מזהים לפי השם (או המילה "עדכונים") ושומרים את המזהה
const UPD_PATH = path.join(ROOT, 'updates-group.json')
let UPD_UNTIL = 0 // אחרי הודעה של אביאל בקבוצת העדכונים: 3 דקות שבהן מה שנשלח "לאביאל" הולך לקבוצה
function updShort(a) { const L = String(a.body || '').split('\n').map((x) => x.trim()).filter(Boolean), out = []; let sum = L[0] || ''; const dot = sum.search(/[.!?](\s|$)/); if (dot > 0 && dot < 160) sum = sum.slice(0, dot + 1); else if (sum.length > 160) sum = sum.slice(0, 157) + '...'
  out.push(sum); L.slice(1).forEach((x) => { if (/^\d\./.test(x)) { if (out.filter((y) => /^\d\./.test(y)).length < 3) out.push(x.length > 110 ? x.slice(0, 107) + '...' : x) } else if (/^(מחוץ לטווח|חולשות|כל הערכים)/.test(x)) out.push(x.length > 140 ? x.slice(0, 137) + '...' : x) })
  return '*' + a.title + '*\n' + out.join('\n') }
const UPD_GROUP_ON = false // 16.11.26 אביאל: הכל בצ'אט עם העוזרת, לא בקבוצת עדכונים
function updGid() { if (!UPD_GROUP_ON) return ''; try { return JSON.parse(fs.readFileSync(UPD_PATH, 'utf8')).gid || '' } catch { return '' } }
async function updGroupAdopt(msg, cid) {
  const g = updGid(); if (g) return cid === g
  let nm = ''; try { nm = await client.pupPage.evaluate((id) => { const c = window.Store && window.Store.Chat && window.Store.Chat.get(id); return c ? String(c.formattedTitle || c.name || (c.groupMetadata && c.groupMetadata.subject) || '') : '' }, cid) } catch {}
  if (nm.trim() !== 'עדכוני מתאמנים' && String(msg.body || '').trim() !== 'עדכונים') return false
  fs.writeFileSync(UPD_PATH, JSON.stringify({ gid: cid, at: new Date().toISOString() }))
  client.sendMessage(cid, 'מחובר. מעכשיו ניתוח בדיקות דם ותמונות של מתאמנים יגיע לכאן').catch(() => {}); console.log('[upd] adopted', cid); return true }
async function coachAlertsPull() {
  if (!config.owner || !clientReady) return
  try { await foodReview.resume() } catch (e) {}
  try {
    const r = await fetch('https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec', { method: 'POST', body: JSON.stringify({ api: 'coach', k: 'c7dfe880cf024fc59fcc9a8a', fn: 'dashboardCoachAlerts', args: [] }) })
    const j = await r.json(), q = (j && j.ok && Array.isArray(j.r)) ? j.r : []
    for (const a of q) { if (a.kind === 'tech' && a.name && a.reply) TECH_PENDING[String(a.name).split(' ')[0]] = { name: a.name, reply: a.reply, at: Date.now() }; if (a.kind === 'swap' && a.name && a.id) SWAP_PENDING[String(a.name).split(' ')[0]] = { name: a.name, id: a.id, at: Date.now() }; if (a.kind === 'meet' && a.name && a.text) MEET_PENDING[String(a.name).split(' ')[0]] = { name: a.name, text: a.text, at: Date.now() }; const sentA = await client.sendMessage(a.kind === 'upd' && updGid() ? updGid() : config.owner, toWhatsApp(drafts.stripEmoji(a.kind === 'upd' ? updShort(a) : '*' + a.title + '*\n' + (a.body || '')).trim())).catch(() => null); if ((a.kind === 'blood' || a.kind === 'brain') && a.name) { try { bloodGate.remember(sentA, a.name, a.kind, a.opts) } catch (e) {} } }
  } catch (e) { console.error('coachAlertsPull', e.message) }
}
cron.schedule('*/2 * * * *', coachAlertsPull, { timezone: 'Asia/Jerusalem' })
// 18.11.26 (אביאל): כל צילום ארוחה של מתאמן → אליו בוואטסאפ (תמונה + פענוח); תשובה עם תיקון → היומן מתעדכן והמתאמן מקבל הודעה
const mealRelay = require('./meal-relay')({ client, MessageMedia, config, coachApi, toWhatsApp, drafts, askBrainOnce, ready: () => clientReady })
cron.schedule('* * * * *', () => mealRelay.pull(), { timezone: 'Asia/Jerusalem' })
// 18.11.26 (אביאל): שומר תקלות לילי — סורק את יומני האוכל של כולם ומתריע רק אם יש רישום כפול או יום לא הגיוני
const diaryWatch = require('./diary-watch')({ client, config, coachApi, toWhatsApp, ready: () => clientReady })
cron.schedule('30 22 * * *', () => diaryWatch.run(), { timezone: 'Asia/Jerusalem' })
// 19.11.26 (אביאל): ניתוח בדיקות דם מחכה ל"כן" שלו לפני שהמתאמן רואה; "מי בלי בדיקות" = רשימה
const bloodGate = require('./blood-gate')({ client, config, coachApi, toWhatsApp, ready: () => clientReady })
cron.schedule('10 9-21 * * *', () => bloodGate.remind(), { timezone: 'Asia/Jerusalem' }) // 20.11.26: תזכורת אחת על אישור שמחכה יותר מיום
// 20.11.26 (אביאל): 12 שבועות על אותה תוכנית → 3 הצעות לשינוי לפי המתאמן/ת, פעם אחת לכל תוכנית
const progRefresh = require('./prog-refresh')({ client, config, coachApi, toWhatsApp, askBrainOnce, remember: (sent, entry) => bloodGate.rememberAny(sent, entry), stripEmoji: (t) => drafts.stripEmoji(t), ready: () => clientReady })
cron.schedule('30 9 * * *', () => progRefresh.run(), { timezone: 'Asia/Jerusalem' })
// ── שבועי (ראשון 10:00, 1.11.26 אביאל): מי קיבל את האפליקציה ומי נכנס, תקלות מהשבוע, ו-3-5 רעיונות לשיפור ──
async function coachApi(fn, args) { const r = await fetch('https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec', { method: 'POST', body: JSON.stringify({ api: 'coach', k: 'c7dfe880cf024fc59fcc9a8a', fn, args: args || [] }) }); const j = await r.json(); if (!j.ok) throw new Error(j.error || 'שגיאה'); return j.r }
async function weeklyAppIdeas() {
  if (!config.owner || !clientReady) return; markRan('appideas')
  try {
    const TG = (await coachApi('dashboardTagsAll').catch(() => ({}))) || {}, R = ((await coachApi('dashboardAppRollout').catch(() => [])) || []).filter((x) => !(TG[x.name] || []).includes('בלי אפליקציה')) // 22.11.26: מי שלא באפליקציה לא נספר, E = ((await coachApi('dashboardAppErrors').catch(() => [])) || []).filter((x) => Date.now() - Date.parse(x.at) < 7 * 864e5)
    const first = (n) => String(n).split(' ')[0], inW = R.filter((x) => x.days != null && x.days <= 7), never = R.filter((x) => !x.seen), quiet = R.filter((x) => x.days != null && x.days > 7), noPush = R.filter((x) => x.seen && !x.push)
    const status = '*האפליקציה השבוע*' /* 22.11.26: מי נכנס ומתי — עבר לדוח "מי משתמש במה" בסוף סבב הסיכומים */ + (noPush.length ? '\nבלי התראות: ' + noPush.map((x) => first(x.name)).join(', ') : '') + '\nתקלות: ' + (E.length ? E.length : 'אין')
    const ideas = await askBrainOnce('אתה היועץ של אביאל, מאמן כושר ותזונה בליווי אישי, ושל אפליקציית המתאמנים שלו (שקילה, יומן אוכל עם ברקוד/הקלטה/רשימה, תפריט, תוכנית אימון בתרגיל אחד במסך, פעילות נוספת לצעדים, "מותר לי?" שמחשב החלפה מהתפריט, סרטוני טכניקה עם ניתוח, סיכום ערב, תזכורות אוטומטיות למי שלא נשקל או לא רשם). זה מצב השבוע:\n' + status + '\n\nכתוב בדיוק 3 רעיונות לשבוע הקרוב (שיפור באפליקציה, אוטומציה, או למי לפנות). כל רעיון עד 10 מילים, ממוספר. עברית פשוטה, בלי אימוג׳י, בלי מקפים ארוכים, בלי הקדמה.', 'sonnet', { label: 'app-ideas' }).catch(() => '')
    await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji(status + (ideas ? '\n\n*רעיונות לשבוע*\n' + String(ideas).trim() : '') + '').trim())).catch(() => {})
  } catch (e) { console.error('weeklyAppIdeas', e.message) }
}
cron.schedule('0 10 * * 0', weeklyAppIdeas, { timezone: 'Asia/Jerusalem' })
// ── קצב משקל שבועי (13.11.26, אביאל): כל ראשון 08:20, מי מחוץ לקצב לפי הממוצע השבועי מול היעד שהוגדר לו/ה. כלל: בקצב = חצי מהיעד עד פי 1.5 ──
function paceMsg(P) {
  const off = [], miss = [], ok = []
  Object.keys(P || {}).forEach((n) => { const p = P[n]; if (!p || typeof p !== 'object' || p.family || p.err || !p.note || (config.alertMute || []).includes(n)) return
    const first = n.split(' ')[0]
    if (p.icon === '⚪') return
    if (p.icon === '⚠️') miss.push(first)
    else if (p.icon === '✅') ok.push(first)
    else if (!/יעד|שמירה/.test(String(p.note))) return /* בלי יעד קצב בלוח אי אפשר לשפוט */
    else off.push(first + ': ' + String(p.note).replace(/\u200e/g, '').replace(/ · נשקל רק.*$/, '')) })
  if (!off.length && !miss.length) return ''
  return ('*קצב משקל השבוע*\n' + (off.length ? 'מחוץ לקצב:\n' + off.join('\n') + '\n' : '') + (miss.length ? 'לא נשקלו: ' + miss.join(', ') + '\n' : '') + 'בקצב: ' + ok.length + '. הפירוט בלוח, בכרטיס "מגמה לפי היעד".').trim()
}
async function paceReport() {
  if (!config.owner || !clientReady) return; markRan('pace')
  try { const msg = paceMsg(await coachApi('dashboardPulse')); if (msg) await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji(msg))).catch(() => {}) } catch (e) { console.error('paceReport', e.message) }
}
cron.schedule('20 8 * * 0', paceReport, { timezone: 'Asia/Jerusalem' })
// ── מתאמן שלא מתאמן (16.11.26, אביאל): כל בוקר 10:05. סף ימים בלי אימון לפי מספר האימונים בתוכנית: 3 בשבוע = 3 ימים, 5 בשבוע = 2 ימים ──
const TRAIN_GAP_PATH = path.join(ROOT, 'train-gap-state.json')
const APP_EXEC = 'https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec'
function trainGapLimit(n) { return Math.min(5, Math.floor(7 / Math.max(1, n)) + 1) } // 5→2, 4→2, 3→3, 2→4, 1→5
function ilDay(d) { return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) }
async function trainGapFind(api, planOf, today) {
  const out = [], P = await api('dashboardPulse'), L = ((await api('dashboardList')) || {}).clients || []
  for (const c of L) {
    const p = (P || {})[c.name]
    if (!p || typeof p !== 'object' || p.family || c.status !== 'פעיל' || (config.alertMute || []).includes(c.name)) continue
    const card = await api('dashboardClientCard', [c.name]).catch(() => null); if (!card || !card.token) continue
    const pl = await planOf(card.token).catch(() => null); if (!pl) continue
    const days = ((pl.program && pl.program.blocks) || []).filter((b) => b.ex && b.ex.length).length
    if (!days || pl.noProg) continue
    let last = ''
    Object.values(pl.lifts || {}).forEach((v) => (v.hist || []).forEach((h) => { if (h.d && h.d > last) last = h.d }))
    const base = last || String(c.start || '').slice(0, 10); if (!base) continue
    const since = Math.round((Date.parse(today) - Date.parse(base)) / 864e5), missed = since - 1 // ימים מלאים בלי אימון (אתמול ואחורה)
    const lim = trainGapLimit(days)
    if (!last && since < lim + 2) continue // התחיל לא מזמן ועוד לא התאמן: נותנים יומיים נוספים
    if (missed >= lim) out.push({ name: c.name, days, lim, missed, last, never: !last })
  }
  return out
}
async function trainGapReport(dry) {
  if (!dry && (!config.owner || !clientReady)) return; if (!dry) markRan('traingap')
  try {
    const today = ilDay(Date.now())
    const hits = await trainGapFind(coachApi, async (t) => { const r = await fetch(APP_EXEC + '?api=plan&t=' + encodeURIComponent(t)); const j = await r.json(); return j && j.ok ? j.r : null }, today)
    let st = {}; try { st = JSON.parse(fs.readFileSync(TRAIN_GAP_PATH, 'utf8')) } catch {}
    const fresh = hits.filter((h) => { const k = st[h.name]; return !k || k.last !== h.last || Date.now() - Date.parse(k.at) > 5 * 864e5 })
    if (dry) return { hits, fresh }
    if (!fresh.length) return
    const lines = fresh.map((h) => h.name.split(' ')[0] + ': ' + (h.never ? 'עוד לא התאמן/ה' : h.missed + ' ימים בלי אימון, אימון אחרון ' + h.last.slice(8, 10) + '/' + h.last.slice(5, 7)) + ' (בתוכנית ' + h.days + ' בשבוע)')
    await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji('*לא התאמנו*\n' + lines.join('\n') + '\nהודעה מוכנה בכרטיס של כל אחד בלוח.'))).catch(() => {})
    fresh.forEach((h) => { st[h.name] = { last: h.last, at: new Date().toISOString() } }); fs.writeFileSync(TRAIN_GAP_PATH, JSON.stringify(st))
  } catch (e) { console.error('trainGapReport', e.message) }
}
cron.schedule('5 10 * * *', () => trainGapReport(), { timezone: 'Asia/Jerusalem' })

// 16.11.26: פגישה חודשית עם כל מתאמן. בבוקר של הפגישה (ויומיים לפניה) תזכורת לאביאל; אם עברה בלי שנרשמה, תזכורת אחת נוספת
const MEET_DUE_PATH = path.join(__dirname, 'meet-due-state.json')
async function meetDueFind(today) {
  const P = (await coachApi('dashboardPulse')) || {}, L = ((await coachApi('dashboardList')) || {}).clients || [], out = []
  for (const c of L) {
    const p = P[c.name]; if (c.status !== 'פעיל' || !c.nextMeeting || (p && p.family)) continue
    const d = Math.round((Date.parse(c.nextMeeting) - Date.parse(today)) / 864e5)
    if (d >= -3 && d <= 2) out.push({ name: c.name, date: c.nextMeeting, d, time: c.meetingTime || '' })
  }
  return out.sort((a, b) => a.d - b.d)
}
async function meetDueReport(dry) {
  if (!dry && (!config.owner || !clientReady)) return; if (!dry) markRan('meetdue')
  try {
    const hits = await meetDueFind(ilDay(Date.now()))
    let st = {}; try { st = JSON.parse(fs.readFileSync(MEET_DUE_PATH, 'utf8')) } catch {}
    const key = (h) => h.name + '|' + h.date + '|' + (h.d > 0 ? 'soon' : h.d === 0 ? 'today' : 'late')
    const fresh = hits.filter((h) => !st[key(h)])
    if (dry) return { hits, fresh }
    if (!fresh.length) return
    const when = (h) => h.d === 0 ? 'היום' : h.d === 1 ? 'מחר' : h.d > 0 ? 'ב-' + h.date.slice(8, 10) + '/' + h.date.slice(5, 7) : 'הייתה ב-' + h.date.slice(8, 10) + '/' + h.date.slice(5, 7) + ' ולא נרשמה'
    const lines = fresh.map((h) => h.name + ': ' + when(h) + (h.time && h.d >= 0 ? ' ב-' + h.time : ''))
    await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji('*פגישות חודשיות*\n' + lines.join('\n')))).catch(() => {})
    fresh.forEach((h) => { st[key(h)] = new Date().toISOString() }); fs.writeFileSync(MEET_DUE_PATH, JSON.stringify(st))
  } catch (e) { console.error('meetDueReport', e.message) }
}
cron.schedule('20 9 * * *', () => meetDueReport(), { timezone: 'Asia/Jerusalem' })
// ── בדיקות דם בצ'אט (16.11.26, אביאל): שולחים לעוזרת קובץ/תמונה, היא מזהה את המתאמן/ת, מעלה לכרטיס, מנתחת ומחזירה סיכום ותוספים. "תוספים [שם]" שולח למתאמן ומעדכן את האפליקציה ──
let BLOOD_WAIT = null // קובץ שמחכה לשם: { file, mime, fname, at }
const BLOOD_RE = /דם|blood|\blab\b|בדיקות/i
function bloodCandidate(msg, caption) {
  const d = msg._data || {}, fname = String(d.filename || ''), mt = String(d.mimetype || '')
  if (msg.type === 'document') return /pdf|image/i.test(mt) || /\.(pdf|jpe?g|png)$/i.test(fname)
  return msg.type === 'image' && (BLOOD_RE.test(caption || ''))
}
async function bloodClients() { const L = ((await coachApi('dashboardList')) || {}).clients || []; return L.filter((c) => c.name) }
function bloodPickName(text, clients) { // שם מלא או שם פרטי יחיד בטקסט
  const t = String(text || ''); if (!t.trim()) return ''
  const full = clients.filter((c) => t.includes(c.name)); if (full.length === 1) return full[0].name
  const first = clients.filter((c) => new RegExp('(^|[^א-ת])' + c.name.split(' ')[0] + '([^א-ת]|$)').test(t)); return first.length === 1 ? first[0].name : ''
}
async function bloodProcess(name, file, mime, fname) {
  const b64 = fs.readFileSync(file).toString('base64')
  const r = await coachApi('dashboardBloodUpload', [name, 'data:' + mime + ';base64,' + b64, mime, fname || ''])
  const first = name.split(' ')[0], txt = r && (r.text || r.summary || r.body) ? String(r.text || r.summary || r.body).trim() : ''
  if (!txt) return 'הקובץ נשמר בתיקייה של ' + first + ', אבל לא הצלחתי לקרוא ממנו ערכים. אפשר להקליד אותם בכרטיס בלוח.'
  return '*בדיקות דם: ' + first + '*\n' + txt + '\n\nלשליחה ל' + first + ' ועדכון האפליקציה: תוספים ' + first
}
async function bloodFromChat(msg, caption) {
  let file = ''
  try {
    const media = await msg.downloadMedia(); if (!media || !media.data) return
    const ext = /pdf/i.test(media.mimetype || '') ? 'pdf' : /png/i.test(media.mimetype || '') ? 'png' : 'jpg', mime = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg'
    file = path.join(PHOTOS_DIR, 'blood-' + Date.now() + '.' + ext); fs.writeFileSync(file, Buffer.from(media.data, 'base64'))
    const clients = await bloodClients(), fname = String((msg._data || {}).filename || '')
    let name = bloodPickName(caption + ' ' + fname, clients), isBlood = BLOOD_RE.test((caption || '') + ' ' + fname)
    if (!name || !isBlood) { // קוראים את הקובץ עצמו: האם זו בדיקת דם ושם המטופל/ת
      const out = await askBrainOnce('קראי את הקובץ בנתיב ' + file + ' (בכלי Read). האם זו בדיקת דם? אם כן, מה שם המטופל/ת שכתוב בה? החזירי JSON בלבד, בלי טקסט נוסף: {"blood":true|false,"name":"השם כפי שכתוב, או ריק"}', undefined, { tools: true, timeoutMs: 180000 }).catch(() => '')
      let j = null; try { j = JSON.parse(String(out).match(/\{[\s\S]*\}/)[0]) } catch {}
      if (j && j.blood === false && !BLOOD_RE.test(caption || '')) { if (msg.type === 'document') await client.sendMessage(config.owner, 'הקובץ לא נראה לי בדיקת דם, השארתי אותו בלי טיפול.').catch(() => {}); try { fs.unlinkSync(file) } catch {}; return }
      isBlood = true
      if (!name && j && j.name) { const nm = bloodPickName(j.name, clients); name = nm }
    }
    if (!name) { BLOOD_WAIT = { file, mime, fname, at: Date.now(), names: clients.map((c) => c.name.split(' ')[0]) }; await client.sendMessage(config.owner, toWhatsApp('קיבלתי בדיקת דם ולא זיהיתי של מי. תכתוב לי את שם המתאמן/ת ואמשיך.')).catch(() => {}); return }
    await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji(await bloodProcess(name, file, mime, fname)))).catch(() => {})
  } catch (e) { console.error('bloodFromChat', e.message); await client.sendMessage(config.owner, 'לא הצלחתי לעבד את הבדיקה: ' + String(e.message).slice(0, 160)).catch(() => {}) }
}
async function bloodWaitReply(text) {
  if (!BLOOD_WAIT || Date.now() - BLOOD_WAIT.at > 30 * 60000) { BLOOD_WAIT = null; return false }
  const t = String(text || '').trim(); if (!t || t.split(/\s+/).length > 3) return false
  const clients = await bloodClients(), name = bloodPickName(t, clients)
  if (!name) { await client.sendMessage(config.owner, 'לא מצאתי מתאמן/ת בשם הזה. תכתוב שם כמו בלוח.').catch(() => {}); return true }
  const w = BLOOD_WAIT; BLOOD_WAIT = null
  try { await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji(await bloodProcess(name, w.file, w.mime, w.fname)))) } catch (e) { await client.sendMessage(config.owner, 'לא הצלחתי: ' + String(e.message).slice(0, 160)).catch(() => {}) }
  return true
}
// ── מה לעשות היום (1.11.26, אביאל): כל בוקר 3 עד 5 הפעולות הכי חשובות מכל המתאמנים, ההודעות המוכנות מחכות בכרטיס בלוח ──
async function todoMorning() {
  if (!config.owner || !clientReady) return; markRan('todo'); return /* 2.11.26 אביאל: "שיהיה קצר" — אוחד להודעת הבוקר האחת של morning-agent (09:30) */
  try { const r = await coachApi('dashboardTodoAll'); if (!r || !r.top || !r.top.length) return
    const msg = '*מה לעשות היום*\n' + r.top.map((t, i) => (i + 1) + '. ' + t).join('\n') + (r.total > r.top.length ? '\nועוד ' + (r.total - r.top.length) + ' בלוח.' : '') + '\nהודעות מוכנות מחכות בכרטיס של כל אחד.'
    await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji(msg))).catch(() => {})
  } catch (e) { console.error('todoMorning', e.message) } }
cron.schedule('40 7 * * 0-5', todoMorning, { timezone: 'Asia/Jerusalem' })
// 16.11.26 תדריך מחקר על התיק לפני פתיחת וול סטריט, ימים ב'-ו'
async function stocksBrief() {
  if (!config.owner || !clientReady) return
  try { const t = await stocks.brief(); if (t) { await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji(t))); markRan('stocks') } }
  catch (e) { console.error('stocksBrief', e.message); client.sendMessage(config.owner, toWhatsApp('תדריך המניות נכשל: ' + e.message.slice(0, 200))).catch(() => {}) } }
cron.schedule('30 15 * * 1-5', stocksBrief, { timezone: 'Asia/Jerusalem' })
// התראות בזמן המסחר בארה"ב (16:30-23:15 שעון ישראל), שינויי דירוג פעם בשעה
let stocksAlertBusy = false
async function stocksAlerts() {
  if (!config.owner || !clientReady || stocksAlertBusy) return
  const m = ilNow().mins; if (m < 16 * 60 + 45 || m > 23 * 60 + 15) return
  stocksAlertBusy = true
  try { const t = await stocks.alerts(new Date().getMinutes() < 15); if (t) await client.sendMessage(config.owner, toWhatsApp(t)) }
  catch (e) { console.error('stocksAlerts', e.message) } finally { stocksAlertBusy = false } }
cron.schedule('*/15 16-23 * * 1-5', stocksAlerts, { timezone: 'Asia/Jerusalem' })
// דוחות: שמירת הציפיות לפני הדוח, וניתוח בבוקר שאחרי (ושוב ב-16:00 לדוחות של לפני הפתיחה)
cron.schedule('0 15 * * 1-5', () => stocks.earningsSnapshot().catch((e) => console.error('earningsSnapshot', e.message)), { timezone: 'Asia/Jerusalem' })
async function stocksEarnings() {
  if (!config.owner || !clientReady) return
  try { const t = await stocks.earningsDue(); for (const part of t.split('\n\n=====\n\n').filter(Boolean)) await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji(part))) }
  catch (e) { console.error('stocksEarnings', e.message); client.sendMessage(config.owner, toWhatsApp('ניתוח הדוחות נכשל: ' + e.message.slice(0, 200))).catch(() => {}) } }
cron.schedule('30 8 * * 2-6', stocksEarnings, { timezone: 'Asia/Jerusalem' })
cron.schedule('0 16 * * 1-5', stocksEarnings, { timezone: 'Asia/Jerusalem' })
// 16.11.26 אביאל: בדיקת תזה לכל אחזקה, כל יום ראשון בבוקר — תקציר + הדוח המלא כקובץ
async function stocksWeekly() {
  if (!config.owner || !clientReady) return
  try { markRan('stocksWeekly'); const r = await stocks.weekly()
    if (r.text) await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji(r.text)))
    if (r.file && fs.existsSync(r.file)) await client.sendMessage(config.owner, MessageMedia.fromFilePath(r.file), { sendMediaAsDocument: true }).catch((e) => console.error('[stocksWeekly file]', e.message))
  } catch (e) { console.error('stocksWeekly', e.message); client.sendMessage(config.owner, toWhatsApp('בדיקת התזה השבועית נכשלה: ' + e.message.slice(0, 200))).catch(() => {}) } }
cron.schedule('0 9 * * 0', stocksWeekly, { timezone: 'Asia/Jerusalem' })
// 16.11.26 אביאל: סיכום סוף יום מסחר עם תובנה, אחרי הסגירה בארה"ב
async function stocksEod() {
  if (!config.owner || !clientReady) { console.log('[stocks] eod skipped: client not ready'); return }
  try { const t = await stocks.eod(); if (t) { await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji(t))); markRan('stocksEod') } } catch (e) { console.error('stocksEod', e.message) } }
cron.schedule('20 23 * * 1-5', stocksEod, { timezone: 'Asia/Jerusalem' })
// 18.11.26: הסיכומים של 16-17.11 והניתוח של NVIDIA לא רצו (כנראה העוזרת הופעלה מחדש בדיוק בזמנים). כל 10 דקות משלימים מה שפוספס היום
let stocksCatchupBusy = false
cron.schedule('*/10 8-23 * * 1-6', async () => {
  if (!config.owner || !clientReady || stocksCatchupBusy) return
  let r = {}; try { r = JSON.parse(fs.readFileSync(RUNS_PATH, 'utf8')) } catch {}
  const n = ilNow(), weekday = n.dow >= 1 && n.dow <= 5
  stocksCatchupBusy = true
  try {
    if (weekday && n.mins >= 15 * 60 + 40 && n.mins < 23 * 60 && r.stocks !== n.day) { console.log('[stocks] catch-up: brief'); await stocksBrief() }
    if (weekday && n.mins >= 23 * 60 + 30 && r.stocksEod !== n.day) { console.log('[stocks] catch-up: eod'); await stocksEod() }
    if (n.mins % 60 < 10 && r.stocksEarningsHour !== n.day + ':' + Math.floor(n.mins / 60)) { r.stocksEarningsHour = n.day + ':' + Math.floor(n.mins / 60); markRanKey('stocksEarningsHour', r.stocksEarningsHour); await stocksEarnings() }
  } finally { stocksCatchupBusy = false } }, { timezone: 'Asia/Jerusalem' })
// 16.11.26 אביאל: סיכום סרטונים חדשים של מיכה סטוקס, כל ערב
cron.schedule('0 21 * * *', async () => { if (!config.owner || !clientReady) return
  try { const t = await stocks.youtube(); if (t) await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji(t))) } catch (e) { console.error('stocksYoutube', e.message) } }, { timezone: 'Asia/Jerusalem' })
// כמה צילומים ברצף נאספים יחד (20 שניות שקט) ונקראים בהרצה אחת
let stocksMediaFiles = [], stocksMediaTimer = null
async function stocksFromMedia(msg) {
  try {
    const media = await msg.downloadMedia(); if (!media || !media.data) return
    const ext = msg.type === 'video' ? 'mp4' : /png/i.test(media.mimetype || '') ? 'png' : 'jpg'
    const dir = path.join(stocks.DIR, 'inbox'); fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'pf-' + Date.now() + '-' + stocksMediaFiles.length + '.' + ext); fs.writeFileSync(file, Buffer.from(media.data, 'base64'))
    if (!stocksMediaFiles.length) client.sendMessage(config.owner, toWhatsApp('קיבלתי, קורא את התיק מהמסך.')).catch(() => {})
    stocksMediaFiles.push(file); clearTimeout(stocksMediaTimer)
    stocksMediaTimer = setTimeout(async () => {
      const files = stocksMediaFiles; stocksMediaFiles = []
      try { const t = await stocks.updateFromMedia(files); await client.sendMessage(config.owner, toWhatsApp(t)) }
      catch (e) { console.error('stocksFromMedia', e.message); client.sendMessage(config.owner, toWhatsApp('לא הצלחתי לקרוא את התיק מהמסך: ' + e.message.slice(0, 200))).catch(() => {}) }
    }, 20000)
  } catch (e) { console.error('stocksFromMedia dl', e.message) } }
// ── תזכורת טופס לליד (1.11.26, אביאל): מי שלא מילא טופס — אחרי יום ואחרי 3 ימים, מהוואטסאפ העסקי, ועדכון לאביאל ──
async function leadNudges() {
  if (!config.owner || !clientReady) return; const n0 = ilNow(), h = Math.floor(n0.mins / 60); if (h < 10 || h >= 20 || n0.dow === 6) return
  try { const L = (await coachApi('dashboardLeadNudges')) || []
    for (const x of L) { try { await advisor.askApproval(x.phone, x.name, x.text, x.name.split(' ')[0] + ': תזכורת ' + (x.k === 1 ? 'ראשונה' : 'שנייה') + ' למלא את הטופס') /* 10.11.26: רק אחרי אישור של אביאל */ } catch (e) { console.error('leadNudge', x.name, e.message) } }
  } catch (e) { console.error('leadNudges', e.message) } }
cron.schedule('15 * * * *', leadNudges, { timezone: 'Asia/Jerusalem' })
// ── תשלום חודשי (1.11.26): 09:00 במועד — לאביאל מי משלם היום; 18:00 — הודעה למי שלא סומן "התקבל", ודיווח על מי שננעל (3 ימים בלי אישור) ──
const moDate = y => { const m = String(y || '').match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? (+m[2]) + '.' + (+m[1]) : '' }
async function monthlyMorning() {
  if (!config.owner || !clientReady || ilNow().dow === 6) return
  try { const r = (await coachApi('dashboardMonthlyDue', [false])) || {}, L = (r.due || []).filter(x => x.late === 0); if (!L.length) return
    await client.sendMessage(config.owner, toWhatsApp('תשלום חודשי היום:\n' + L.map(x => x.name + (x.price ? ', ' + x.price + ' ש"ח' : '')).join('\n') + '\nכשמגיע, מסמנים "התקבל" בכרטיס בלוח. מי שלא יסומן עד 18:00, אכין לו תזכורת ואשלח רק אחרי שתאשר.')).catch(() => {})
  } catch (e) { console.error('monthlyMorning', e.message) } }
async function monthlyEvening() {
  if (!config.owner || !clientReady || ilNow().dow === 6) return
  try { const r = (await coachApi('dashboardMonthlyDue', [true])) || {}
    for (const x of (r.send || [])) { try { await advisor.askApproval(x.phone, x.name, x.text, x.name.split(' ')[0] + ': תזכורת תשלום חודשי') /* 10.11.26: רק אחרי אישור של אביאל */ } catch (e) { console.error('monthlyNudge', x.name, e.message) } }
    if ((r.locked || []).length) await client.sendMessage(config.owner, toWhatsApp('האפליקציה ננעלה (התשלום לא סומן 3 ימים):\n' + r.locked.map(x => x.name + ', מועד ' + moDate(x.due)).join('\n') + '\nכשמשלמים, "התקבל" בכרטיס פותח אותה מיד.')).catch(() => {})
  } catch (e) { console.error('monthlyEvening', e.message) } }
cron.schedule('0 9 * * *', monthlyMorning, { timezone: 'Asia/Jerusalem' })
cron.schedule('0 18 * * *', monthlyEvening, { timezone: 'Asia/Jerusalem' })
// ── הכנה לפגישה (30.10.26): כשעה לפני פגישה עם מתאמן — דף אחד: משקל, אימונים, אוכל, מה המערכת מציעה (dashboardMeetPrep) ──
async function meetPrepPull() {
  if (!config.owner || !clientReady) return
  try {
    const r = await fetch('https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec', { method: 'POST', body: JSON.stringify({ api: 'coach', k: 'c7dfe880cf024fc59fcc9a8a', fn: 'dashboardMeetPrep', args: [] }) })
    const j = await r.json(), q = (j && j.ok && Array.isArray(j.r)) ? j.r : []
    for (const a of q) await client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji(a.text || '').trim())).catch(() => {})
  } catch (e) { console.error('meetPrepPull', e.message) }
}
cron.schedule('*/10 7-22 * * *', meetPrepPull, { timezone: 'Asia/Jerusalem' })

// ── בדיקת מאכלים יומית 11:30: 10 מהמאגר + 10 חדשים מרמי לוי, אביאל עונה בהודעה אחת (food-review.js) ──
const foodReview = require('./food-review')
foodReview.init({ client, config, toWhatsApp, askBrainOnce, ready: () => clientReady })
async function foodReviewDaily() { markRan('foodrev'); try { await foodReview.daily() } catch (e) { console.error('[food-review]', e.message) } }
cron.schedule('30 11 * * *', foodReviewDaily, { timezone: 'Asia/Jerusalem' })
// ── פקודות מאמן בטקסט חופשי (coach-cmd.js): "ליהב יעד 1400 קלוריות" → בצע/בטל ──
const coachCmd = require('./coach-cmd')
coachCmd.init({ client, config, toWhatsApp })
const coachOps = require('./coach-ops') // 22.11.26
coachOps.init({ say: (t) => client.sendMessage(config.owner, toWhatsApp(t)).catch(() => {}), drafts, biz, profiles, askBrainOnce, queuePush: (id, t, front) => draftQueuePush(id, t, config.owner, !!front) })
const groupAgents = require('./accountant') // שרונה (כספים) ואבי המאמן (מתאמנים) — כל אחד בקבוצה משלו (2.11.26)
groupAgents.init({ client, config, toWhatsApp })
setInterval(() => coachCmd.names(), 36e5)
// ── סוכן בוקר 09:30 (א׳–ו׳): מה שמחכה לאישור בדשבורד, אחד-אחד בווטסאפ (morning-agent.js) ──
const morningAgent = require('./morning-agent')
const coordAgent = require('./coord-agent') // 6.11.26: אירוע / יום בלי מכון מהאפליקציה → 2 הצעות → "אשר שם 1"
coordAgent.init({ coachApi: (fn, args) => coachApi(fn, args), askBrainOnce, stripEmoji: (x) => drafts.stripEmoji(x), ready: () => !!(config.owner && clientReady), send: (t) => client.sendMessage(updGid() || config.owner, toWhatsApp(drafts.stripEmoji(t).trim())).catch(() => {}) })
cron.schedule('1-59/3 * * * *', () => coordAgent.scan().catch((e) => console.error('[coord]', e.message)), { timezone: 'Asia/Jerusalem' })
morningAgent.init({ client, config, toWhatsApp, ready: () => clientReady })
async function morningAgentDaily() { markRan('mornagent'); try { await morningAgent.daily() } catch (e) { console.error('[morning-agent]', e.message) } }
cron.schedule('30 9 * * 0-5', morningAgentDaily, { timezone: 'Asia/Jerusalem' })
// ── קטלוג רמי לוי לשרת (סריקת ברקוד באפליקציה), ראשון 04:00 ──
cron.schedule('0 4 * * 0', () => require('./rami-sync').sync().catch((e) => console.error('[rami-sync]', e.message)), { timezone: 'Asia/Jerusalem' })

// שמות של לידים/מתאמנים מהלוח לטלפונים שלא שמורים באנשי הקשר — כדי שכל התראה תגיע עם שם
async function syncKnownNames() {
  try {
    const { leads, clients } = await advisor.readBoard()
    const map = {}
    for (const x of [...clients, ...leads]) if (x.phone && x.name) map[String(x.phone).replace(/\D/g, '')] = x.name
    fs.writeFileSync(path.join(ROOT, 'brain', 'known-names.json'), JSON.stringify(map, null, 2))
  } catch (e) { console.error('[names]', e.message) }
}
setInterval(syncKnownNames, 10 * 60 * 1000)
setTimeout(syncKnownNames, 20 * 1000)

// חילוץ וביצוע תגי פעולה מתשובת המוח: [[REMIND|...]] / [[CAL|...]]
async function runActions(answer) {
  let text = String(answer || '')
  const notes = []
  for (const m of [...text.matchAll(/\[\[REMIND\|([^|\]]+)\|([^\]]+)\]\]/g)]) {
    const at = m[1].trim()
    if (isNaN(parseAt(at))) { notes.push(`⚠️ תזכורת לא נקבעה — תאריך לא תקין (${at})`); continue }
    const rems = loadRems()
    rems.push({ at, text: m[2].trim() })
    saveRems(rems)
    notes.push(`⏰ אשלח לך תזכורת בווטסאפ: ${at}`)
    console.log('[reminder] set:', at, m[2].trim())
  }
  for (const m of [...text.matchAll(/\[\[CAL\|([^|\]]+)\|([^|\]]+)\|([^\]]+)\]\]/g)]) {
    try {
      await addCalendarEvent(m[1].trim(), m[2].trim(), m[3].trim())
      notes.push(`📅 נכנס ליומן אפל: ${m[3].trim()} — ${m[1].trim()}`)
      console.log('[cal] added:', m[1].trim(), m[3].trim())
    } catch (e) {
      console.error('[cal]', e)
      notes.push(`⚠️ היומן לא הסתדר לי (${e.message.slice(0, 80)}) — אולי צריך לאשר הרשאה במק`)
    }
  }
  // הודעה ללקוח שהעוזרת ניסחה בצ'אט → טיוטה אמיתית לאישור (מחליפה טיוטה ממתינה לאותו אדם)
  let offered = null
  for (const m of [...text.matchAll(/\[\[SEND\|([^|\]]+)\|([\s\S]+?)\]\]/g)]) {
    const who = await findBizContact(m[1].trim()).catch(() => null)
    if (!who) { notes.push(`לא מצאתי בווטסאפ העסקי את "${m[1].trim()}", אז לא הכנתי שליחה. תכתוב את השם כמו שהוא שמור.`); continue }
    const old = drafts.pendingForChat(who.chat_jid, who.phone)
    if (old) drafts.remove(old)
    const heb = await profiles.hebrewFirstName(who.name).catch(() => '')
    offered = drafts.add({ chat_jid: who.chat_jid, phone: who.phone, name: who.name, alias: heb, text: m[2].trim(), clientText: '', risk: 'high' })
    const k = String(heb || who.name).split(/\s+/)[0]
    notes.push(`מוכן לשליחה ל${who.name}. *כן ${k}* = שולחת · *לא ${k}* = לא`)
  }
  const calDone = notes.some((n) => /נכנס ליומן/.test(n))
  text = text.replace(/\[\[(REMIND|CAL|SEND)\|[\s\S]*?\]\]/g, '').replace(/\n{3,}/g, '\n\n').trim()
  // המוח כתב "נכנס ליומן" בלי שבאמת הכניס — לא לתת לזה לעבור בשקט
  if (!calDone && /(נכנס|הכנסתי|קבעתי|רשמתי|מאושר)[^\n]{0,25}ביומן|ביומן[^\n]{0,15}(נכנס|נקבע)/.test(text)) notes.push('שים לב: זה לא נכנס בפועל ליומן. תכתוב שוב עם יום ושעה ואכניס.')
  return { text, notes, offered }
}

// איש קשר בווטסאפ העסקי לפי שם (תיקים, שמות מהלוח, שמות בעברית)
async function findBizContact(q) {
  const qTokens = String(q).trim().split(/\s+/).filter(Boolean)
  const list = await profiles.listClients()
  const hits = []
  for (const c of list) {
    const phone = await biz.phoneForChat(c.jid).catch(() => '')
    const heb = await profiles.hebrewFirstName(c.name).catch(() => '')
    // השם בווטסאפ (לפעמים באנגלית) + השם מהלוח + תעתיק עברי — כל מילה בשאילתה צריכה להופיע באחד מהם
    const hay = [c.name, biz.knownName(phone), heb].filter(Boolean).join(' ')
    if (qTokens.every((t) => hay.includes(t))) hits.push({ chat_jid: c.jid, name: biz.knownName(phone) || c.name, phone })
  }
  if (hits.length === 1) return hits[0]
  // כמה התאמות ("יאן" מול "אודילה אשתו של יאן") — עדיפות למי שהשם הפרטי שלו הוא בדיוק המילה הראשונה
  const exact = hits.filter((h) => String(h.name).split(/\s+/)[0] === qTokens[0])
  return exact.length === 1 ? exact[0] : null
}

client.on('qr', (qr) => {
  qrcode.toFile(QR_PATH, qr, { width: 500, margin: 2 }, () => {})
  setStatus('waiting_qr')
})

client.on('authenticated', () => setStatus('authenticated'))
client.on('auth_failure', (m) => setStatus('auth_failure', { reason: String(m) }))
client.on('disconnected', (r) => { clientReady = false; setStatus('disconnected', { reason: String(r) }) })

client.on('authenticated', () => setTimeout(async () => { if (clientReady) return; try { const pg = client.pupPage; await pg.screenshot({ path: path.join(ROOT, 'stuck.png') }); const st = await pg.evaluate(() => ({ t: document.title, b: (document.body && document.body.innerText || '').slice(0, 300) })); console.log('[stuck]', JSON.stringify(st)) } catch (e) { console.log('[stuck] err', e.message) } }, 90000))
client.on('ready', () => {
  clientReady = true
  console.log('[apartment] group', aptGid || 'not known yet — waiting for a message in the group')
  try { fs.unlinkSync(QR_PATH) } catch {}
  setStatus(config.owner ? 'paired' : 'ready_waiting_pair')
})

// ── מעקב בריאות כללי: תקלת "detached Frame" ב-Puppeteer קרתה כמה פעמים וגרמה לכל השליחות
// (תזכורות, שגרות, לידים) להיכשל בשקט בלי שהחיבור עצמו התנתק. בודקים כל 5 דקות שהקליינט
// באמת מגיב - אם לא, יוצאים מהתהליך כדי שה-LaunchAgent יפעיל תהליך חדש עם דפדפן נקי.
setInterval(async () => {
  if (!config.owner) return
  try {
    const state = await Promise.race([
      client.getState(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getState timeout')), 15000)),
    ])
    if (state !== 'CONNECTED') {
      console.error(`[healthcheck] client state is "${state}", not CONNECTED - restarting`)
      process.exit(1)
    }
  } catch (e) {
    console.error('[healthcheck] client unresponsive:', e.message, '- restarting')
    process.exit(1)
  }
}, 5 * 60 * 1000)

// תור: הודעה אחת בכל רגע, לפי הסדר
let queue = Promise.resolve()

// ערוץ העוזרת = הצ'אט שבו נשלחה הודעת ההפעלה.
// עובד גם כשאביאל כותב מהטלפון המקושר (fromMe) וגם מהטלפון השני — אותו צ'אט.
const chatIdOf = (msg) => (msg.fromMe ? msg.to : msg.from)

// 22.11.26 (אביאל: "למה זה נתקע" — "1 מור" נכתב בזמן אתחול ואבד): כל הודעה שעובדה נרשמת, ואחרי אתחול
// קוראים מחדש את ההודעות של אביאל מ-20 הדקות האחרונות בצ'אט שלו ובקבוצות, ומעבדים רק את מה שלא עובד
const MSEEN_PATH = path.join(ROOT, 'seen-msgs.json')
let MSEEN = {}, MSEEN_FIRST = !fs.existsSync(MSEEN_PATH); try { MSEEN = JSON.parse(fs.readFileSync(MSEEN_PATH, 'utf8')) } catch {}
let seenDirty = false
const markSeen = (msg) => { const id = msg && msg.id && msg.id._serialized; if (!id || MSEEN[id]) return; MSEEN[id] = msg.timestamp || Math.floor(Date.now() / 1000); seenDirty = true }
setInterval(() => { if (!seenDirty) return; seenDirty = false; const cut = Date.now() / 1000 - 2 * 86400; for (const k of Object.keys(MSEEN)) if (MSEEN[k] < cut) delete MSEEN[k]; try { fs.writeFileSync(MSEEN_PATH, JSON.stringify(MSEEN)) } catch {} }, 5000)
async function recoverMissed() {
  if (!config.owner) return
  { const q = dqLoad(); if (q.cur && drafts.get(q.cur)) offerDraft(q.cur) } // "1" אחרי אתחול = הטיוטה שמוצגת עכשיו
  const ids = [config.owner, updGid()]; try { const r = JSON.parse(fs.readFileSync(path.join(ROOT, 'routes.json'), 'utf8')); ['personal', 'biz', 'coach'].forEach((k) => r[k] && ids.push(r[k])) } catch {}
  const since = Date.now() / 1000 - 20 * 60; let n = 0
  for (const id of [...new Set(ids.filter(Boolean))]) {
    try {
      const chat = await client.getChatById(id), msgs = await chat.fetchMessages({ limit: 20 })
      for (const m of msgs) {
        if (!m || m.timestamp < since || MSEEN[m.id && m.id._serialized] || m.fromMe) continue
        if (!(m.from === config.owner || m.author === config.owner)) continue
        if (String(m.body || '').startsWith(BOT_MARK)) continue
        if (MSEEN_FIRST) { markSeen(m); continue } // ריצה ראשונה של הגרסה: רק מסמנים, לא מעבדים שוב
        console.log('[recover] missed during restart:', String(m.body || '').slice(0, 40)); n++
        onIncoming(m)
      }
    } catch (e) { console.error('[recover]', id, e.message) }
  }
  if (n) client.sendMessage(config.owner, toWhatsApp(`חזרתי מאתחול וטיפלתי ב-${n} ${n === 1 ? 'הודעה שכתבת' : 'הודעות שכתבת'} בזמן שהייתי למטה.`)).catch(() => {})
}
client.on('ready', () => setTimeout(() => recoverMissed().catch((e) => console.error('[recover]', e.message)), 25 * 1000))

function onIncoming(msg) {
  try {
    markSeen(msg)
    const cid = chatIdOf(msg)
    if (config.owner && cid === config.owner && !msg.fromMe) { try { fs.writeFileSync(path.join(ROOT, 'last-owner-msg.json'), JSON.stringify({ at: Date.now() })) } catch {} } // safe-restart.sh מחכה ל-5 דקות שקט
    const text = (msg.body || '').trim()
    // לוג רק לצ'אט של אביאל עם העוזרת — לא לרשום תוכן משיחות פרטיות אחרות
    if (config.owner && cid === config.owner) {
      console.log('[msg]', JSON.stringify({ from: msg.from, to: msg.to, fromMe: msg.fromMe, cid, text: text.slice(0, 60) }))
    }
    if (cid && aptGid && cid === aptGid) { logAptFeedback(msg); return } // קבוצת הדירות עם אמא — רק רישום
    if (cid && !aptGid && cid.endsWith('@g.us')) aptGroupAdopt(msg, cid)
    if (cid && cid.endsWith('@g.us')) { const rc = routes.catOf(cid), mine = config.owner && (msg.author === config.owner) && !String(msg.body || '').startsWith(BOT_MARK)
      if (rc) { if (mine) { ROUTE_REPLY = { gid: cid, until: Date.now() + 3 * 60000 }; const pm = Object.create(msg); Object.defineProperties(pm, { from: { value: config.owner }, fromMe: { value: false }, author: { value: undefined } }); onIncoming(pm) } return } // תשובה בקבוצה שלנו = כמו בצ'אט עם העוזרת
      const kw = mine && msg.type === 'chat' && routes.KEYWORD[String(msg.body || '').trim()]; if (kw && !routes.gidFor(kw)) { routes.adopt(kw, cid); client.sendMessage(cid, BOT_MARK + routes.INTRO[kw]).catch(() => {}); console.log('[routes] adopted', kw, cid); return } }
    if (cid && cid.endsWith('@g.us')) { const ug = updGid(); if (cid === ug) { if (config.owner && msg.author === config.owner && !String(msg.body || '').startsWith(BOT_MARK)) { UPD_UNTIL = Date.now() + 3 * 60000; const pm = Object.create(msg); Object.defineProperties(pm, { from: { value: config.owner }, fromMe: { value: false }, author: { value: undefined } }); onIncoming(pm) } return } /* תשובה בקבוצת העדכונים = כמו בצ'אט עם העוזרת, והמענה חוזר לקבוצה */ if (!ug && msg.type === 'chat' && (msg.fromMe || msg.author === config.owner)) updGroupAdopt(msg, cid).catch(() => {}) } // 5.11.26 קבוצת "עדכוני מתאמנים"
    if (cid && cid.endsWith('@g.us')) { const ag = groupAgents.agentFor(cid); if (ag) { if (msg.type === 'chat') ag.handle(msg); return } if (msg.type === 'chat' && (msg.fromMe || msg.author === config.owner)) groupAgents.adopt(msg, cid).then((a) => { if (a) a.handle(msg) }).catch(() => {}); return } // קבוצות הסוכנים
    if (!cid || cid.endsWith('@g.us')) return // בלי קבוצות

    // בקשת מתכון מהאתר (כפתור "שלחו לי בווטסאפ") — מגיעה מטלפון של גולש, לא מערוץ אביאל
    if (!msg.fromMe) {
      const parsedReq = parseRequestMessage(text)
      if (parsedReq) {
        const list = loadRequests()
        list.push({ at: new Date().toISOString(), phone: msg.from, name: parsedReq.name, text: parsedReq.body })
        saveRequests(list)
        console.log('[recipe-request] logged:', parsedReq.body.slice(0, 60))
        if (config.owner) {
          const lines = ['🍽️ *בקשת מתכון חדשה מהאתר!*', '']
          if (parsedReq.name) lines.push(`👤 ${parsedReq.name}`)
          lines.push(`"${parsedReq.body}"`, '', `יש ${list.length} בקשות שממתינות. לרשימה המלאה כתוב "בקשות מתכונים".`)
          client.sendMessage(config.owner, toWhatsApp(lines.join('\n'))).catch(console.error)
        }
        return
      }
    }

    // הודעה קולית ממתאמן/ליד (לא מערוץ אביאל) → תמלול בשקט, כדי שהטיוטה תדע מה הוא שאל
    if ((msg.type === 'ptt' || msg.type === 'audio') && !msg.fromMe && config.owner && cid !== config.owner) {
      queue = queue.then(async () => {
        // מחכים שהגשר ישמור את הקובץ (מוריד מיד כשההודעה מגיעה), ואז מתמללים ממנו
        await new Promise((r) => setTimeout(r, 15000))
        const n = await transcripts.transcribeClientAudio(cid, { hours: 1, max: 3 }).catch((e) => { console.error('[transcribe]', e.message); return 0 })
        if (n) console.log('[transcribe] client voice notes:', n)
      }).catch(() => {})
      return
    }

    // הודעה קולית בערוץ של אביאל → תמלול
    if ((msg.type === 'ptt' || msg.type === 'audio') && config.owner && cid === config.owner) {
      queue = queue.then(() => handleVoice(msg)).catch((e) => console.error('[queue]', e))
      return
    }

    // תמונה בערוץ של אביאל → ניתוח (למשל תמונת התקדמות של לקוח)
    // 16.11.26 צילום / הקלטת מסך של התיק עם "תיק" בכיתוב → עדכון האחזקות בסוכן המניות
    if ((msg.type === 'image' || msg.type === 'video') && config.owner && cid === config.owner && stocks.isMediaCaption(text)) { stocksFromMedia(msg); return }
    if ((msg.type === 'image' || msg.type === 'document') && config.owner && cid === config.owner && bloodCandidate(msg, text)) { queue = queue.then(() => bloodFromChat(msg, text)).catch((e) => console.error('[blood]', e)); return }
    if (msg.type === 'image' && config.owner && cid === config.owner) {
      queue = queue.then(() => handlePhoto(msg, text)).catch((e) => console.error('[queue]', e))
      return
    }

    if (!text || text.startsWith(BOT_MARK)) return // לא להגיב לעצמנו

    // צימוד ראשוני: "הפעל עוזר" מכל אחד מהטלפונים של אביאל
    if (!config.owner) {
      if (text.includes(PAIR_PHRASE)) {
        config.owner = cid
        saveConfig()
        setStatus('paired')
        client.sendMessage(
          cid,
          toWhatsApp(
            'היי אביאל 👋 העוזרת האישית שלך באוויר!\n\n' +
              'הצ\'אט הזה הוא הקו הישיר בינינו — משני הטלפונים שלך.\n' +
              'אפשר לבקש ממני דברים כמו:\n' +
              '• מה הלוז שלי היום?\n' +
              '• יש לידים חדשים?\n' +
              '• תזכיר לי להתקשר לניצן ב-17:00\n' +
              '• תכין לי רעיון לסטורי\n\n' +
              'וכל בוקר ב-9:00 — הלוז והדגשים של היום ☀️\n' +
              '(לשיחה נקייה — שלח "שיחה חדשה")'
          )
        ).catch(console.error)
      }
      return
    }

    if (cid !== config.owner) return // עונה רק בערוץ של אביאל
    if (!msg.fromMe && msg.from !== config.owner) return

    // "בדיקה" — טיוטה שנשלחת לאביאל עצמו (למספר השני שלו) כדי לבדוק את כל המסלול בלי לגעת בלקוח
    if (/^בדיקה$/.test(text)) {
      queue = queue.then(async () => {
        const me = await biz.selfChat()
        if (!me || !me.phone) return client.sendMessage(config.owner, toWhatsApp('לא מצאתי את המספר השני שלך בווטסאפ העסקי, אז אין למי לשלוח בדיקה.'))
        const id = drafts.add({ chat_jid: me.chat_jid, phone: me.phone, name: 'בדיקה (אתה)', alias: 'בדיקה', text: BOT_MARK + 'בדיקת מערכת של העוזרת: ההודעה הזו יצאה מהווטסאפ העסקי אחרי אישור. אפשר להתעלם.', clientText: 'בדיקה', risk: 'low' })
        const sent = await client.sendMessage(config.owner, toWhatsApp(['*בדיקה (אתה)* כתב: "בדיקה" (שגרתי)', '', '*התשובה שאשלח:*', drafts.get(id).text, '', drafts.approvalHint(id, 'בדיקה')].join('\n')))
        if (sent?.id?._serialized) drafts.setAlertMsgId(id, sent.id._serialized)
      }).catch((e) => console.error('[test]', e))
      return
    }

    // 11.11.26 פרוטוקול הקיץ: "פרוטוקול 0501234567 דנה כהן" / "פרוטוקול מצב" / "פרוטוקול עצור <טלפון>" / "פרוטוקול אשר <טלפון>" (protocol.js)
    if (protocol.isCommand(text)) { queue = queue.then(() => protocol.handleCommand(text)).catch((e) => console.error('[protocol]', e)); return }

    // 16.11.26 "תיק" / "מניות" — תדריך מחקר על התיק עכשיו (stocks.js). רץ ברקע, לא חוסם את התור
    if (stocks.isCommand(text)) { client.sendMessage(config.owner, toWhatsApp('אוסף נתונים וחדשות על התיק, זה לוקח כ-4 דקות.')).catch(() => {}); stocksBrief(); return }
    { const dm = stocks.deepCommand(text); if (dm) { client.sendMessage(config.owner, toWhatsApp(`מתחיל צלילה לעומק על ${dm[1].toUpperCase()}. זה לוקח כ-10 דקות.`)).catch(() => {}); stocks.deep(dm[1]).then((t) => client.sendMessage(config.owner, toWhatsApp(drafts.stripEmoji(t)))).catch((e) => { console.error('[stocks deep]', e.message); client.sendMessage(config.owner, toWhatsApp('הצלילה נכשלה: ' + e.message.slice(0, 200))).catch(() => {}) }); return } }
    { const lm = stocks.levelCommand(text); if (lm) { stocks.setLevel(lm).then(() => client.sendMessage(config.owner, toWhatsApp(`רשמתי: אתריע כש-${lm[1].toUpperCase()} ${lm[2]} ${lm[3]}.`))).catch((e) => console.error('[stocks level]', e.message)); return } }

    // "תמחקי את מה ששלחת לעומר" / "מחק הודעה לשון" / "תמחקי את ההודעה האחרונה" — מחיקה לכולם
    const delM = text.match(/^(?:תמחק|תמחקי|מחק|מחקי|תבטל|תבטלי)\s+(?:את\s+)?(?:מה ששלחת|ההודעה(?:\s+האחרונה)?|הודעה)(?:\s+(?:ש(?:שלחת\s+)?)?(?:ל|של)\s*(.+))?$/)
    if (delM) {
      queue = queue.then(async () => {
        const who = (delM[1] || '').trim()
        const e = drafts.findSent(who || null)
        if (!e) return client.sendMessage(config.owner, toWhatsApp(who ? `לא מצאתי הודעה ששלחתי ל${who} ביומיים האחרונים.` : 'לא מצאתי הודעה ששלחתי ביומיים האחרונים.'))
        try {
          await drafts.revokeSent(e)
          await client.sendMessage(config.owner, toWhatsApp(`מחקתי לכולם את ההודעה ל${e.name}:\n"${String(e.text).slice(0, 200)}"`))
          console.log('[revoke]', e.name)
        } catch (err) {
          await client.sendMessage(config.owner, toWhatsApp(`לא הצלחתי למחוק את ההודעה ל${e.name} (${err.message}). אפשר למחוק ידנית מהטלפון: לחיצה ארוכה ← מחק ← מחק לכולם.`))
        }
      }).catch((er) => console.error('[revoke]', er))
      return
    }

    // תיקון/כלל קבוע ("תמיד...", "אף פעם...", "לא ככה", "מעכשיו...") — נשמר ב-brain/prefs.md ונכנס לכל טיוטה
    if (/^(תמיד|אף פעם|לא ככה|לא כך|אל ת|מעכשיו|מהיום|בפעם הבאה|תזכור|תזכרי|כלל:)/.test(text)) {
      queue = queue.then(async () => {
        try {
          const rule = String(await askBrainOnce(
            `אביאל כתב לעוזרת שלו: "${text}"\nנסחי מזה כלל קבוע אחד, קצר וברור, לגבי איך לענות ללקוחות בווטסאפ העסקי או איך לעבוד איתו. שורה אחת בלבד, בלי הקדמות ובלי אימוג'י. אם זה לא כלל אלא בקשה חד-פעמית — כתבי רק NONE.`, 'haiku')).trim()
          if (rule && !/^NONE$/i.test(rule)) {
            fs.appendFileSync(PREFS_PATH, `- ${rule.replace(/^-\s*/, '')} (${new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })})\n`)
            await client.sendMessage(config.owner, toWhatsApp(`שמרתי ככלל קבוע: ${rule}`))
          }
        } catch (e) { console.error('[prefs]', e.message) }
        return handle(msg, text)
      }).catch((er) => console.error('[prefs]', er))
      return
    }

    // "כמה עלה" / "מצב API" — כמה עלה ה-API היום, השבוע ובסך הכל
    if (/^(כמה עלה|כמה זה עלה|מצב api|מצב API|עלויות)$/.test(text)) {
      const u = api.usageSummary()
      const on = api.available()
      client.sendMessage(config.owner, toWhatsApp([
        `*שימוש ב-API* (${on ? 'פעיל' : 'כבוי, עובדת מהמנוי'})`,
        `היום: $${u.today.toFixed(2)} · 7 ימים: $${u.week.toFixed(2)} · סך הכל: $${u.total.toFixed(2)} מתוך 100$`,
        `${u.calls} קריאות · ${Math.round(u.cacheHit * 100)}% מהקלט מהמטמון · הקרדיט בתוקף עוד ${u.untilDays} ימים`,
      ].join('\n'))).catch(console.error)
      return
    }

    // "הבטחות" — מה אביאל הבטיח ועוד לא נסגר; "סיימתי שון" — סגירה ידנית
    if (/^(הבטחות|מה הבטחתי)$/.test(text)) {
      promisesMod.scan(36).catch(() => 0).then(() => { const l = promisesMod.open(); client.sendMessage(config.owner, toWhatsApp(l.length ? '*הבטחות פתוחות:*\n' + promisesMod.render(l) + '\n\nסגירה: "סיימתי" + שם' : 'אין הבטחות פתוחות.')).catch(console.error) })
      return
    }
    const doneM = text.match(/^(?:סיימתי|קיימתי|בוצע)\s+(.+)$/)
    if (doneM) {
      const n = promisesMod.markDone(doneM[1].trim())
      client.sendMessage(config.owner, toWhatsApp(n ? `סגרתי ${n} הבטח${n === 1 ? 'ה' : 'ות'} ל${doneM[1].trim()}.` : `לא מצאתי הבטחה פתוחה ל${doneM[1].trim()}.`)).catch(console.error)
      return
    }

    // "פרופיל שון" — התיק של מתאמן; "למדי מחדש" — ריענון מיידי של התיקים והסגנון
    const prof = text.match(/^(?:פרופיל|תיק)\s+(.+)$/)
    if (prof) {
      const hit = profiles.findProfileByName(prof[1].trim())
      client.sendMessage(config.owner, toWhatsApp(hit ? hit.text : `אין לי עדיין תיק על "${prof[1].trim()}". כתוב "למדי מחדש" ואבנה.`)).catch(console.error)
      return
    }
    if (/^(למדי מחדש|תלמדי מחדש|רענון תיקים)$/.test(text)) {
      client.sendMessage(config.owner, toWhatsApp('מתחילה ללמוד מחדש. זה לוקח כמה דקות, אעדכן כשסיימתי.')).catch(console.error)
      nightlyLearning({ full: true }).then((r) => client.sendMessage(config.owner, toWhatsApp(r ? `סיימתי. עדכנתי ${r.n} תיקים ו-${r.pairs} דוגמאות תשובה.` : 'הלמידה נכשלה. נסה שוב מאוחר יותר.')).catch(console.error))
      return
    }

    // אישור טיוטה ללקוח: "שלח" (כתשובה להתראה) / "שלח 7" / "שלח 7: טקסט" / "בטל 7"
    // פקודות היועץ: "נסגר שם 990" / "לחשוב שם" / "לא מתאים שם" / "הוכחות שם לא"
    if (/^סיכום\s+\S+$/.test(String(text || '').trim()) && MEET_PENDING[String(text).trim().split(/\s+/)[1]]) { queue = queue.then(() => meetSend(text)).catch((e) => console.error('[meet]', e)); return } // שליחת סיכום פגישה
    if (coordAgent.isReply(text)) { queue = queue.then(() => coordAgent.handleReply(text)).catch((e) => console.error('[coord]', e)); return } // 6.11.26 אישור הצעה לאירוע / יום בלי מכון
    if (/^(אשר|דחה)\s+\S/.test(String(text || '').trim()) && SWAP_PENDING[String(text).trim().split(/\s+/)[1].replace(/[:：].*$/, '')]) { queue = queue.then(() => swapDecide(text)).catch((e) => console.error('[swap]', e)); return } // בקשת החלפה בתפריט
    if (BLOOD_WAIT && config.owner && cid === config.owner && Date.now() - BLOOD_WAIT.at < 30 * 60000 && String(text || '').trim().split(/\s+/).length <= 3 && !/^(תוספים|שלח|בטל|אשר|דחה|סיכום)\b/.test(String(text || '').trim()) && BLOOD_WAIT.names.some((n) => String(text).includes(n))) { queue = queue.then(() => bloodWaitReply(text)).catch(() => {}); return }
    { const m = String(text || '').trim().match(/^תוספים\s+(.+)$/); if (m) { queue = queue.then(async () => { try { const r = await coachApi('dashboardBloodSuppSend', [m[1].trim()]); await client.sendMessage(config.owner, 'נשלח ל' + String(r.name).split(' ')[0] + ': ' + r.items.join(', ') + '. עם הקישורים מהמדריך, ונכנס לו/ה לויטמינים ותוספים באפליקציה') } catch (e) { await client.sendMessage(config.owner, 'לא נשלח: ' + e.message) } }).catch(() => {}); return } } // 5.11.26 תוספים לפי בדיקות דם
    if (/^שלח\s+\S/.test(String(text || '').trim()) && TECH_PENDING[String(text).trim().split(/\s+/)[1].replace(/[:：].*$/, '')]) { queue = queue.then(() => techReply(text)).catch((e) => console.error('[tech-reply]', e)); return } // תשובה לסרטון טכניקה
    if (morningAgent.isReply(text) && !coachCmd.hasPending()) { queue = queue.then(() => morningAgent.handleReply(text)).catch((e) => console.error('[morning-agent]', e)); return } // תשובה לסוכן הבוקר
    if (groupAgents.has('avi') && coachCmd.isCandidate(text, msg.hasQuotedMsg) && !coachCmd.hasPending()) { queue = queue.then(() => client.sendMessage(config.owner, toWhatsApp('פקודות על מתאמנים עברו לאבי המאמן, בקבוצה שלו. פה אני המנהלת האישית שלך.'))).catch(() => {}); return }
    // 22.11.26 (אביאל: "שאני כמעט לא אצטרך להיכנס לאפליקציה"): כרטיס / תשלום / חידוש / מתאמן חדש / שינוי תפריט-תוכנית מהוואטסאפ
    if (!msg.hasQuotedMsg && coachOps.isMine(text) && !(/^(1|2|כן|לא)$/.test(String(text).trim()) && lastOfferedAt > coachOps.pendingAt())) { queue = queue.then(async () => { if (!(await coachOps.handle(text))) await handle(msg, text) }).catch((e) => console.error('[coach-ops]', e)); return }
    if (coachCmd.isCandidate(text, msg.hasQuotedMsg)) { queue = queue.then(async () => { if (!(await coachCmd.handle(text))) await handle(msg, text) }).catch((e) => console.error('[coach-cmd]', e)); return } // פקודת מאמן; לא פקודה → שיחה רגילה
    if (foodReview.isReply(text)) { queue = queue.then(() => foodReview.handleReply(text)).catch((e) => console.error('[food-review]', e)); return } // תשובה לבדיקת המאכלים היומית
    const closeCmd = advisor.parseCloseCommand(text)
    if (closeCmd) {
      queue = queue.then(() => advisor.handleCloseCommand(closeCmd)).catch((e) => console.error('[advisor-close]', e))
      return
    }
    const botCmd = advisor.parseBotCommand(text) // "בוטים" / "כבה חידושים" / "הדלק חידושים"
    if (botCmd) { advisor.handleBotCommand(botCmd).catch((e) => console.error('[advisor-bots]', e)); return }
    if (/^(5 לסגור|מי לסגור היום|לידים לסגור)$/.test(text)) { advisor.dailyCloseList().catch((e) => console.error('[advisor-daily]', e)); return }
    if (/^(דוח מנכ"ל|דוח מנכל|דוח שבועי)$/.test(text)) { advisor.ceoReport().catch((e) => console.error('[advisor-ceo]', e)); return }

    // "כן שון" רק אם באמת יש תשובה ממתינה לשון; אחרת זו שיחה רגילה עם העוזרת ("כן אני מגיע מחר")
    // כמה אישורים בהודעה אחת: "כן רון, כן שון, לא יובל" — כל אחד נבדק ונשלח בנפרד
    if (/^(הבא|דלג)$/.test(String(text || '').trim()) && draftQueueSkip()) return
    if (/^חידושים$/.test(String(text || '').trim())) { queue = queue.then(() => renewalBoard(true)).catch((e) => console.error('[renewboard]', e)); return } // 22.11.26
    { const all = String(text || '').trim().match(/^(כן|שלח|שלחי|לא|בטל|בטלי) לכולם$/), ids = all ? (() => { const a = advisor.nudgeBatchInfo(), b = followBatchInfo(); const use = b && (!a || Date.parse(b.at) > Date.parse(a.at)) ? b.ids : advisor.nudgeBatchIds(); return use.filter((i) => drafts.get(i)) })() : [] // 21.11.26: תזכורות המתאמנים מגיעות בהודעה אחת
      if (all && ids.length) { const yes = /^(כן|שלח|שלחי)$/.test(all[1]), acc = []
        if (!yes) { ids.forEach((i) => drafts.remove(i)); client.sendMessage(config.owner, toWhatsApp('בוטל. ' + ids.length + ' הודעות לא נשלחו.')).catch(() => {}); return }
        for (const i of ids) queue = queue.then(() => handleDraftCommand(msg, { type: 'send', ref: String(i), option: 1, force: false, override: null, _acc: acc })).catch((e) => console.error('[draft]', e))
        queue = queue.then(() => client.sendMessage(config.owner, toWhatsApp(acc.length ? 'נשלח: ' + acc.join(', ') + '.' : 'לא נשלח כלום.'))).catch(() => {})
        return } }
    const multi = drafts.parseCommands(text)
    if (multi && multi.every((c) => /^\d+$/.test(c.ref) || drafts.resolveRef(c.ref))) {
      const acc = [] // 21.11.26: אישור אחד לכל הסבב במקום "נשלח ל..." על כל שם
      for (const c of multi) { c._acc = acc; queue = queue.then(() => handleDraftCommand(msg, c)).catch((e) => console.error('[draft]', e)) }
      queue = queue.then(() => { if (acc.length) return client.sendMessage(config.owner, toWhatsApp('נשלח: ' + acc.join(', ') + '.')) }).catch(() => {})
      return
    }
    if (config.owner && cid === config.owner) { // 19.11.26: אישור ניתוח בדיקות דם (ציטוט "כן" / "רק ניתוח" / "לא", או "בדיקות <שם> כן"), ו"מי בלי בדיקות"
      const be = msg.hasQuotedMsg && bloodGate.byStanza(msg._data && msg._data.quotedStanzaID), bm = be && bloodGate.modeOf(text), bn = be && be.k === 'blood' ? be.n : null
      { const bp = be && bloodGate.pickOf(text), pick = be && be.o && (bp || (bm === 'yes' ? 1 : 0)) // 20.11.26: בחירה במספר מתוך האפשרויות ("כן" = אפשרות 1)
        if (be && be.k === 'brain' && be.o && (pick || bm === 'no')) { queue = queue.then(() => bm === 'no' && !bp ? bloodGate.brainOption(be, be.o.indexOf('hold') + 1) : bloodGate.brainOption(be, pick)).catch((e) => console.error('[brain-gate]', e)); return }
        if (be && be.k === 'prog' && pick) { queue = queue.then(() => bloodGate.progOption(be, pick)).catch((e) => console.error('[prog-gate]', e)); return } }
      if (be && be.k === 'brain' && (bm === 'yes' || bm === 'no')) { queue = queue.then(() => bloodGate.brainDecide(be.n, bm)).catch((e) => console.error('[brain-gate]', e)); return } // 20.11.26: "כן"/"לא" על הצעה מהמוח
      if (bn && bm) { queue = queue.then(() => bloodGate.decide(bn, bm)).catch((e) => console.error('[blood-gate]', e)); return }
      const bc = bloodGate.parseCmd(text); if (bc && bc.mode) { queue = queue.then(() => bloodGate.decide(bc.who, bc.mode)).catch((e) => console.error('[blood-gate]', e)); return }
      { const mc0 = String(text || '').trim().match(/^בטל ימים גבוהים\s+(.+)$/); if (mc0) { queue = queue.then(async () => { try { const r = await coachApi('dashboardCycleOff', [mc0[1].trim()]); await client.sendMessage(config.owner, toWhatsApp('בוטל: ' + String(r.name).split(' ')[0] + ' חזר/ה ליעד קבוע של ' + r.k + ' קלוריות.')) } catch (e) { await client.sendMessage(config.owner, toWhatsApp('לא בוטל: ' + String(e.message).slice(0, 120))) } }).catch(() => {}); return } } // 20.11.26
      if (bloodGate.isPendingCmd(text)) { queue = queue.then(() => bloodGate.pending()).catch((e) => console.error('[pending]', e)); return }
      if (bloodGate.isMissingCmd(text)) { queue = queue.then(() => bloodGate.missing()).catch((e) => console.error('[blood-gate]', e)); return } }
    { const mq0 = msg.hasQuotedMsg && config.owner && cid === config.owner && mealRelay.qidByStanza(msg._data && msg._data.quotedStanzaID) // 18.11.26: "כן"/תיקון על הודעת ארוחה — לפני הטיוטות
      if (mq0) { queue = queue.then(() => mealRelay.fix(mq0, text)).catch((e) => { console.error('[meal-fix]', e); client.sendMessage(config.owner, toWhatsApp('התיקון לארוחה לא עבר: ' + String(e.message || e).slice(0, 120))).catch(() => {}) }); return } }
    let draftCmd = drafts.parseCommand(text)
    // 22.11.26: תשובה למספר אחרי "יש כמה" → מבצעים את הפקודה המקורית על הטיוטה שנבחרה
    if (draftCmd && draftCmd.type === 'pick' && AMBIG && Date.now() - AMBIG.at < 15 * 60e3 && AMBIG.ids.includes(Number(draftCmd.ref))) { draftCmd = { ...AMBIG.cmd, ref: draftCmd.ref }; AMBIG = null }
    if (draftCmd && draftCmd.type === 'pick') { // רק מספר טיוטה: מציגים אותה ושואלים איזה נוסח
      const it = drafts.get(Number(draftCmd.ref))
      if (it) { offerDraft(Number(draftCmd.ref)); client.sendMessage(config.owner, toWhatsApp(`#${draftCmd.ref} זו ${it.name}. איזה נוסח? ${it.alt ? '*1*, *2*' + (it.alt2 ? ' או *3*' : '') : '*כן* שולח'} · *לא* מבטל`)).catch(() => {}); return }
      draftCmd = null
    }
    // "כן"/"1"/"2" בלי שם ובלי ציטוט — רק אם הדבר האחרון שהעוזרת הציעה היא טיוטה שעדיין ממתינה; אחרת זו שיחה רגילה
    const bare = draftCmd && !draftCmd.ref && !msg.hasQuotedMsg
    const bareOk = bare && lastOfferedDraftId && drafts.get(lastOfferedDraftId)
    let bareId = lastOfferedDraftId
    if (bareOk && prevOfferedDraftId && prevOfferedDraftId !== bareId && drafts.get(prevOfferedDraftId)) {
      const wroteAt = (msg.timestamp || 0) * 1000
      if (wroteAt && wroteAt + 1000 <= lastOfferedAt) bareId = prevOfferedDraftId // נכתב לפני שההתראה החדשה הגיעה
      else if (Date.now() - lastOfferedAt < 20000) { // התראה חדשה ממש עכשיו — לא לנחש למי
        client.sendMessage(config.owner, toWhatsApp(`בדיוק נכנסה עוד הודעה, אז לא שלחתי כלום. לאיזה מהם? "כן ${prevOfferedDraftId}" או "כן ${lastOfferedDraftId}".`)).catch(console.error)
        return
      }
    }
    if (draftCmd && (!bare || bareOk) && (!draftCmd.ref || /^\d+$/.test(draftCmd.ref) || drafts.resolveRef(draftCmd.ref))) {
      if (bareOk) draftCmd.ref = String(bareId)
      queue = queue.then(() => handleDraftCommand(msg, draftCmd)).catch((e) => console.error('[draft]', e))
      return
    }
    // תשובה על הודעת אישור: הוראה ("תגיד לו ש...", "תקצר", "בלי ה...") = לנסח מחדש; טקסט רגיל = לשלוח אותו במקום הטיוטה
    if (msg.hasQuotedMsg) {
      queue = queue.then(async () => {
        const quoted = await msg.getQuotedMessage().catch(() => null)
        const mq = quoted && config.owner && cid === config.owner && mealRelay.qidFor(quoted.id?._serialized) // 18.11.26: תיקון לארוחה מצולמת
        if (mq) return mealRelay.fix(mq, text).catch((e) => { console.error('[meal-fix]', e); return client.sendMessage(config.owner, toWhatsApp('התיקון לארוחה לא עבר: ' + String(e.message || e).slice(0, 120))).catch(() => {}) })
        const qid = quoted && drafts.findByAlert(quoted.id?._serialized)
        if (qid && draftCmd) { // פקודה עם תוספת שלא זוהתה — לא טקסט ללקוח
          if (draftCmd.type === 'cancel') return handleDraftCommand(msg, { type: 'cancel', ref: String(qid) })
          if (draftCmd.type === 'edit') return handleDraftCommand(msg, { ...draftCmd, ref: String(qid) }) // "ערוך 2" בציטוט על ההתראה
          if (draftCmd.type === 'send' && draftCmd.ref && !/^\d+$/.test(draftCmd.ref)) return reviseDraft(qid, text)
          return client.sendMessage(config.owner, toWhatsApp('לא בטוח למה התכוונת, אז לא שלחתי כלום. "כן ' + qid + '" לשליחה, "לא ' + qid + '" לביטול, או תכתוב מה לשנות.')).catch(console.error)
        }
        if (qid && EDIT_MSGS.has(quoted.id?._serialized)) return handleDraftCommand(msg, { type: 'send', ref: String(qid), force: false, override: text.replace(/\u200b/g, '') })
        if (qid && INSTRUCTION_RE.test(text)) return reviseDraft(qid, text)
        if (qid) return handleDraftCommand(msg, { type: 'send', ref: String(qid), force: false, override: text })
        return handle(msg, text)
      }).catch((e) => console.error('[draft]', e))
      return
    }

    if (/^(שיחה חדשה|אפס שיחה)$/.test(text)) {
      resetSession()
      client.sendMessage(cid, toWhatsApp('פתחתי שיחה חדשה. במה אפשר לעזור?')).catch(console.error)
      return
    }

    // אישור/תיקון ריל אישי — own_reels.py קורא את inbox.json ומבצע
    const reelCmd = text.match(/^מאשר ריל\s*#?(\d+)\s*$/) || text.match(/^תיקון ריל\s*#?(\d+)\s*[:\-]?\s*([\s\S]+)$/)
    if (reelCmd) {
      const inboxPath = path.join(os.homedir(), 'Desktop/reel/system/own_reels/inbox.json')
      let inbox = []
      try { inbox = JSON.parse(fs.readFileSync(inboxPath, 'utf8')) } catch {}
      inbox.push(reelCmd[2] ? { id: +reelCmd[1], action: 'edit', text: reelCmd[2].trim() } : { id: +reelCmd[1], action: 'approve' })
      fs.writeFileSync(inboxPath, JSON.stringify(inbox, null, 2))
      client.sendMessage(cid, toWhatsApp(reelCmd[2] ? `קיבלתי, מתקן את ריל #${reelCmd[1]} ושולח טיוטה חדשה תוך כמה דקות` : `קיבלתי, ריל #${reelCmd[1]} נכנס לתור תוך כמה דקות`)).catch(console.error)
      return
    }

    // פקודות דוח ישירות — לא ממתינות לשגרה המתוזמנת
    const onDemandReport = (emoji, prompt, label) => {
      queue = queue.then(async () => {
        try {
          const answer = await askBrain(prompt)
          const { text: finalText, notes } = await runActions(answer)
          await msg.reply(toWhatsApp([finalText, notes.join('\n')].filter(Boolean).join('\n\n')))
        } catch (e) {
          console.error(`[${label}]`, e)
          await msg.reply(toWhatsApp('לא הצלחתי להכין את הדוח. נסה שוב בעוד דקה.')).catch(() => {})
        }
      }).catch((e) => console.error('[queue]', e))
    }

    if (/^(סיכום שבועי|סיכום|מה היה השבוע)$/.test(text)) { onDemandReport('📊', WEEKLY_PROMPT, 'weekly'); return }
    if (/^(דוח חודשי|סיכום חודשי|כמה הרווחתי)$/.test(text)) { onDemandReport('💰', MONTHLY_PROMPT, 'monthly'); return }

    if (/^(בקשות מתכונים|מה מבקשים|רשימת בקשות מתכון)$/.test(text)) {
      const list = loadRequests()
      if (!list.length) {
        client.sendMessage(cid, toWhatsApp('אין כרגע בקשות מתכון שממתינות.')).catch(console.error)
      } else {
        const lines = ['🍽️ *בקשות מתכון ממתינות:*', '']
        list.forEach((r, i) => {
          const d = new Date(r.at).toLocaleDateString('he-IL')
          lines.push(`${i + 1}. ${r.text}${r.name ? ' — ' + r.name : ''} _(${d})_`)
        })
        lines.push('', 'אחרי שהוספת מתכון לספר, כתוב "מחק בקשה" ואת המספר שלה.')
        client.sendMessage(cid, toWhatsApp(lines.join('\n'))).catch(console.error)
      }
      return
    }

    const delReqMatch = text.match(/^מחק(?:תי)? בקשה (\d+)$/)
    if (delReqMatch) {
      const list = loadRequests()
      const idx = parseInt(delReqMatch[1], 10) - 1
      if (idx < 0 || idx >= list.length) {
        client.sendMessage(cid, toWhatsApp('לא מצאתי בקשה עם המספר הזה.')).catch(console.error)
      } else {
        const [removed] = list.splice(idx, 1)
        saveRequests(list)
        client.sendMessage(cid, toWhatsApp(`מחקתי את הבקשה "${removed.text}". נשארו ${list.length} בקשות.`)).catch(console.error)
      }
      return
    }

    if (/^(עזרה|מה את יודעת|פקודות|מה אפשר לכתוב)$/.test(text)) { // 22.11.26: מעודכן, בלי אימוג'י
      client.sendMessage(cid, toWhatsApp([
        '*מה אפשר לכתוב לי*', '',
        '*טיוטות למתאמנים* (מגיעות אחת אחת)',
        '1 / 2 / 3 — שולח את הנוסח · "2 שני" — נוסח 2 לשני',
        'ערוך 2 — הנוסח לבד, לעריכה ושליחה בציטוט',
        'לא / לא שני — לא שולחת · הבא — לדלג לבינתיים',
        'או להשיב בציטוט עם ניסוח משלך', '',
        '*מתאמנים*',
        'מה עם שני — כרטיס קצר',
        'שחף שילם 800 — תשלום בלוח',
        'אודליה חידשה 600x3 — חידוש בלוח',
        'מתאמן חדש: דני כהן 0501234567 600x3 חיטוב',
        'תוסיף לעידו 300 קלוריות בבוקר — שינוי בתפריט או בתוכנית, עם לפני/אחרי',
        'ליהב יעד 1400 קלוריות · עידו יעד 10000 צעדים',
        'חידושים — מי מסיים ב-30 יום ומה הצעד הבא', '',
        '*אישי*',
        'תזכיר לי X מחר ב-17:00 · שים לי ביומן אימון ביום שלישי ב-19:00',
        'מה הלוז שלי היום', '',
        'הכל עובד גם בהקלטה קולית. כל שינוי מחכה ל-1 שלך.',
      ].join('\n'))).catch(console.error)
      return
    }

    queue = queue.then(() => handle(msg, text)).catch((e) => console.error('[queue]', e))
  } catch (e) {
    console.error('[message]', e)
  }
}

client.on('message', onIncoming) // הודעות נכנסות (מהטלפון השני)
client.on('message_create', (msg) => {
  if (msg.fromMe) { OUT_SEEN.push({ to: msg.to, body: msg.body, msg, at: Date.now() }); while (OUT_SEEN.length > 50) OUT_SEEN.shift() }
  if (msg.fromMe) onIncoming(msg) // הודעות שאביאל שולח מהטלפון המקושר עצמו
})

// הוראת תיקון לטיוטה ("תגיד לו שמחר אני בודק") → נוסח חדש בסגנון של אביאל, שוב לאישור
const INSTRUCTION_RE = /^(תגיד|תגידי|תכתוב|תכתבי|תוסיף|תוסיפי|תשנה|תשני|תוריד|תורידי|תקצר|תקצרי|תעשה|תעשי|בלי |יותר |פחות |תנסח|תנסחי|תסביר|תסבירי|תשאל|תשאלי|תענה לו|תעני לו|תגיד לה|תכתוב לה)/

async function reviseDraft(id, instruction) {
  const it = drafts.get(id)
  if (!it) return client.sendMessage(config.owner, toWhatsApp('התשובה הזו כבר נשלחה או בוטלה.')).catch(() => {})
  const context = await profiles.draftContext({ jid: it.chat_jid, name: it.name, lastClientText: it.clientText })
  const out = await askBrainOnce(
    `אביאל ביקש לשנות טיוטת תשובה ל${it.name}.\nהטיוטה הנוכחית:\n"${it.text}"\nההוראה של אביאל: "${instruction}"\n` +
      `${drafts.DATA_FENCE}\n===\n${context}\n===\n${drafts.STYLE}\n` +
      'כתבי את ההודעה החדשה ללקוח לפי ההוראה, בסגנון של אביאל, 1–4 שורות. רק טקסט ההודעה, בלי הסברים ובלי מירכאות. בלי כלים.',
    config.draftModel || 'sonnet'
  )
  const text = drafts.stripEmoji(String(out).trim().replace(/^["“”]|["“”]$/g, ''))
  if (!text) return
  drafts.updateText(id, text)
  profiles.recordCorrection({ name: it.name, clientText: it.clientText || '', draft: it.text, final: text, how: 'instruction: ' + instruction.slice(0, 80) })
  const k = String(it.alias || it.name).split(/\s+/)[0]
  const sent = await client.sendMessage(config.owner, toWhatsApp([`*נוסח חדש ל${it.alias || it.name}:*`, text, '', drafts.approvalHint(id, k)].join('\n'))).catch(() => null)
  if (sent?.id?._serialized) drafts.setAlertMsgId(id, sent.id._serialized)
  offerDraft(id)
}

// 22.11.26: מספרים במילים בתחילת פקודה קולית ("אחת אודליה" → "1 אודליה"), נקודה בסוף מהתמלול יורדת
function spokenToCommand(t) {
  const W = { 'אחת': '1', 'אחד': '1', 'שתיים': '2', 'שניים': '2', 'שתים': '2', 'שלוש': '3', 'שלושה': '3' }
  let s = String(t || '').trim().replace(/[.!?,]+$/, '').replace(/\s+/g, ' ')
  s = s.replace(/^(כן |ערוך )?(אחת|אחד|שתיים|שניים|שתים|שלוש|שלושה)(?= |$)/, (m, pre, w) => (pre || '') + W[w])
  s = s.replace(/ (אחת|אחד|שתיים|שניים|שתים|שלוש|שלושה)$/, (m, w) => ' ' + W[w])
  return s
}
async function handleVoice(msg) {
  // הקלטה כתשובה להתראה = הוראת תיקון לטיוטה
  if (msg.hasQuotedMsg && voiceReady()) {
    const quoted = await msg.getQuotedMessage().catch(() => null)
    const qid = quoted && drafts.findByAlert(quoted.id?._serialized)
    if (qid) {
      try {
        const said = await transcribeVoice(msg)
        if (said) return reviseDraft(qid, said)
      } catch (e) { console.error('[voice-revise]', e.message) }
    }
  }
  if (!voiceReady()) {
    await msg.reply(toWhatsApp('אני עוד לא יכולה לשמוע הודעות קוליות. בינתיים כתוב לי.')).catch(() => {})
    return
  }
  try {
    const text = await transcribeVoice(msg)
    if (!text) throw new Error('empty transcription')
    const said = spokenToCommand(text)
    await msg.reply(toWhatsApp('_שמעתי:_ "' + said.slice(0, 300) + '"')).catch(() => {})
    // 22.11.26 (אביאל: "פקודות בקול"): ההקלטה עוברת באותו מסלול כמו הודעה כתובה — פקודות טיוטה, "הבא", "חידושים", פקודות מאמן
    const pm = Object.create(msg); Object.defineProperties(pm, { body: { value: said }, type: { value: 'chat' }, hasMedia: { value: false } })
    onIncoming(pm)
  } catch (e) {
    console.error('[voice]', e.message)
    await msg.reply(toWhatsApp('לא הצלחתי לשמוע את ההקלטה. נסה שוב, או כתוב לי.')).catch(() => {})
  }
}

// ── ניתוח תמונות (למשל תמונת התקדמות של לקוח) — נשמר זמנית, המוח קורא ומוחקים מיד ──
const PHOTOS_DIR = path.join(ROOT, 'photos')
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR)

async function handlePhoto(msg, caption) {
  let filePath = null
  try {
    const media = await msg.downloadMedia()
    if (!media?.data) throw new Error('no media')
    const ext = (media.mimetype || '').includes('png') ? 'png' : 'jpg'
    filePath = path.join(PHOTOS_DIR, `photo-${Date.now()}.${ext}`)
    fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'))
    const prompt =
      `נשלחה תמונה בנתיב: ${filePath}\n` +
      (caption ? `הערת אביאל: ${caption}\n` : '') +
      'תפעלי לפי "ניתוח תמונות" ב-CLAUDE.md.'
    const answer = await askBrain(prompt)
    const { text: finalText, notes } = await runActions(answer)
    await msg.reply(toWhatsApp([finalText, notes.join('\n')].filter(Boolean).join('\n\n')))
  } catch (e) {
    console.error('[photo]', e)
    await msg.reply(toWhatsApp('לא הצלחתי לנתח את התמונה. נסה לשלוח אותה שוב.')).catch(() => {})
  } finally {
    if (filePath) fs.rmSync(filePath, { force: true })
  }
}

// מונים לדוח שישי: כמה אושרו כמו שהן, כמה שונו, כמה ענה בעצמו, כמה בוטלו
const STATS_PATH = path.join(ROOT, 'draft-stats.json')
function bump(key) {
  let st = {}
  try { st = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')) } catch {}
  st[key] = (st[key] || 0) + 1
  fs.writeFileSync(STATS_PATH, JSON.stringify(st))
}

async function handleDraftCommand(msg, cmd) {
  const say = (t) => client.sendMessage(config.owner, toWhatsApp(t)).catch(console.error)
  let id = drafts.resolveRef(cmd.ref, [dqLoad().cur, lastOfferedDraftId, prevOfferedDraftId])
  if (id && id.ambiguous) { AMBIG = { cmd, ids: id.ids, at: Date.now() }; return say(`יש כמה ל${cmd.ref}: ${id.ambiguous.join(', ')}. תכתוב רק את המספר והנוסח ${cmd.option || 1} יישלח.`) }
  if (cmd.nameCheck && drafts.get(id) && !String(drafts.get(id).name || '').includes(cmd.nameCheck) && !String(drafts.get(id).alias || '').includes(cmd.nameCheck)) return say(`#${id} שייכת ל${drafts.get(id).name}, לא ל${cmd.nameCheck}. לא שלחתי.`)
  if (!id && msg.hasQuotedMsg) {
    const quoted = await msg.getQuotedMessage().catch(() => null)
    if (quoted) id = drafts.findByAlert(quoted.id?._serialized)
    // ציטטת הודעה שלא שייכת לטיוטה (ליד, סבב, התראה אחרת): לא מנחשים "האחרונה" — שואלים
    if (!id) return say('לא זיהיתי לאיזו תשובה שייכת ההודעה שציטטת, אז לא שלחתי כלום. תכתוב "כן" עם המספר או השם, למשל "כן 12".')
  }
  if (!id) {
    // "כן" לבד: רק כשיש תשובה אחת שממתינה ונשלחה בחצי השעה האחרונה — אחרת לבקש להשיב על ההודעה
    // "כן" לבד = ההודעה האחרונה שקיבלת (עד שעתיים אחורה)
    id = drafts.latestId()
    if (!id) return say(drafts.pendingIds().length ? 'התשובות שממתינות ישנות. תכתוב "כן" עם השם, למשל "כן שון".' : 'אין תשובה שממתינה לאישור.')
  }
  const it = drafts.get(id)
  if (!it) return say(cmd.ref ? `לא מצאתי תשובה ממתינה ל"${cmd.ref}".` : 'התשובה הזו כבר נשלחה או בוטלה.')

  if (cmd.type === 'cancel') {
    drafts.remove(id); bump('cancelled')
    return say(`בוטל. לא שלחתי כלום ל${it.name}.`)
  }
  if (cmd.type === 'edit') { // 22.11.26: הנוסח לבד, בלי סימון בוט, כדי להעתיק/לערוך ולהשיב בציטוט
    const opt = cmd.option || 1, body = drafts.stripEmoji([it.text, it.alt, it.alt2][opt - 1] || it.text)
    const dest = (msg && msg._routeGid) || routes.gidFor('coach') || config.owner
    const plain = await client.sendMessage(dest, body).catch(() => null)
    if (plain?.id?._serialized) { drafts.setAlertMsgId(id, plain.id._serialized); EDIT_MSGS.add(plain.id._serialized) }
    offerDraft(id)
    return say(`למעלה נוסח ${opt} ל${it.name} לבד. לחיצה ארוכה ← העתקה, משנים, ושולחים כתשובה (ציטוט) על ההודעה הזו — יישלח ל${it.alias || String(it.name).split(' ')[0]} בדיוק כמו שכתבת.`)
  }
  if (cmd.type === 'script') {
    // הודעה קולית אמיתית ממנו ממירה יותר מכל טקסט — נותנים לו תסריט לדיבור, לא לקריאה
    const context = await profiles.draftContext({ jid: it.chat_jid, name: it.name, lastClientText: it.clientText })
    const heb = await profiles.hebrewFirstName(it.name)
    const script = await askBrainOnce(
      `אביאל רוצה להקליט הודעה קולית ל${it.name}${heb ? ` (לפנות אליו בשם "${heb}")` : ''} במקום לשלוח את הטקסט הזה:\n"${it.text}"\n` +
        `${drafts.DATA_FENCE}\n===\n${context}\n===\n` +
        'כתבי תסריט דיבור של 15–25 שניות (40–70 מילים) בעברית מדוברת, כמו שאביאל מדבר: חם, אישי, בגובה העיניים, בלי להקריא רשימה. ' +
        'להתחיל בשם, להתייחס לדבר האחד שהוא כתב, לסיים בשאלה אחת או בבקשה אחת. בלי אימוג\'י, בלי כותרות, רק התסריט עצמו ואחריו שורה אחת: "טיפ: ..." עם עצה אחת להקלטה (טון/אורך). בלי כלים.',
      config.draftModel || 'sonnet'
    )
    return say(`*תסריט להקלטה ל${it.name}*\n\n${script.trim()}\n\nאחרי שהקלטת ושלחת בעצמך, תכתוב "לא ${id}" כדי שלא אשלח גם טקסט.`)
  }
  if (!(await biz.bridgeAlive())) return say('הווטסאפ העסקי לא מחובר כרגע (החלון השחור סגור), אז לא שלחתי. תפעיל אותו ותכתוב שוב "כן ' + id + '".')
  const last = await biz.lastMessage(it.chat_jid).catch(() => null)
  if (!cmd.force && last?.is_from_me && Date.parse(String(last.timestamp).replace(' ', 'T')) > Date.parse(it.at)) {
    return say(`כבר ענית ל${it.name} בעצמך, אז לא שלחתי. אם בכל זאת: "כן ${id}!"`)
  }
  const text = drafts.stripEmoji(cmd.override || (cmd.option === 3 && it.alt2 ? it.alt2 : cmd.option === 2 && it.alt ? it.alt : it.text))
  try {
    await drafts.sendToClient(it, text)
    drafts.remove(id)
    try { advisor.onDraftSent(it, Number(id)) } catch (e) { console.error('[advisor-sent]', e.message) }
    { const all = [it.text, it.alt, it.alt2].map((x) => drafts.stripEmoji(x || '')).filter(Boolean) // רק כשהייתה בחירה אמיתית (2 נוסחים ומעלה)
      if (all.length >= 2) profiles.recordChoice({ name: it.name, option: all.includes(text) ? all.indexOf(text) + 1 : 'own', had: all.length, chosen: text, rejected: all.filter((x) => x !== text), reply: !!it.clientText }) }
    if (cmd.override && text !== it.text) { profiles.recordCorrection({ name: it.name, clientText: it.clientText || '', draft: it.text, final: text, how: 'override' }); bump('overridden') } else bump('sentAsIs')
    console.log('[draft] sent #' + id, 'to', it.name)
    if (cmd._acc) cmd._acc.push(it.name); else say(`נשלח ל${it.name}.`)
  } catch (e) {
    console.error('[draft] send failed', e.message)
    say(`השליחה ל${it.name} נכשלה. התשובה נשמרה, אפשר לנסות שוב עם "כן ${id}".`)
  }
}

async function sendStateBlock() {
  const pend = drafts.pendingIds().map((i) => drafts.get(i)).filter(Boolean).slice(-6)
  const sent = drafts.recentSent(6)
  const prefs = prefsText()
  if (!pend.length && !sent.length && !prefs) return ''
  if (!pend.length && !sent.length) return `\n\n[כללים קבועים שאביאל ביקש — חובה]\n${prefs}`
  const f = (x) => String(x || '').replace(/\s+/g, ' ').slice(0, 120)
  return '\n\n[מצב שליחות בווטסאפ העסקי — מידע פנימי לך, לא לצטט כמו שהוא]\n' +
    (pend.length ? 'ממתינות לאישור של אביאל: ' + pend.map((it) => `${it.name}: "${f(it.text)}"`).join(' | ') + '\n' : '') +
    (sent.length ? 'נשלחו לאחרונה (אחרי "כן" של אביאל): ' + sent.map((x) => `${x.name} (${new Date(x.at).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })}): "${f(x.text)}"${x.revoked ? ' [נמחקה]' : ''}`).join(' | ') : '') +
    (prefs ? `\n[כללים קבועים שאביאל ביקש — חובה]\n${prefs}` : '')
}

async function handle(msg, text) {
  let typing = null
  let chat = null
  try {
    chat = await msg.getChat().catch(() => null) // "מקליד..." זה קוסמטי — לא לחסום את הטיפול בהודעה אם זה נכשל
    if (chat) {
      await chat.sendStateTyping().catch(() => {})
      typing = setInterval(() => chat.sendStateTyping().catch(() => {}), 8000)
    }
    // "תחשבי לעומק" — מעבר חד-פעמי למודל החזק
    const deep = /תחשבי לעומק|תחשוב לעומק/.test(text)
    const answer = await askBrain(text + (await sendStateBlock()), deep ? 'sonnet' : undefined)
    const { text: finalText, notes, offered } = await runActions(answer)
    if (offered) offerDraft(offered); else { lastOfferedDraftId = null; prevOfferedDraftId = null } // תשובה רגילה בצ'אט מבטלת "כן" על התראה ישנה
    const reply = [finalText, notes.join('\n')].filter(Boolean).join('\n\n')
    await msg.reply(toWhatsApp(reply || 'לא הצלחתי לנסח תשובה, נסה שוב 🙏'))
  } catch (e) {
    console.error('[brain]', e)
    if (isLimitError(e)) {
      const when = (e.message.match(/resets? ([^(·]+)/i) || [])[1]?.trim()
      await msg
        .reply(
          toWhatsApp(
            '⏳ סיימתי את מכסת החשיבה של המנוי להיום.' +
              (when ? `\nחוזרת לעבוד ב-${when} ` : '\nחוזרת לעבוד כשהמכסה תתאפס ') +
              '— שלח לי שוב אז 🤍'
          )
        )
        .catch(() => {})
    } else {
      await msg.reply(toWhatsApp('משהו נתקע אצלי. שלח את ההודעה שוב בעוד דקה.')).catch(() => {})
    }
  } finally {
    if (typing) clearInterval(typing)
    if (chat) chat.clearState().catch(() => {})
  }
}

// שגרות קבועות (שעון ישראל)
const ROUTINES = {}
const ROUTINE_RUNNING = new Set()
function scheduleRoutine(cronExp, promptOrFn, label, freshSession) {
  const run = async () => {
    if (!config.owner || !clientReady || ROUTINE_RUNNING.has(label)) return false
    ROUTINE_RUNNING.add(label)
    try {
      if (freshSession) resetSession() // שיחה נקייה = פחות טוקנים
      const prompt = typeof promptOrFn === 'function' ? await promptOrFn() : promptOrFn
      const answer = await askBrain(prompt)
      const { text, notes } = await runActions(answer)
      await client.sendMessage(config.owner, toWhatsApp([text, notes.join('\n')].filter(Boolean).join('\n\n')))
      console.log(`[${label}] sent`)
      markRan(label)
      return true
    } catch (e) {
      console.error(`[${label}]`, e)
      return false
    } finally { ROUTINE_RUNNING.delete(label) }
  }
  ROUTINES[label] = run
  cron.schedule(cronExp, run, { timezone: 'Asia/Jerusalem' })
}

// ── השלמת משימות שפוספסו: המק נרדם בלילה (sleep 1 דקה כשהאפליקציה של קלוד לא פעילה) → node-cron מדלג.
// כל משימה יומית נרשמת כשרצה; כל 5 דקות בודקים מה היה צריך לרוץ היום ועוד לא רץ, ומריצים אם עדיין רלוונטי.
const RUNS_PATH = path.join(ROOT, 'job-runs.json')
const ilNow = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date()).map((x) => [x.type, x.value])); return { day: `${p.year}-${p.month}-${p.day}`, mins: (Number(p.hour) % 24) * 60 + Number(p.minute), dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) } }
function markRan(key) { markRanKey(key, ilNow().day) }
function markRanKey(key, val) { let r = {}; try { r = JSON.parse(fs.readFileSync(RUNS_PATH, 'utf8')) } catch {} r[key] = val; const tmp = RUNS_PATH + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(r)); fs.renameSync(tmp, RUNS_PATH) }
function ranToday(key) { try { return JSON.parse(fs.readFileSync(RUNS_PATH, 'utf8'))[key] === ilNow().day } catch { return false } }

// מוסיפים לפרומפט את אירועי היומן האישי (iCloud) בפועל — לא רק את הבוקינג
async function withCalendarContext(basePrompt, dayOffset, dayLabel) {
  let cal = ''
  try { cal = await getCalendarEvents(dayOffset) } catch (e) { console.error('[cal-read]', e.message) }
  return basePrompt + (cal ? `\n\nאירועים ביומן האישי (iCloud) של אביאל ל${dayLabel}:\n${cal}` : `\n\nאין אירועים ביומן האישי ל${dayLabel}.`) + (await promisesBlock())
}

scheduleRoutine(config.digestCron, () => withCalendarContext(DIGEST_PROMPT, 0, 'היום'), 'digest', true) // בוקר
scheduleRoutine(config.eveningCron, () => withCalendarContext(EVENING_PROMPT, 1, 'מחר'), 'evening', false) // ערב
scheduleRoutine(config.weeklyCron, WEEKLY_PROMPT, 'weekly', false) // ראשון בבוקר
// ראשון בבוקר: מה עבד אצל המתחרים + 3 תסריטים מלאים (weekly-scripts.js, על ה-API)
async function weeklyScripts() {
  if (!config.owner || !clientReady || ROUTINE_RUNNING.has('reels')) return false
  ROUTINE_RUNNING.add('reels')
  try {
    const { parts } = await buildWeeklyScripts(askBrainOnce)
    if (!parts.length) throw new Error('empty')
    for (const p of parts) await client.sendMessage(config.owner, toWhatsApp(p))
    console.log('[reels] sent', parts.length)
    markRan('reels')
    return true
  } catch (e) {
    console.error('[reels]', e.message)
    return false
  } finally { ROUTINE_RUNNING.delete('reels') }
}
ROUTINES.reels = weeklyScripts
cron.schedule(config.reelsCron, weeklyScripts, { timezone: 'Asia/Jerusalem' })
scheduleRoutine(config.monthlyCron, MONTHLY_PROMPT, 'monthly', false) // 1 לחודש בבוקר

try { advisor.install({ client, config, toWhatsApp, drafts, biz, profiles, askBrainOnce, isReady: () => clientReady, offerDraft: (id) => offerDraft(id), updGid, queueDraft: (id, t, to) => draftQueuePush(id, t, to) }) } catch (e) { console.error('[advisor-install]', e.message) }
// 11.11.26 פרוטוקול הקיץ: פרק פתיחה מיד + שיעור כל בוקר לקונים. הגדרות ב-protocol-config.json (dryRun=true עד שאביאל מפעיל)
const protocol = require('./protocol')
const stocks = require('./stocks')
try { protocol.install({ sendOwner: (t) => client.sendMessage(config.owner, toWhatsApp(t)), askBrainOnce, readBoard: () => advisor.readBoard(), isReady: () => !!(config.owner && clientReady), previewToOwner: true }) } catch (e) { console.error('[protocol-install]', e.message) }

// השלמה: [מפתח, מתי (דקות מחצות), עד מתי רלוונטי, ימים (0=ראשון), פונקציה]
const CATCHUP = [
  ['learn', 3 * 60 + 30, 22 * 60, null, () => nightlyLearning()],
  ['digest', 9 * 60, 13 * 60, null, () => ROUTINES.digest && ROUTINES.digest()],
  ['board', 9 * 60 + 50, 20 * 60, null, () => syncBoardAlerts()],
  ['churn', 10 * 60 + 30, 19 * 60, [0, 1, 2, 3, 4, 5], () => checkChurn()],
  ['checkin', 10 * 60, 15 * 60, [0], () => weeklyCheckin()],
  ['wkfollow', 11 * 60, 18 * 60, [2], () => weeklyFollowup()],
  ['renewboard', 10 * 60, 18 * 60, [1], () => renewalBoard(false)],
  ['reels', 10 * 60, 18 * 60, [0], () => weeklyScripts()],
  ['friday', 12 * 60 + 30, 17 * 60, [5], () => fridayReport()],
  ['weekrep', 8 * 60 + 5, 14 * 60, [0], () => weekClientsReport()],
  ['foodrev', 11 * 60 + 30, 21 * 60 + 30, null, () => foodReviewDaily()],
  ['mornagent', 9 * 60 + 30, 13 * 60, [0, 1, 2, 3, 4, 5], () => morningAgentDaily()],
  ['appideas', 10 * 60, 21 * 60, [0], () => weeklyAppIdeas()],
  ['todo', 7 * 60 + 40, 12 * 60, [0, 1, 2, 3, 4, 5], () => todoMorning()],
]
let catchupBusy = false
async function catchUp() {
  if (!config.owner || !clientReady || catchupBusy) return
  catchupBusy = true
  try {
    const t = ilNow()
    for (const [key, at, until, days, fn] of CATCHUP) {
      if (days && !days.includes(t.dow)) continue
      if (t.mins < at + 5 || t.mins > until || ranToday(key) || ROUTINE_RUNNING.has(key)) continue // +5: לתת ל-cron הרגיל לרוץ קודם; רצה עכשיו — לא להריץ שוב
      console.log('[catchup] running missed:', key)
      try { await fn() } catch (e) { console.error('[catchup]', key, e.message) }
      if (!ranToday(key)) markRan(key) // גם אם דילגה (למשל אין מה לשלוח) — לא לנסות שוב כל 5 דקות
    }
    // סבב שגרתיים שפוספס: אם יש טיוטות ממתינות לסבב ועבר זמן סבב — לשלוח עכשיו
    const hours = config.batchHours || [12, 16, 20]
    const slot = [...hours].reverse().find((h) => t.mins >= h * 60 + 10 && t.mins <= h * 60 + 180)
    if (t.dow !== 6 && slot && !ranToday('batch' + slot)) { markRan('batch' + slot); if (drafts.batchedIds().length) await flushBatch() }
  } finally { catchupBusy = false }
}
setInterval(catchUp, 5 * 60 * 1000)
client.on('ready', () => setTimeout(catchUp, 90 * 1000))
// 22.11.26 (אביאל: "תשלח הכל שאוכל להגיב אחד אחד"): requeue-all.json → כל הטיוטות הפתוחות מוצגות מחדש אחת אחת, קודם מי שכתב
client.on('ready', () => setTimeout(() => { const f = path.join(ROOT, 'requeue-all.json'); if (!fs.existsSync(f)) return; fs.rmSync(f, { force: true })
  const ids = drafts.pendingIds().sort((a, b) => a - b), q = dqLoad(); q.items = q.items.filter((x) => !ids.includes(x.id)); q.cur = null; dqSave(q)
  const L = ids.map((i) => [i, drafts.get(i)]).filter(([, it]) => it)
  for (const [i, it] of L.filter(([, x]) => x.clientText).concat(L.filter(([, x]) => !x.clientText))) {
    const n = it.alias || String(it.name).split(' ')[0], said = it.clientText ? it.clientText.split('\n').map((l) => '> ' + l).join('\n') + '\n\n' : ''
    const body = it.alt ? `*1.*\n${it.text}\n\n*2.*\n${it.alt}` + (it.alt2 ? `\n\n*3.*\n${it.alt2}` : '') : it.text
    draftQueuePush(i, `*${it.name}*${it.clientText ? ' כתב/ה:' : ''} (#${i})\n${said}${body}\n\n${drafts.approvalHint(i, n, !!it.alt, !!it.alt2)}`)
  }
  console.log('[dq] requeued', L.length) }, 120 * 1000))
// השלמה חד-פעמית (22.11.26): weekly-redo.json עם {names} → סיכום שבוע רק להם, ואז הקובץ נמחק
client.on('ready', () => setTimeout(() => { const f = path.join(ROOT, 'weekly-redo.json'); let j = null; try { j = JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return } fs.rmSync(f, { force: true }); if (j && j.names && j.names.length) weeklyCheckin({ only: j.names }).catch((e) => console.error('[redo]', e.message)) }, 150 * 1000))
client.on('ready', () => setTimeout(async () => { if (!config.owner) return; try { const made = await routes.ensure(client, config.owner); console.log('[routes] ensure', JSON.stringify(made), JSON.stringify(routes.load()))
  for (const c of made) await client.sendMessage(routes.gidFor(c), BOT_MARK + routes.INTRO[c]).catch(() => {}) } catch (e) { console.error('[routes] ensure', e.message) } }, 20 * 1000))

// ── בדיקה עצמית של הווטסאפ העסקי: כל 10 דק' מתריעה מיד אם התנתק (ופותחת דף QR במק); כל בוקר 8:30 — רק אם משהו לא תקין ──
const BRIDGE_LOG = path.join(require('os').homedir(), 'whatsapp-mcp', 'bridge.log')
let bizDownAlerted = false
function bridgeNeedsQr() {
  try {
    const tail = fs.readFileSync(BRIDGE_LOG, 'utf8').slice(-20000)
    return tail.lastIndexOf('Scan this QR code') > tail.lastIndexOf('Connected to WhatsApp')
  } catch { return false }
}
async function bizHealth() {
  const problems = []
  const alive = await biz.bridgeAlive()
  if (!alive) problems.push('הגשר של הווטסאפ העסקי לא רץ')
  if (alive && bridgeNeedsQr()) problems.push('הווטסאפ העסקי התנתק ומחכה לסריקת QR')
  if (alive && !bridgeNeedsQr()) {
    const ok = await fetch('http://127.0.0.1:8080/api/send', { method: 'POST', body: '{}', signal: AbortSignal.timeout(5000) }).then((r) => r.status === 400).catch(() => false)
    if (!ok) problems.push('הווטסאפ העסקי לא עונה לבקשות שליחה')
  }
  if (!fs.existsSync(path.join(ROOT, 'models', 'ggml-small.bin'))) problems.push('קובץ התמלול חסר — הודעות קוליות של מתאמנים לא יתומללו')
  return problems
}
async function bizWatch() {
  if (!config.owner || !clientReady) return
  const p = await bizHealth().catch(() => [])
  const qr = p.some((x) => /QR/.test(x))
  if (p.length && !bizDownAlerted) {
    bizDownAlerted = true
    if (qr) try { require('child_process').execFile('/bin/sh', ['-c', 'pgrep -f qr-live.py >/dev/null || (cd ~/whatsapp-mcp && nohup python3 qr-live.py >/dev/null 2>&1 &); sleep 3; open ~/whatsapp-mcp/qr-live.html']) } catch {}
    await client.sendMessage(config.owner, toWhatsApp(['*תקלה בווטסאפ העסקי*', ...p.map((x) => '- ' + x), '', qr ? 'פתחתי במחשב דף עם קוד. סורקים מ-WhatsApp Business: הגדרות ← מכשירים מקושרים ← קישור מכשיר (בלי למחוק מכשירים אחרים).' : 'עד שזה מסתדר אני לא רואה הודעות חדשות מלקוחות.'].join('\n'))).catch(() => {})
  } else if (!p.length && bizDownAlerted) {
    bizDownAlerted = false
    await client.sendMessage(config.owner, toWhatsApp('הווטסאפ העסקי חזר לעבוד.')).catch(() => {})
  }
}
setInterval(bizWatch, 10 * 60 * 1000)
client.on('ready', () => setTimeout(bizWatch, 3 * 60 * 1000))

process.on('unhandledRejection', (e) => console.error('[unhandled]', e))
// סגירה עדינה — כדי שהפעלה מחדש לא תנתק את המכשיר המקושר בווטסאפ
process.on('SIGTERM', async () => { setTimeout(() => process.exit(0), 8000).unref(); try { await client.destroy() } catch {} process.exit(0) })

setStatus('starting')
// נעילות דפדפן שנשארו מהפעלה קודמת — מוחקים רק אם אין כרום חי על הפרופיל הזה (אחרת "browser is already running" ולולאת הפעלות)
// התהליך הזה עוד לא פתח דפדפן, אז כל כרום על הפרופיל הזה הוא יתום מהפעלה קודמת — סוגרים אותו ומוחקים נעילות
try { require('child_process').execFileSync('pkill', ['-9', '-f', 'Chrome for Testing.*wwebjs_auth'], { stdio: 'ignore' }) } catch {}
for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) fs.rmSync(path.join(ROOT, '.wwebjs_auth', 'session', f), { force: true })
client.initialize()
