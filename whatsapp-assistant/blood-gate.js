// 19.11.26 (אביאל): בדיקות דם שמתאמן/ת העלה/תה מחכות לאישור שלו לפני שרואים את הניתוח באפליקציה.
// ההודעה "בדיקות דם: <שם>" מגיעה לאביאל; תשובה בציטוט "כן" = ניתוח + תוספים עם קישורים, "רק ניתוח" = בלי תוספים, "לא" = לא נשלח.
// בלי ציטוט: "בדיקות <שם> כן". "מי בלי בדיקות" = רשימת מי שעוד לא הביא/ה.
const fs = require('fs')
const path = require('path')
const STATE = path.join(__dirname, 'blood-gate.json')

module.exports = function bloodGate(ctx) { // ctx: client, config, coachApi, toWhatsApp
  const load = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return { map: {} } } }
  const save = (s) => { const ks = Object.keys(s.map); ks.slice(0, Math.max(0, ks.length - 100)).forEach((k) => delete s.map[k]); fs.writeFileSync(STATE, JSON.stringify(s)) }
  const say = (t) => ctx.client.sendMessage(ctx.config.owner, ctx.toWhatsApp(t)).catch(() => {})

  // 20.11.26: אותו מנגנון גם ל"הצעה מהמוח" (שינוי קלוריות / צעדים למי שתקוע שבועיים): kind = 'brain'
  function remember(sent, name, kind, opts) { if (sent && sent.id && name) { const s = load(); s.map[sent.id._serialized] = { k: kind === 'brain' ? 'brain' : 'blood', n: name, o: opts || null, at: Date.now() }; save(s) } }
  function rememberAny(sent, entry) { if (sent && sent.id && entry) { const s = load(); s.map[sent.id._serialized] = Object.assign({ at: Date.now() }, entry); save(s) } }
  function markDone(k, n) { const s = load(); let ch = false; Object.keys(s.map).forEach((id) => { const v = s.map[id]; if (v && typeof v === 'object' && v.k === k && v.n === n && !v.done) { v.done = Date.now(); ch = true } }); if (ch) save(s) }
  // 20.11.26 (אביאל): תשובה במספר על הודעה עם אפשרויות. מוח = פעולה בשרת; תוכנית = נפתחת משימה עם הכיוון שנבחר
  const pickOf = (text) => { const m = String(text || '').trim().match(/^(?:אפשרות\s*)?([1-9])[.)]?$/); return m ? Number(m[1]) : 0 }
  async function brainOption(e, n) { const key = (e.o || [])[n - 1]; if (!key) return say('אין אפשרות ' + n + ' בהודעה הזו.')
    try { const r = await ctx.coachApi('dashboardBrainOption', [e.n, key]); markDone('brain', e.n); return say((key === 'hold' ? '' : 'אושר: ') + r.done) } catch (er) { return say('ההצעה לא אושרה: ' + String(er.message || er).slice(0, 140)) } }
  async function progOption(e, n) { const line = (e.o || [])[n - 1]; if (!line) return say('אין אפשרות ' + n + ' בהודעה הזו.'); const first = String(e.n).split(' ')[0]
    try { await ctx.coachApi('dashboardTaskAdd', [e.n, ('תוכנית ל' + first + ': ' + line.replace(/^[123][.)]\s*/, '')).slice(0, 138)]); markDone('prog', e.n); return say('אושר: נפתחה לך משימה לבנות ל' + first + ' תוכנית לפי אפשרות ' + n + '.') } catch (er) { return say('לא נשלח: ' + String(er.message || er).slice(0, 140)) } }
  const byStanza = (st) => { if (!st) return null; const mp = load().map, k = Object.keys(mp).find((x) => x.endsWith('_' + st)); if (!k) return null; const v = mp[k]; return typeof v === 'string' ? { k: 'blood', n: v } : v }
  const nameByStanza = (st) => { const e = byStanza(st); return e && e.k === 'blood' ? e.n : null }
  async function brainDecide(name, mode) { const first = String(name).split(' ')[0]
    try { const b = await ctx.coachApi('dashboardBrainDecide', [name, mode === 'no' ? 'no' : 'yes'])
      if (mode === 'no') return say('נשאר כמו שהוא אצל ' + first + '. ההצעה נסגרה.')
      return say('אושר: ' + first + (b && b.applied ? ' עודכן/ה ל-' + b.applied.k + ' קלוריות וקיבל/ה הודעה באפליקציה.' : b && b.act === 'steps' ? ' קיבל/ה יעד צעדים חדש באפליקציה.' : b && b.menuTo ? ', נפתחה לך משימה לבנות תפריט ב-' + b.menuTo + ' קלוריות.' : ' אושר.'))
    } catch (e) { return say('ההצעה לא אושרה: ' + String(e.message || e).slice(0, 140)) } }
  function modeOf(text) { const t = String(text || '').trim().replace(/[.!\s]+$/, '')
    if (/^(כן|מאשר|אשר|אושר|שלח|תשלח|ok|אוקי|סבבה)$/i.test(t)) return 'yes'
    if (/^רק (ה)?ניתוח$|^בלי תוספים$/.test(t)) return 'analysis'
    if (/^(לא|אל תשלח|בטל)$/.test(t)) return 'no'
    return '' }
  // "בדיקות אבי כן" / "בדיקות אבי אדרי רק ניתוח"
  function parseCmd(text) { const m = String(text || '').trim().match(/^בדיקות\s+(.+?)\s+(כן|לא|רק ניתוח|רק הניתוח|בלי תוספים)[.!]?$/); return m ? { who: m[1].trim(), mode: modeOf(m[2]) } : null }
  const isMissingCmd = (text) => /^מי (עוד )?(בלי|לא (הביא|שלח|העלה)[^ ]*) בדיקות( דם)?\??$/.test(String(text || '').trim())

  async function decide(who, mode) {
    try {
      const r = await ctx.coachApi('dashboardBloodApprove', [who, mode]), first = String(r.name).split(' ')[0]; markDone('blood', r.name)
      if (r.mode === 'no') return say('לא נשלח ל' + first + '. הניתוח נמחק מההמתנה, הקובץ נשאר בתיקייה.')
      return say('אושר: ' + first + ' רואה עכשיו את ניתוח בדיקות הדם באפליקציה' + (r.items && r.items.length ? ', עם התוספים והקישורים: ' + r.items.join(', ') : ', בלי תוספים') + '.')
    } catch (e) { return say('בדיקות הדם לא אושרו: ' + String(e.message || e).slice(0, 140)) }
  }
  async function missing() {
    try { const L = await ctx.coachApi('dashboardBloodMissing', []); return say(L && L.length ? '*בדיקות דם חסרות (' + L.length + ')*\n' + L.join('\n') + '\n\nתזכורת באפליקציה יוצאת לבד בימי שני, פעם בשבועיים.' : 'כל הפעילים הביאו בדיקות דם.') }
    catch (e) { return say('לא הצלחתי למשוך את הרשימה: ' + String(e.message || e).slice(0, 120)) }
  }
  // 20.11.26 (אביאל): "מה מחכה לי" = כל מה שמחכה לאישור שלו; ותזכורת אחת אחרי 24 שעות בלי תשובה. בודקים מול השרת שזה באמת עדיין פתוח (אולי אושר מהדשבורד)
  const isPendingCmd = (text) => /^מה (מחכה|פתוח)( לי)?( לאישור)?\??$/.test(String(text || '').trim())
  async function pendingList() { const s = load(), seen = {}, out = [], now = Date.now()
    for (const id of Object.keys(s.map)) { const v = s.map[id]; if (!v || typeof v !== 'object' || v.done || !v.at || now - v.at > 14 * 864e5) continue; const key = v.k + '|' + v.n; if (seen[key]) continue; seen[key] = 1
      let still = true
      try { if (v.k === 'blood') still = !!((await ctx.coachApi('dashboardClientCard', [v.n])) || {}).bloodPending; else if (v.k === 'brain') still = ((await ctx.coachApi('dashboardBrainOpts', [v.n])) || {}).status === 'pending' } catch (e) {}
      if (!still) { markDone(v.k, v.n); continue }
      out.push({ id, k: v.k, n: v.n, at: v.at, reminded: v.reminded }) }
    return out }
  const lineOf = (x) => { const f = String(x.n).split(' ')[0], d = Math.floor((Date.now() - x.at) / 864e5), ago = d < 1 ? 'מהיום' : d === 1 ? 'מאתמול' : 'כבר ' + d + ' ימים'
    return x.k === 'blood' ? '• בדיקות דם של ' + x.n + ' (' + ago + '). לאשר: בדיקות ' + f + ' כן' : x.k === 'brain' ? '• הצעה ל' + x.n + ' (' + ago + '). לענות במספר בציטוט על ההודעה שלה' : '• תוכנית ל' + x.n + ' (' + ago + '). לענות 1/2/3 בציטוט על ההודעה שלה' }
  async function pending() { try { const L = await pendingList(); return say(L.length ? '*מחכה לאישור שלך (' + L.length + ')*\n' + L.map(lineOf).join('\n') : 'אין כרגע שום דבר שמחכה לאישור שלך.') } catch (e) { return say('לא הצלחתי לבדוק מה מחכה: ' + String(e.message || e).slice(0, 120)) } }
  async function remind() { if (!ctx.config.owner || (ctx.ready && !ctx.ready())) return
    try { const L = (await pendingList()).filter((x) => !x.reminded && Date.now() - x.at > 24 * 3600e3); if (!L.length) return
      await say('*מחכה לאישור שלך כבר יום (' + L.length + ')*\n' + L.map(lineOf).join('\n')); const s = load(); L.forEach((x) => { if (s.map[x.id]) s.map[x.id].reminded = Date.now() }); save(s) } catch (e) { console.error('[pending-remind]', e.message) } }
  return { isPendingCmd, pending, remind, remember, rememberAny, pickOf, brainOption, progOption, nameByStanza, byStanza, brainDecide, modeOf, parseCmd, isMissingCmd, decide, missing }
}
