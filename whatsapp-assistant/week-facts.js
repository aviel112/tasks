// 22.11.26 (אביאל: "סיכום שבוע אישי" לכל מתאמן, ראשון 10:00, אחת אחת עם 3 אופציות):
// עובדות השבוע מהשרת (dashboardWeekFacts) → שורת נתונים לטיוטה + כללי הניסוח.
function factsLine(f) {
  if (!f) return ''
  const L = []
  if (f.goal) L.push('מטרה: ' + f.goal)
  if (f.weighs) L.push(`${f.weighs} שקילות, ממוצע ${f.avg} ק״ג` + (f.diff == null ? '' : f.diff === 0 ? ' (כמו בשבוע הקודם)' : ` (${f.diff > 0 ? '+' : '−'}${Math.abs(f.diff)} ק״ג מול ממוצע השבוע הקודם)`))
  else L.push('שקילות: לא נרשמו')
  if (f.steps) L.push('ממוצע צעדים יומי: ' + Number(f.steps).toLocaleString('en-US'))
  L.push(f.trains ? `${f.trains === 1 ? 'אימון אחד רשום' : f.trains + ' אימונים רשומים'} באפליקציה` : 'אימונים: לא נרשמו באפליקציה')
  if (f.up && f.up.length) L.push('עלה במשקלי עבודה: ' + f.up.map((u) => `${u.ex} ל-${u.now} ק״ג (+${u.diff})`).join(', '))
  if (f.food >= 4) L.push(`יומן אוכל מולא ב-${f.food} ימים`) // רק לטובה: חלק אוכלים לפי תפריט ולא ממלאים יומן
  return L.join(' · ')
}
const hasData = (f) => !!(f && (f.weighs || f.trains || f.food >= 4))
const situation = (first, f) => hasData(f)
  ? `יום ראשון בבוקר. אביאל שולח ל${first} סיכום אישי של השבוע שעבר (ראשון עד שבת). הנתונים מהאפליקציה: ${factsLine(f)}.`
  : `יום ראשון בבוקר. אביאל שולח לכל מתאמן סיכום אישי של השבוע שעבר. אצל ${first} אין נתונים מהשבוע באפליקציה (בלי שקילות ובלי אימונים רשומים).`
const RULES = 'סיכום שבוע אישי בקול של אביאל. לפתוח בדבר אחד ספציפי וטוב מהנתונים (מספר אמיתי אחד או שניים, לא רשימה של כל הנתונים), אחריו מיקוד אחד לשבוע החדש שנגזר מהנתון החלש, ולסיים בשאלה אחת קלה. 2–4 שורות. ' +
  'רק מספרים שמופיעים בנתונים, לא להמציא ולא לעגל אחרת. לפרש את השינוי במשקל לפי המטרה (בירידה מינוס זה טוב, בעלייה פלוס זה טוב). ' +
  'לא להזכיר נתון שלא מופיע בנתונים (צעדים, יומן אוכל, תפריט) כאילו הוא חסר. ' +
  'נתון שכתוב עליו "לא נרשמו" אינו כישלון (ייתכן שפשוט לא נרשם באפליקציה): לא לנזוף, אפשר לשאול. ' +
  'אם אין נתונים בכלל: הודעה חמה וקצרה שמתעניינת איך עבר השבוע ומבקשת דבר אחד קטן לשבוע הזה (שקילת בוקר). ' +
  'בלי אימוג׳י. ניסוח ניטרלי מגדרית אם המין לא ברור מהתיק. לא לכתוב SKIP.'
// מי שהתקדם במשקל לפי המטרה וגם עלה במשקל עבודה באותו שבוע
function proofLine(first, f) {
  if (!f || !f.diff || !(f.up && f.up.length)) return ''
  const good = f.goal === 'ירידה' ? f.diff < 0 : f.goal === 'עלייה' ? f.diff > 0 : false
  if (!good) return ''
  const u = f.up[0]
  return `• ${first}: ${f.diff > 0 ? '+' : '−'}${Math.abs(f.diff)} ק״ג בממוצע השבועי, ושיא ב${u.ex} (${u.now} ק״ג, +${u.diff})`
}
// 22.11.26 (אביאל: "דוח מי משתמש במה"): שורה לכל מתאמן על 7 הימים האחרונים + סיכום. rows: [{ first, f, seen }]
function usageReport(rows) {
  const R = rows.filter((r) => r.f); if (!R.length) return ''
  const dm = (d) => { const m = String(d || '').match(/^\d{4}-(\d\d)-(\d\d)/); return m ? `${Number(m[2])}.${Number(m[1])}` : '' }
  const score = (f) => (f.weighs || 0) + (f.trains || 0) * 2 + (f.food || 0)
  const n = R.length, cnt = (fn) => R.filter((r) => fn(r.f)).length
  const L = ['*מי משתמש במה* (7 הימים האחרונים)',
    `נשקלים 4 ימים ומעלה: ${cnt((f) => f.weighs >= 4)} מתוך ${n} · רושמים אימונים: ${cnt((f) => f.trains > 0)} מתוך ${n} · יומן אוכל 4 ימים ומעלה: ${cnt((f) => f.food >= 4)} מתוך ${n}`, '']
  R.slice().sort((a, b) => score(b.f) - score(a.f)).forEach((r) => {
    const f = r.f, s = dm(r.seen)
    L.push(`${r.first}: שקילות ${f.weighs || 0} · אימונים ${f.trains || 0} · יומן ${f.food || 0}` + (s ? ` · כניסה אחרונה ${s}` : ' · בלי כניסה רשומה'))
  })
  const none = R.filter((r) => !score(r.f)).map((r) => r.first)
  if (none.length) L.push('', `בלי שום רישום השבוע: ${none.join(', ')}`)
  return L.join('\n')
}
module.exports = { factsLine, hasData, situation, RULES, proofLine, usageReport }
