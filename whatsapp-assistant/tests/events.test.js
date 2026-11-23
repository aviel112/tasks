// 23.11.26: אירועים בחיים — שבוע לפני פעם אחת, ביום עצמו רק בתאריך מדויק
const fs = require('fs'), path = require('path'), care = require('../care')
const EV = path.join(__dirname, '..', 'brain', 'events.json'), bk = fs.readFileSync(EV)
let fail = 0; const eq = (n, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) { fail++; console.log('FAIL', n, JSON.stringify(g), '≠', JSON.stringify(w)) } }
;(async () => {
  let today = '2026-12-15', made = []
  fs.writeFileSync(EV, JSON.stringify([{ name: 'דני כהן', what: 'טיסה', date: '2026-12-23', approx: true, sent: {} }, { name: 'דני כהן', what: 'חתונה', date: '2026-12-20', sent: {} }, { name: 'דני כהן', what: 'בלי תאריך', date: null, sent: {} }]))
  care.init({ coachApi: async (fn) => fn === 'dashboardList' ? { clients: [{ name: 'דני כהן', status: 'פעיל', phone: '0521234567' }] } : null, alertWithDraft: async (o) => { made.push(o.headline); return 1 },
    drafts: { pendingForPerson: () => [], sentFor: () => [] }, biz: { chatForPhone: async () => null, inboundSince: async () => [] }, today: () => today, log() {} })
  await care.lifeEvents(); eq('8 ימים לפני טיסה', made, ['טיסה · בעוד 8 ימים'])
  made = []; await care.lifeEvents(); eq('לא פעמיים', made, [])
  made = []; today = '2026-12-20'; await care.lifeEvents(); eq('ביום החתונה (אחרי שלפני כבר עבר)', made, ['חתונה · היום'])
  made = []; today = '2026-12-23'; await care.lifeEvents(); eq('ביום של תאריך "בערך" — לא', made, [])
  fs.writeFileSync(EV, bk); console.log(fail ? `${fail} בדיקות אירועים נכשלו` : 'בדיקות האירועים עברו'); process.exit(fail ? 1 : 0)
})()
