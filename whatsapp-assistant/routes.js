// 19.11.26 (אביאל: "שיהיה לי ממש קל לנהל הכל"): ההודעות של העוזרת מתפצלות ל-3 קבוצות לפי נושא —
// מתאמנים (טיוטות, אישורים, ארוחות, תקלות), עסק (לידים, תוכן, תשלומים) ואישי (דירות, תיק מניות, תזכורות).
// מה שלא מזוהה, ותשובות לפקודות שאביאל כותב בצ'אט הפרטי, נשארים בצ'אט הפרטי.
// תשובה של אביאל בתוך קבוצה = כמו בצ'אט עם העוזרת, והמענה חוזר לאותה קבוצה (3 דקות).
const fs = require('fs')
const path = require('path')
const FILE = path.join(__dirname, 'routes.json')
const NAMES = { coach: 'אביאל · מתאמנים', biz: 'אביאל · עסק ותוכן', personal: 'אביאל · אישי' }
const KEYWORD = { 'מתאמנים': 'coach', 'עסק': 'biz', 'עסק ותוכן': 'biz', 'אישי': 'personal' }
// הודעת הפתיחה בכל קבוצה = גם התיאור שלה: מה מגיע לכאן ואיך עונים
const INTRO = {
  coach: '*אביאל · מתאמנים*\nכל מה שקשור למתאמנים מגיע לכאן:\n• טיוטות תשובה וסבבי תשובות, לאישור\n• אישורי "נשלח"\n• צילומי ארוחות ופענוח\n• מי שקט, מי צריך אותך הבוקר, פתיחת שבוע\n• בדיקות דם ותקלות באפליקציה\n\nעונים כאן בדיוק כמו בצ׳אט איתי: "כן" מאשר, ותשובה בציטוט מתקנת.',
  biz: '*אביאל · עסק ותוכן*\nכל מה שקשור לעסק מגיע לכאן:\n• ליד חדש ומעקבי לידים\n• "5 לסגור היום"\n• תשלומים ופרוטוקול הקיץ\n• כיתובים לרילסים וסטורי להיום\n• סיכום שבוע של העוזרת',
  personal: '*אביאל · אישי*\nהדברים האישיים מגיעים לכאן:\n• דוח דירות יומי\n• התראות ותדריך תיק המניות\n• תזכורות, הודעת בוקר וערב',
}
const RULES = [
  ['personal', /דוח דירות|דירות לאמא|התראות תיק|תדריך תיק|^\*תזכורת:\*|^בוקר טוב אביאל|^ערב טוב אביאל/],
  ['biz', /^\*ליד|ליד חדש|^\*סטורי|^תגיבו|^הקטע הזה לקוח|^שמרו את זה|^תייגו את|^אתם יודעים מה|^\*5 לסגור היום|^\*סיכום שבוע של הע|דוח מנכ|^\*תשלום|^\*חידוש|^\*פרוטוקול/],
  ['coach', /^\*חידושים|^זה האחרון בתור|^\*?סיכום שבוע|^השלמת סיכום שבוע|^\*מי משתמש במה|^\*לא ענו|^\*הצעה מהמוח|^\*דוח שבועי|^\*האפליקציה השבוע|^\*תזכורות למתאמנים|^#\d+ זו|^יש כמה|^בוטל\.|^\*[^*\n]{2,40}\* (כתב|פתיחת שבוע|שלח|ביקש)|^\*סבב תשובות|^נשלח ל|^\*שקטים|^\*בוקר\. \d|^\*תקלה באפליקציה|^\*בדיקת יומנים|^\*מחכה לך בעסקי|^\*פתיחת שבוע|לענות "כן" = מאשר|^אושר:|^עודכן ביומן|^\*תזכורת מקצועית|^\*בדיקות דם|^לא נשלח|^בדיקות הדם לא אושרו|^כל הפעילים הביאו|^\*הצעה מהמוח|^\*תוכנית: |^נשאר כמו שהוא|^ההצעה לא אושרה|^אין אפשרות \d|^\*מחכה לאישור שלך|^אין כרגע שום דבר שמחכה|^בוטל: /],
]
const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return {} } }
const save = (s) => fs.writeFileSync(FILE, JSON.stringify(s, null, 1))
const clean = (t) => String(t || '').replace(/^[​‎‏\s🏠]+/, '')
function classify(text) { const t = clean(text); for (const [cat, re] of RULES) if (re.test(t)) return cat; return null }
const gidFor = (cat) => (cat && load()[cat]) || ''
const catOf = (gid) => { const s = load(); return Object.keys(NAMES).find((c) => s[c] && s[c] === gid) || null }
function adopt(cat, gid) { const s = load(); s[cat] = gid; save(s) }
// יוצר את הקבוצות שחסרות ומוסיף אליהן את אביאל. מנסה פעם אחת בלבד; אם לא הצליח — אימוץ במילת מפתח בתוך קבוצה שאביאל פתח.
async function ensure(client, owner) {
  const s = load(), made = []
  if (s.tried2) return made
  s.tried2 = new Date().toISOString(); save(s)
  let who = owner // יצירת קבוצה עם מזהה lid נכשלת — מנסים לפי מספר הטלפון
  try { const r = await client.getContactLidAndPhone([owner]); const pn = r && r[0] && r[0].pn; if (pn) who = pn; console.log('[routes] owner pn resolved:', !!pn) } catch (e) { console.error('[routes] lid→pn', e.message) }
  for (const cat of Object.keys(NAMES)) { if (s[cat]) continue
    try { const r = await client.createGroup(NAMES[cat], [who]); const gid = r && r.gid && (r.gid._serialized || r.gid); if (gid) { s[cat] = gid; save(s); made.push(cat) } else console.error('[routes] createGroup no gid', cat, JSON.stringify(r).slice(0, 200)) }
    catch (e) { console.error('[routes] createGroup', cat, e.message) } }
  return made
}
module.exports = { NAMES, KEYWORD, INTRO, classify, gidFor, catOf, adopt, ensure, load }
