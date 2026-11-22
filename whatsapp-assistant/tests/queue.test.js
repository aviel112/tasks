// 22.11.26: תור הטיוטות — אחת בכל פעם, לקוח קודם, "הבא", אחרון, אותו יום → מחר. מריץ את הקוד האמיתי מ-index.js עם תחליפים
const fs = require('fs'), os = require('os'), path = require('path')
const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
const code = src.slice(src.indexOf('const DQ_PATH'), src.indexOf('setInterval(draftQueueTick')).replace('const DQ_PATH', 'var DQ_PATH')
let fail = 0; const eq = (n, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) { fail++; console.log('FAIL', n, '\n  got ', JSON.stringify(g), '\n  want', JSON.stringify(w)) } }
async function scenario(D, SENT, fn) {
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-')), out = []
  const drafts = { get: (i) => D[i] || null, remove: (i) => { delete D[i] }, touch() {}, setAlertMsgId() {}, recentSent: () => SENT }
  const biz = { lastMessage: async () => null }, config = { owner: 'OWN' }, clientReady = true, toWhatsApp = (t) => t, offerDraft = () => {}
  const client = { sendMessage: async (to, t) => { out.push(t.split('\n')[0]); return { id: { _serialized: 'm' } } } }
  eval(code)
  const T = () => new Promise((r) => setTimeout(r, 650))
  await fn({ draftQueuePush, draftQueueTick, draftQueueSkip, T, out, D, SENT })
}
const P = (n, ph, extra) => ({ name: n, phone: ph, chat_jid: ph + '@lid', ...extra })
;(async () => {
  await scenario({ 1: P('א', '1'), 2: P('ב', '2'), 3: P('ג', '3', { clientText: 'היי' }) }, [], async ({ draftQueuePush, draftQueueTick, T, out, D }) => {
    draftQueuePush(1, 'A'); draftQueuePush(2, 'B'); await T(); draftQueuePush(3, 'C', 'OWN', true); await T()
    eq('אחת בכל פעם', out, ['A']); delete D[1]; await draftQueueTick(); eq('לקוח שכתב קודם', out, ['A', 'C']); delete D[3]; await draftQueueTick(); eq('ואז הבוט', out, ['A', 'C', 'B'])
  })
  await scenario({ 1: P('א', '1'), 2: P('ב', '2') }, [], async ({ draftQueuePush, draftQueueTick, draftQueueSkip, T, out, D }) => {
    draftQueuePush(1, 'A'); draftQueuePush(2, 'B'); await T(); draftQueueSkip(); await T(); eq('הבא מדלג', out, ['A', 'B'])
    delete D[2]; await draftQueueTick(); eq('המדולגת חוזרת בסוף', out, ['A', 'B', 'A'])
    draftQueueSkip(); await T(); eq('הבא על האחרון = הודעה, לא חזרה', out, ['A', 'B', 'A', 'זה האחרון בתור להיום. אפשר לענות עליו, או *לא* כדי לבטל.'])
  })
  const today = new Date().toISOString()
  await scenario({ 1: P('אודליה', '1'), 2: P('אודליה', '1'), 3: P('לאון', '2', { clientText: 'שאלה' }) }, [{ at: today, chat_jid: '2@lid', jid: '2' }], async ({ draftQueuePush, draftQueueTick, T, out, D, SENT }) => {
    draftQueuePush(1, 'O1'); draftQueuePush(2, 'O2'); draftQueuePush(3, 'L-reply'); await T()
    SENT.push({ at: today, chat_jid: '1@lid', jid: '1' }); delete D[1]; await draftQueueTick()
    eq('שנייה לאותו אדם באותו יום → למחר; תשובה ללקוח לא נדחית', out, ['O1', 'L-reply']); eq('נשמרה (לא נמחקה)', !!D[2], true)
  })
  const y = new Date(Date.now() - 86400e3).toISOString()
  await scenario({ 1: P('עידן', '1') }, [{ at: y, chat_jid: '1@lid', jid: '1' }], async ({ draftQueuePush, T, out }) => {
    draftQueuePush(1, 'IDAN'); await T(); eq('הודעה מאתמול לא חוסמת היום', out, ['IDAN'])
  })
  console.log(fail ? `${fail} בדיקות תור נכשלו` : 'בדיקות התור עברו'); process.exit(fail ? 1 : 0)
})()
