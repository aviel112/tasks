// 22.11.26: תזכורת תוספים / ציון דרך / אחרי אימון — מתי כן ומתי לא
const fs = require('fs'), path = require('path')
const ST = path.join(__dirname, '..', 'care-state.json'), bk = fs.existsSync(ST) ? fs.readFileSync(ST) : null
const care = require('../care')
let fail = 0; const eq = (n, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) { fail++; console.log('FAIL', n, JSON.stringify(g), '≠', JSON.stringify(w)) } }
const H = (d, kg) => ({ d, kg, reps: 8 })
const pl = { lifts: { 'סקוואט': { hist: [H('2026-10-01', 40), H('2026-10-01', 45), H('2026-11-22', 60)] }, 'פולי': { hist: [H('2026-11-22', 30)] }, 'חתירה': { hist: [H('2026-11-01', 30), H('2026-11-22', 30)] } } }
eq('התקדמות: ראשון מול הכי טוב', care.liftGains(pl).map((x) => [x.ex, x.from, x.to]), [['סקוואט', 45, 60]])
const w = care.todayWorkout(pl, '2026-11-22'); eq('אימון היום', w.ex.length, 3); eq('שיא רק מעל מה שהיה', w.prs.map((x) => x.ex), ['סקוואט'])
;(async () => {
  let today = '2026-11-22', made = []
  const C = [{ name: 'דני כהן', status: 'פעיל', phone: '0521234567', start: '2026-10-23' }, { name: 'אבא', status: 'פעיל', phone: '0521111111', start: '2026-10-23' }]
  const cards = { 'דני כהן': { token: 't', supp: { at: 'A', got: '2026-10-20', items: [{ t: 'ויטמין D', url: 'https://iherb.com/x?rcode=MLO2296' }] } }, 'אבא': { token: 't', supp: { at: 'A', got: '2026-10-01', items: [{ t: 'x', url: 'u' }] } } }
  care.init({ coachApi: async (fn, a) => fn === 'dashboardList' ? { clients: C } : fn === 'dashboardTagsAll' ? { 'אבא': ['משפחה'] } : fn === 'dashboardClientCard' ? cards[a[0]] : null,
    planOf: async () => pl, alertWithDraft: async (o) => { made.push(o.title + ':' + o.who.display); return 7 }, drafts: { pendingForPerson: () => [], sentFor: () => [] },
    biz: { chatForPhone: async () => null, inboundSince: async () => [] }, today: () => today, log() {} })
  try { fs.unlinkSync(ST) } catch {}
  await care.suppRefill(); eq('תוספים אחרי 33 יום, בלי משפחה', made, ['תזכורת תוספים:דני כהן'])
  made = []; await care.suppRefill(); eq('לא פעמיים באותו מחזור', made, [])
  made = []; today = '2026-12-20'; await care.suppRefill(); eq('שוב אחרי עוד חודש', made, ['תזכורת תוספים:דני כהן'])
  made = []; today = '2026-11-23'; await care.milestones(); eq('חודש מתחילת הליווי', made, ['ציון דרך:דני כהן'])
  made = []; await care.milestones(); eq('ציון דרך פעם אחת', made, [])
  made = []; today = '2026-11-22'; await care.afterWorkout(); eq('אחרי אימון', made, ['אחרי אימון:דני כהן'])
  made = []; await care.afterWorkout(); eq('פעם בשבוע', made, [])
  if (bk) fs.writeFileSync(ST, bk); else try { fs.unlinkSync(ST) } catch {}
  console.log(fail ? `${fail} בדיקות אכפתיות נכשלו` : 'בדיקות האכפתיות עברו'); process.exit(fail ? 1 : 0)
})()
