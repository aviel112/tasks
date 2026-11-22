// קריאה מהווטסאפ העסקי של אביאל — מה-SQLite שהגשר של whatsapp-mcp ממלא (~/whatsapp-mcp).
// קריאה בלבד: הקובץ הזה לא שולח כלום לאף אחד חוץ מאביאל עצמו.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const DB_PATH = path.join(os.homedir(), 'whatsapp-mcp', 'whatsapp-bridge', 'store', 'messages.db')
const STORE_DB_PATH = path.join(os.homedir(), 'whatsapp-mcp', 'whatsapp-bridge', 'store', 'whatsapp.db')
const SEEN_PATH = path.join(__dirname, 'biz-seen.json')

// הצ'אטים נשמרים לפי LID (מספר פנימי של ווטסאפ) — השם והטלפון האמיתיים יושבים ב-whatsapp.db של הגשר
const nameExpr = (col) => `coalesce(
  (SELECT coalesce(ct.full_name, ct.push_name, ct.first_name) FROM w.whatsmeow_lid_map l
     JOIN w.whatsmeow_contacts ct ON ct.their_jid = l.pn || '@s.whatsapp.net'
    WHERE l.lid = replace(${col}, '@lid', '') LIMIT 1),
  (SELECT coalesce(full_name, push_name, first_name) FROM w.whatsmeow_contacts WHERE their_jid = ${col} LIMIT 1))`
const phoneExpr = (col) => `coalesce((SELECT pn FROM w.whatsmeow_lid_map WHERE lid = replace(${col}, '@lid', '') LIMIT 1),
  CASE WHEN ${col} LIKE '%@s.whatsapp.net' THEN replace(${col}, '@s.whatsapp.net', '') END)`

// מילים שמסמנות ליד חם — שאלה על מחיר, התחלה, ליווי
const HOT_RE = /כמה (זה )?עולה|מחיר|עלות|ליווי|מאמן|אימון אישי|להתחיל|להצטרף|פרטים|מעוניי|רוצה להתאמן|תוכנית|אתגר|פגישת היכרות|איך מתחילים|price|how much/i

// צ'אטים פרטיים בלבד — בלי קבוצות, סטטוסים וערוצים
const PRIVATE_CHAT_SQL = "chat_jid NOT LIKE '%@g.us' AND chat_jid NOT LIKE '%@broadcast' AND chat_jid NOT LIKE '%@newsletter'"

function sql(query, params = []) {
  // sqlite3 CLI עם פרמטרים דרך .parameter — בלי לשרשר קלט חיצוני לתוך השאילתה
  const attach = fs.existsSync(STORE_DB_PATH) ? `ATTACH '${STORE_DB_PATH.replace(/'/g, "''")}' AS w;` : ''
  // הגשר כותב ל-DB כל הזמן — לחכות עד 5 שניות לנעילה במקום להיכשל
  const setup = '.timeout 5000\n' + attach + '\n' + params.map((v, i) => `.parameter set ?${i + 1} '${String(v).replace(/'/g, "''")}'`).join('\n')
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(DB_PATH)) return resolve([])
    const child = execFile('sqlite3', ['-json', '-readonly', DB_PATH], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }, (err, out) => {
      if (err) return reject(err)
      try { resolve(out.trim() ? JSON.parse(out) : []) } catch (e) { reject(e) }
    })
    child.stdin.end(`${setup}\n${query};\n`)
  })
}

// האם הגשר חי ומעדכן? (ההודעה האחרונה ב-DB לא מעידה — אולי פשוט שקט)
function bridgeAlive() {
  return new Promise((resolve) => {
    execFile('pgrep', ['-f', 'whatsapp-bridge'], (err) => resolve(!err))
  })
}

// הודעות מדיה (קולי/תמונה) הן הודעות לכל דבר — 281 מהתשובות של אביאל הן הודעות קוליות
const REAL = "(content != '' OR coalesce(media_type,'') != '')"
const TEXT_EXPR = `CASE WHEN content != '' THEN content WHEN media_type = 'audio' THEN '[הודעה קולית]' WHEN media_type = 'image' THEN '[תמונה]'
  WHEN media_type = 'video' THEN '[סרטון]' WHEN media_type = 'document' THEN '[קובץ]' ELSE '[מדיה]' END`
// הצ'אטים של אביאל עם עצמו (המספר השני) — לא לקוחות
const SELF_RE = /אביאל עמירה/

