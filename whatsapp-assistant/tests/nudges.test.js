// 22.11.26: צעדים בערב / לא נכנס / בדיקות דם / תמונות — מתי כן ומתי לא
const fs = require('fs'), path = require('path')
const ST = path.join(__dirname, '..', 'care-state.json'), bk = fs.existsSync(ST) ? fs.readFileSync(ST) : null
const care = require('../care')
let fail = 0; const eq = (n, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) { fail++; console.log('FAIL', n, JSON.stringify(g), '≠', JSON.stringify(w)) } }
;(async () => {
  let today = '2026-11-22', made = [], inbound = []
  const C = [{ name: 'דני כהן', status: 'פעיל', phone: '0521234567', start: '2026-11-10', seen: {} }, { name: 'רוני לוי', status: 'פעיל', phone: '0522222222', start: '2026-11-19', seen: { d: '2026-11-20', at: 1 } }, { name: 'אבא', status: 'פעיל', phone: '0521111111', start: '2026-11-10', seen: {} }]
  const cards = { 'דני כהן': { token: 'a', feat: { eff: { vit: true } }, ba: [] }, 'רוני לוי': { token: 'b', bloodFile: 'x', ba: [1] }, 'אבא': { token: 'c' } }
  const data = { a: { stepsGoal: 8000, photoDue: true, week: [{ d: '2026-11-22', steps: 3000 }] }, b: { stepsGoal: 8000, photoDue: false, week: [{ d: '2026-11-22', steps: 7000 }] }, c: { stepsGoal: 8000, photoDue: true, week: [{ d: '2026-11-22', steps: 100 }] } }
  care.init({ coachApi: async (fn, a) => fn === 'dashboardList' ? { clients: C } : fn === 'dashboardTagsAll' ? { 'אבא': ['משפחה'] } : fn === 'dashboardClientCard' ? cards[a[0]] : fn === 'dashboardAppLink' ? { link: 'L' } : null,
    dataOf: async (t) => data[t], planOf: async () => null, alertWithDraft: async (o) => { made.push(o.title + ':' + o.who.display); return 7 }, drafts: { pendingForPerson: () => [], sentFor: () => [] },
    biz: { chatForPhone: async () => null, inboundSince: async () => inbound }, today: () => today, log() {} })
  try { fs.unlinkSync(ST) } catch {}
  await care.stepsPush(); eq('צעדים: רק מי שרחוק מהיעד, בלי משפחה', made, ['צעדים:דני כהן'])
  made = []; await care.stepsPush(); eq('צעדים: לא פעמיים ביום', made, [])
  made = []; today = '2026-11-23'; data.a.week = [{ d: '2026-11-23', steps: 1000 }]; await care.stepsPush(); eq('צעדים: פעם שנייה בשבוע', made, ['צעדים:דני כהן'])
  made = []; today = '2026-11-24'; data.a.week = [{ d: '2026-11-24', steps: 1000 }]; await care.stepsPush(); eq('צעדים: לא שלישית באותו שבוע', made, [])
  made = []; today = '2026-11-25'; data.a.week = [{ d: '2026-11-25', steps: null }]; inbound = []; fs.unlinkSync(ST); await care.stepsPush(); eq('צעדים: לא רשם היום = לא יודעים', made, [])
  made = []; today = '2026-11-12'; await care.notOpened(); eq('לא נכנס: יומיים מההתחלה', made, ['לא נכנס לאפליקציה:דני כהן'])
  made = []; today = '2026-11-14'; await care.notOpened(); eq('לא נכנס: לא לפני 4 ימים', made, [])
  made = []; today = '2026-11-16'; await care.notOpened(); eq('לא נכנס: פעם שנייה', made, ['לא נכנס לאפליקציה:דני כהן'])
  made = []; today = '2026-11-21'; await care.notOpened(); eq('לא נכנס: לא יותר מפעמיים', made, [])
  made = []; today = '2026-11-22'; await care.bloodNag(); eq('דם: רק מי שלא שלח, 7+ ימים', made, ['בדיקות דם:דני כהן'])
  made = []; today = '2026-11-24'; await care.bloodNag(); eq('דם: לא לפני 4 ימים', made, [])
  made = []; today = '2026-11-26'; inbound = [1]; await care.bloodNag(); eq('דם: לא כשכבר דיברו היום', made, [])
  made = []; inbound = []; await care.bloodNag(); eq('דם: אחרי 4 ימים', made, ['בדיקות דם:דני כהן'])
  made = []; today = '2026-11-20'; await care.photosNag(); eq('תמונות: יום ראשון רק נרשם', made, [])
  made = []; today = '2026-11-23'; await care.photosNag(); eq('תמונות: אחרי 3 ימים', made, ['תמונות:דני כהן'])
  made = []; today = '2026-11-24'; await care.photosNag(); eq('תמונות: פעם אחת לכל בקשה', made, [])
  data.a.photoDue = false; await care.photosNag(); data.a.photoDue = true; made = []; today = '2026-12-20'; await care.photosNag(); today = '2026-12-23'; await care.photosNag(); eq('תמונות: בקשה חדשה בחודש הבא', made, ['תמונות:דני כהן'])
  if (bk) fs.writeFileSync(ST, bk); else try { fs.unlinkSync(ST) } catch {}
  console.log(fail ? `${fail} בדיקות דחיפות נכשלו` : 'בדיקות הדחיפות עברו'); process.exit(fail ? 1 : 0)
})()
