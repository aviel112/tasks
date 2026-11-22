// 22.11.26 (אביאל: "אל תשלח הודעות על מתאמנים בפרטי, רק בקבוצה"): לאיזה צ'אט כל הודעה הולכת. מריץ את הקוד האמיתי
const fs = require('fs'), path = require('path')
const routes = require('../routes'), src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
const fnSrc = src.slice(src.indexOf('let TRAINEE_RE = null'), src.indexOf('setTimeout(refreshTraineeNames'))
let fail = 0; const eq = (n, g, w) => { if (g !== w) { fail++; console.log('FAIL', JSON.stringify(n), 'got', g, 'want', w) } }
;(async () => {
  const coachApi = async () => ({ clients: ['שון', 'אודליה', 'מור דומני', 'עידן קסימדזנוב', 'עידו פארחן', 'שני אהרוני', 'לאון'].map((name) => ({ name })) })
  eval(fnSrc.replace('let TRAINEE_RE', 'var TRAINEE_RE')); await refreshTraineeNames()
  const aboutTrainee = (t) => !!(TRAINEE_RE && TRAINEE_RE.test(String(t || '')))
  const route = (txt) => { let cat = routes.classify(txt); if ((!cat || cat === 'biz') && aboutTrainee(txt) && !/^\*?(ליד|5 לסגור)/.test(txt.replace(/^[​\s]+/, ''))) cat = 'coach'; return cat || 'פרטי' }
  const C = [
    ['​*שון* סיכום שבוע\nממוצע 91.8', 'coach'], ['*מור דומני* (#589)\n*1.*\nמורי שבוע טוב', 'coach'], ['#584 זו אודליה. איזה נוסח?', 'coach'],
    ['יש כמה לאודליה: אודליה (572)', 'coach'], ['נשלח לעידו פארחן.', 'coach'], ['השלמת סיכום שבוע: 5 טיוטות', 'coach'], ['סיכום שבוע: 10 טיוטות מוכנות', 'coach'],
    ['*מי משתמש במה* (7 הימים)', 'coach'], ['*חידוש* עידן מסיים בעוד 14 ימים', 'coach'], ['זה האחרון בתור להיום. אפשר לענות עליו', 'coach'],
    ['*ליד חדש* רון כהן', 'biz'], ['דוח דירות לאמא', 'personal'], ['*תזכורת:* להתקשר למור', 'personal'], ['שמור את הקובץ', 'פרטי'], ['זמור', 'פרטי'], ['למור יש פגישה', 'coach'],
  ]
  for (const [t, w] of C) eq(t.slice(0, 30), route(t), w)
  console.log(fail ? `${fail} בדיקות ניתוב נכשלו` : 'בדיקות הניתוב עברו'); process.exit(fail ? 1 : 0)
})()