// שמות ידועים מהלוח/CRM לטלפונים שלא שמורים באנשי הקשר (brain/known-names.json: טלפון → שם)
const KNOWN_PATH = path.join(__dirname, 'brain', 'known-names.json')
let knownCache = { at: 0, map: {} }
function knownName(phone) {
  if (Date.now() - knownCache.at > 60000) {
    try { knownCache = { at: Date.now(), map: JSON.parse(fs.readFileSync(KNOWN_PATH, 'utf8')) } } catch { knownCache = { at: Date.now(), map: {} } }
  }
  return phone ? knownCache.map[String(phone).replace(/\D/g, '')] || '' : ''
}
const nameOf = (row) => row.display || knownName(row.phone) || (row.phone ? '+' + row.phone : 'איש קשר')
// תמלול הודעה קולית אם קיים (transcripts.js) — נטען בעצלות כדי לא ליצור תלות מעגלית
const withTranscript = (row) => {
  if (row.media_type === 'audio' && row.id) {
    try { const tr = require('./transcripts').transcriptOf(row.id); if (tr) row.content = '[קולי] ' + tr } catch {}
  }
  return row
}
const isSelf = (row) => SELF_RE.test(String(row.display || ''))

async function recentMessages(chatJid, limit = 8) {
  const rows = await sql(
    `SELECT id, media_type, ${TEXT_EXPR} AS content, is_from_me, timestamp FROM messages WHERE chat_jid = ?1 AND ${REAL} ORDER BY datetime(timestamp) DESC LIMIT ${Number(limit)}`,
    [chatJid]
  )
  return rows.reverse().map(withTranscript).map((m) => `${m.is_from_me ? 'אביאל' : 'הוא/היא'}: ${m.content}`).join('\n')
}

// הודעות נכנסות חדשות מאז הבדיקה הקודמת, מקובצות לפי צ'אט, רק אלה שנראות כמו ליד חם
async function newHotLeads() {
  let seen = null
  try { seen = JSON.parse(fs.readFileSync(SEEN_PATH, 'utf8')) } catch {}
  const [{ maxTs } = {}] = await sql(`SELECT max(timestamp) AS maxTs FROM messages`)
  if (!maxTs) return []
  fs.writeFileSync(SEEN_PATH, JSON.stringify({ lastTs: maxTs }))
  if (!seen?.lastTs) return [] // ריצה ראשונה — רק מסמנים, בלי הצפה

  const rows = await sql(
    `SELECT m.chat_jid, m.content, m.timestamp, ${nameExpr('m.chat_jid')} AS display, ${phoneExpr('m.chat_jid')} AS phone,
            (SELECT count(*) FROM messages p WHERE p.chat_jid = m.chat_jid AND datetime(p.timestamp) <= datetime(?1)) AS prior
       FROM messages m LEFT JOIN chats c ON c.jid = m.chat_jid
      WHERE m.is_from_me = 0 AND m.content != '' AND datetime(m.timestamp) > datetime(?1) AND ${PRIVATE_CHAT_SQL.replace(/chat_jid/g, 'm.chat_jid')}
      ORDER BY datetime(m.timestamp)`,
    [seen.lastTs]
  )
  const byChat = new Map()
  for (const r of rows) {
    const c = byChat.get(r.chat_jid) || { chat_jid: r.chat_jid, display: r.display, phone: r.phone, texts: [], prior: r.prior }
    c.texts.push(r.content)
    byChat.set(r.chat_jid, c)
  }
  // ליד חם = מישהו שכותב לעסק בפעם הראשונה, או שיחה צעירה (לא מתאמן ותיק) עם מילת מפתח
  return [...byChat.values()].filter((c) => c.prior === 0 || (c.prior < 12 && c.texts.some((t) => HOT_RE.test(t))))
}

// צ'אטים פרטיים שההודעה האחרונה בהם מהצד השני, ממתינים מעל minHours ועד maxDays
async function waitingForReply(minHours = 2, maxDays = 3) {
  return sql(
    `SELECT c.jid AS chat_jid, ${nameExpr('c.jid')} AS display, ${phoneExpr('c.jid')} AS phone, m.id, m.media_type, ${TEXT_EXPR.replace(/content/g, 'm.content').replace(/media_type/g, 'm.media_type')} AS content, m.timestamp,
            round((julianday('now') - julianday(datetime(m.timestamp))) * 24, 1) AS hours
       FROM chats c JOIN messages m ON m.chat_jid = c.jid
      WHERE m.rowid = (SELECT rowid FROM messages x WHERE x.chat_jid = c.jid AND ${REAL.replace(/content/g, 'x.content').replace(/media_type/g, 'x.media_type')} ORDER BY datetime(x.timestamp) DESC LIMIT 1)
        AND m.is_from_me = 0 AND ${PRIVATE_CHAT_SQL.replace(/chat_jid/g, 'c.jid')}
        AND (julianday('now') - julianday(datetime(m.timestamp))) * 24 >= ${Number(minHours)}
        AND (julianday('now') - julianday(datetime(m.timestamp))) <= ${Number(maxDays)}
      ORDER BY datetime(m.timestamp)`
  ).then((rows) => rows.filter((r) => !isSelf(r)).map(withTranscript))
}

