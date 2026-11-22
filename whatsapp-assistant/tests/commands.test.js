// 22.11.26 (אביאל: "המון באגים, תלמד שזה לא יקרה שוב"): כל הניסוחים האמיתיים שאביאל כותב לעוזרת.
// רץ לפני כל אתחול (safe-restart.sh). נכשל = לא מאתחלים.
const fs = require('fs'), os = require('os'), path = require('path')
const tmp = path.join(os.tmpdir(), 'drafts-test-' + process.pid + '.json')
const at = new Date().toISOString()
fs.writeFileSync(tmp, JSON.stringify({ nextId: 600, items: {
  572: { name: 'אודליה', alias: 'אודליה', phone: '972500000001', chat_jid: 'a@lid', text: 'חידוש', at },
  584: { name: 'אודליה', alias: 'אודליה', phone: '972500000001', chat_jid: 'a@lid', text: 'סיכום', alt: 'ב', alt2: 'ג', clientText: 'חח', at },
  579: { name: 'שון', alias: 'שון', phone: '972500000002', chat_jid: 's@lid', text: 'א', alt: 'ב', at },
  590: { name: 'מור דומני', alias: 'מור', phone: '972500000003', chat_jid: 'm@lid', text: 'א', at },
} }))
process.env.DRAFTS_PENDING_PATH = tmp
const d = require('../drafts')
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fail++; console.log('FAIL', name, '\n  got ', JSON.stringify(got), '\n  want', JSON.stringify(want)) } }
const P = (t) => { const c = d.parseCommand(t); return c && { type: c.type, ref: c.ref, option: c.option } }
// בחירת נוסח — כל סדר
eq('1 אודליה', P('1 אודליה'), { type: 'send', ref: 'אודליה', option: 1 })
eq('אודליה 1', P('אודליה 1'), { type: 'send', ref: 'אודליה', option: 1 })
eq('2 יאן', P('2 יאן'), { type: 'send', ref: 'יאן', option: 2 })
eq('3 שון', P('3 שון'), { type: 'send', ref: 'שון', option: 3 })
eq('כן שון 2', P('כן שון 2'), { type: 'send', ref: 'שון', option: 2 })
eq('1 מור', P('1 מור'), { type: 'send', ref: 'מור', option: 1 })
eq('כן', P('כן'), { type: 'send', ref: null, option: 1 })
eq('1', P('1'), { type: 'send', ref: null, option: 1 })
eq('2', P('2'), { type: 'send', ref: null, option: 2 })
eq('לא אודליה', P('לא אודליה'), { type: 'cancel', ref: 'אודליה', option: undefined })
// עריכה
eq('ערוך', P('ערוך'), { type: 'edit', ref: null, option: 1 })
eq('ערוך 2', P('ערוך 2'), { type: 'edit', ref: null, option: 2 })
eq('ערוך 2 שני', P('ערוך 2 שני'), { type: 'edit', ref: 'שני', option: 2 })
eq('ערוך שני 3', P('ערוך שני 3'), { type: 'edit', ref: 'שני', option: 3 })
eq('ערוך 584', P('ערוך 584'), { type: 'edit', ref: '584', option: 1 })
// מספר טיוטה
eq('584', P('584'), { type: 'pick', ref: '584', option: undefined })
eq('584 אודליה', P('584 אודליה'), { type: 'send', ref: '584', option: 1 })
eq('אודליה 584', P('אודליה 584'), { type: 'send', ref: '584', option: 1 })
eq('2 584', P('2 584'), { type: 'send', ref: '584', option: 2 })
eq('כן 584 2', P('כן 584 2'), { type: 'send', ref: '584', option: 2 })
// לא לחטוף דברים אחרים
eq('ליהב יעד 1400', P('ליהב יעד 1400'), null)
eq('1400', P('1400'), null)
eq('84.3', P('84.3'), null)
eq('הבא', P('הבא'), null)
eq('מה המצב', P('מה המצב'), null)
// שם עם כמה טיוטות → זו שמוצגת עכשיו
eq('resolve אודליה (מוצגת 584)', d.resolveRef('אודליה', [584]), 584)
eq('resolve אודליה (בלי העדפה) = עמום', !!(d.resolveRef('אודליה') || {}).ambiguous, true)
eq('resolve מור', d.resolveRef('מור'), 590)
// כל הטיוטות של אותו אדם
eq('pendingForPerson אודליה', d.pendingForPerson('a@lid', '0500000001').map((x) => x.id).sort(), [572, 584])
// שומר מספרים (מקרים אמיתיים מ-22.11)
const src = 'משקל התחלה: 55.6 ק״ג · ממוצע 7 השקילות האחרונות: 54.7 · שקילה אחרונה: 53.9 · יעד 2,700 קלוריות · הוא כתב: מאמין שאסיים סביבות 15-16'
eq('מספרים אמיתיים עוברים', d.unverifiedNumbers('התחלנו ב-55.6, עכשיו 54.7 והבוקר 53.9', src), [])
eq('שעה שהומצאה נתפסת', d.unverifiedNumbers('סגור 15:30 יעבוד', src), ['15:30'])
eq('אלפים עם פסיק', d.unverifiedNumbers('היעד שלך 2,700 ביום', src), [])
eq('מספר קטן לא נבדק', d.unverifiedNumbers('3 אימונים השבוע', src), [])
eq('משקל שהומצא נתפס', d.unverifiedNumbers('ירדת ל-52.1', src), ['52.1'])
// פקודות בקול: התמלול עובר המרה ואז את אותו מנתח
{ const isrc = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8'); const fsrc = isrc.slice(isrc.indexOf('function spokenToCommand'), isrc.indexOf('async function handleVoice')); eval(fsrc.replace('function spokenToCommand', 'var spokenToCommand = function'))
  eq('קול: אחת אודליה', P(spokenToCommand('אחת אודליה.')), { type: 'send', ref: 'אודליה', option: 1 })
  eq('קול: אודליה שתיים', P(spokenToCommand('אודליה שתיים')), { type: 'send', ref: 'אודליה', option: 2 })
  eq('קול: ערוך שלוש', P(spokenToCommand('ערוך שלוש')), { type: 'edit', ref: null, option: 3 })
  eq('קול: משפט רגיל לא נוגעים', spokenToCommand('תוסיף לעידו שלוש מאות קלוריות'), 'תוסיף לעידו שלוש מאות קלוריות') }
// שעה בטיוטה חייבת להופיע במה שהלקוח כתב (מקרה שחף 22.11)
eq('שעה שהומצאה', d.unverifiedTimes('מלך עוד שעה אני פנוי / בסביבות 17 יעבוד לך?', 'חיים שלי מתי אתה יכול?'), ['17'])
eq('שעה שהלקוח אמר', d.unverifiedTimes('סגור, 16 יעבוד', 'מאמין שאסיים סביבות 15-16'), [])
eq('משקל לא נחשב שעה', d.unverifiedTimes('ירדת ל-17 קילו? לא, 17 ק״ג זה טעות', 'שאלה'), [])
eq('בלי הקשר של זמן לא נבדק', d.unverifiedTimes('3 אימונים ו-12 חזרות', ''), [])
eq('שעה עם דקות', d.unverifiedTimes('נפגשים ב-18:30', 'מתי נפגשים?'), ['18:30'])
fs.rmSync(tmp, { force: true })
console.log(fail ? `${fail} בדיקות נכשלו` : 'כל הבדיקות עברו')
process.exit(fail ? 1 : 0)