// הודעות קוליות של הלקוח בצ'אט מהשעות האחרונות (לתמלול)
async function audioMessages(chatJid, hours = 3) {
  return sql(
    `SELECT id, chat_jid, timestamp FROM messages WHERE chat_jid = ?1 AND is_from_me = 0 AND media_type = 'audio'
        AND (julianday('now') - julianday(timestamp)) * 24 <= ${Number(hours)} ORDER BY datetime(timestamp) DESC LIMIT 10`,
    [chatJid]
  )
}

// ההודעה האחרונה בשיחה — כדי לא לשלוח טיוטה אם אביאל כבר ענה בעצמו
async function lastMessage(chatJid) {
  const [row] = await sql(
    `SELECT is_from_me, timestamp FROM messages WHERE chat_jid = ?1 AND ${REAL} ORDER BY datetime(timestamp) DESC LIMIT 1`,
    [chatJid]
  )
  return row || null
}

// מה אביאל כתב בעצמו בשיחה מאז רגע נתון (ללמידה מתשובות ידניות)
async function repliesSince(chatJid, sinceIso) {
  const rows = await sql(
    `SELECT ${TEXT_EXPR} AS content FROM messages WHERE chat_jid = ?1 AND is_from_me = 1 AND ${REAL} AND datetime(timestamp) > datetime(?2) ORDER BY datetime(timestamp) LIMIT 6`,
    [chatJid, String(sinceIso).replace('T', ' ').replace(/\.\d+Z$/, '+00:00')]
  )
  return rows.map((r) => r.content).join('\n')
}

// הצ'אט של מספר טלפון (LID או JID רגיל) — לבוטי היועץ, כדי לדעת אם ליד ענה
async function chatForPhone(phone) {
  const pn = String(phone || '').replace(/\D/g, '')
  if (!pn) return null
  const rows = await sql(
    `SELECT jid FROM chats WHERE jid = ?1 || '@s.whatsapp.net'
     UNION SELECT lid || '@lid' AS jid FROM w.whatsmeow_lid_map WHERE pn = ?1 LIMIT 2`,
    [pn]
  )
  return rows[0]?.jid || null
}

// הודעות נכנסות בצ'אט מאז רגע נתון (ISO) — לבוטי היועץ
async function inboundSince(chatJid, sinceIso) {
  return sql(
    `SELECT ${TEXT_EXPR} AS content, timestamp FROM messages WHERE chat_jid = ?1 AND is_from_me = 0 AND ${REAL} AND datetime(timestamp) > datetime(?2) ORDER BY datetime(timestamp) LIMIT 10`,
    [chatJid, String(sinceIso).replace('T', ' ').replace(/\.\d+Z$/, '+00:00')]
  )
}

// הצ'אט של אביאל עם המספר השני שלו — יעד לבדיקות
async function selfChat() {
  const rows = await sql(`SELECT jid AS chat_jid, ${nameExpr('jid')} AS display, ${phoneExpr('jid')} AS phone FROM chats WHERE ${PRIVATE_CHAT_SQL.replace(/chat_jid/g, 'jid')}`)
  const mine = rows.filter(isSelf)
  return mine.find((r) => /2/.test(r.display)) || mine[0] || null
}

// קצב ההודעות של כל מתאמן: כל כמה ימים הוא כותב בדרך כלל, וכמה ימים הוא שותק עכשיו (לזיהוי נטישה)
async function cadence(days = 60) {
  const rows = await sql(
    `WITH m AS (SELECT chat_jid, date(timestamp) d FROM messages WHERE is_from_me = 0 AND ${PRIVATE_CHAT_SQL}
                 AND julianday('now') - julianday(timestamp) <= ${Number(days)} GROUP BY chat_jid, d),
          g AS (SELECT chat_jid, julianday(d) - lag(julianday(d)) OVER (PARTITION BY chat_jid ORDER BY d) gap FROM m)
     SELECT g.chat_jid, ${nameExpr('g.chat_jid')} AS display, ${phoneExpr('g.chat_jid')} AS phone,
            count(*) AS active_days, round(avg(gap), 1) AS avg_gap,
            round(julianday('now') - (SELECT max(julianday(x.timestamp)) FROM messages x WHERE x.chat_jid = g.chat_jid AND x.is_from_me = 0), 1) AS silent_days,
            round(julianday('now') - (SELECT max(julianday(y.timestamp)) FROM messages y WHERE y.chat_jid = g.chat_jid AND y.is_from_me = 1), 1) AS mine_days
       FROM g WHERE gap IS NOT NULL GROUP BY g.chat_jid`
  )
  return rows.filter((r) => !isSelf(r))
}

// תמונות שהלקוח שלח לאחרונה (לשאלות "מותר?" עם תמונה)
async function recentImages(chatJid, minutes = 45) {
  return sql(
    `SELECT id, chat_jid, timestamp FROM messages WHERE chat_jid = ?1 AND is_from_me = 0 AND media_type = 'image'
        AND (julianday('now') - julianday(timestamp)) * 1440 <= ${Number(minutes)} ORDER BY datetime(timestamp) DESC LIMIT 3`,
    [chatJid]
  )
}

// הורדת מדיה דרך הגשר (localhost) — מחזיר נתיב קובץ או null
async function downloadMedia(messageId, chatJid) {
  try {
    const res = await fetch('http://127.0.0.1:8080/api/download', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId, chat_jid: chatJid }), signal: AbortSignal.timeout(30000),
    })
    const out = await res.json().catch(() => ({}))
    return out.success && out.path ? out.path : null
  } catch { return null }
}

async function messageCount(chatJid) {
  const [r] = await sql(`SELECT count(*) AS n FROM messages WHERE chat_jid = ?1 AND ${REAL}`, [chatJid])
  return r ? Number(r.n) : 0
}

// ההודעות שאביאל עצמו שלח למתאמנים בשעות האחרונות (למעקב הבטחות)
async function myRecentMessages(hours = 36) {
  return sql(
    `SELECT m.id, m.chat_jid, ${nameExpr('m.chat_jid')} AS display, ${phoneExpr('m.chat_jid')} AS phone, m.content, m.timestamp
       FROM messages m WHERE m.is_from_me = 1 AND m.content != '' AND m.content NOT LIKE char(8203) || '%' AND (julianday('now') - julianday(m.timestamp)) * 24 <= ${Number(hours)}
        AND ${PRIVATE_CHAT_SQL.replace(/chat_jid/g, 'm.chat_jid')} ORDER BY datetime(m.timestamp)`
  ).then((rows) => rows.filter((r) => !isSelf(r)))
}

async function phoneForChat(jid) {
  const [r] = await sql(`SELECT ${phoneExpr('?1')} AS phone`, [jid])
  return r?.phone || ''
}

// 22.11.26: מין המתאמן/ת לפי איך שאביאל עצמו כותב לו/לה (מלכה/את/תשלחי מול מלך/אחי/אתה/תשלח). '' = לא ברור
const B = (w) => new RegExp('(^|[^֐-׿])(' + w + ')(?=$|[^֐-׿])', 'g')
const FEM = B('מלכה|נסיכה|אהובה|גבירה|יפה שלי|מאמי שלי|את|תשלחי|תעשי|תכתבי|תגידי|תשקלי|תעדכני|תאכלי|תשתי|תלכי|תנסי|מוכנה|עשית|רוצה את|את רוצה')
const MASC = B('מלך|אחי|גבר|נסיך|אחשלי|אתה|תשלח|תעשה|תכתוב|תגיד|תשקל|תעדכן|תאכל|תשתה|תלך|תנסה|מוכן')
async function genderOf(chatJid) {
  if (!chatJid) return ''
  const rows = await sql(`SELECT content FROM messages WHERE chat_jid = ?1 AND is_from_me = 1 AND content != '' ORDER BY datetime(timestamp) DESC LIMIT 200`, [chatJid]).catch(() => [])
  let f = 0, m = 0
  for (const r of rows) { const t = String(r.content || ''); f += (t.match(FEM) || []).length; m += (t.match(MASC) || []).length }
  if (f + m < 3) return ''
  return f >= m * 2 ? 'f' : m >= f * 2 ? 'm' : ''
}
// 22.11.26: מתי אביאל כתב לאחרונה בצ'אט (מה שהקליד בעצמו; מה שיצא דרך הגשר נבדק ב-sent-log)
async function lastFromMe(chatJid) { const r = await sql(`SELECT timestamp FROM messages WHERE chat_jid = ?1 AND is_from_me = 1 ORDER BY datetime(timestamp) DESC LIMIT 1`, [chatJid]).catch(() => []); return r[0] ? r[0].timestamp : null }
module.exports = { lastFromMe, genderOf, knownName, phoneForChat, myRecentMessages, audioMessages, messageCount, cadence, recentImages, downloadMedia, selfChat, isSelf, newHotLeads, waitingForReply, recentMessages, lastMessage, repliesSince, nameOf, bridgeAlive, chatForPhone, inboundSince }
