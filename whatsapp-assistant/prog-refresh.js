// 20.11.26 (אביאל): "תוכנית אימון משנים אחרי 8-12 שבועות". בשבוע 8 נפתחת משימה בלוח (שרת, כלל prog).
// בשבוע 12 אביאל מקבל כאן בווטסאפ 3 הצעות לשינוי, לפי המתאמן/ת עצמו/ה: התוכנית הנוכחית, מה מתקדם ומה תקוע, נקודות חולשה ומטרה.
// פעם אחת לכל תוכנית (prog-refresh.json); כשהתוכנית מתחלפת הספירה מתאפסת.
const fs = require('fs')
const path = require('path')
const STATE = path.join(__dirname, 'prog-refresh.json')
const EXEC = 'https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec'
const DUE_DAYS = 84, STALL_DAYS = 42, STALL_MIN = 3 // 20.11.26: גם לפני שבוע 12 — אם 3 תרגילים ומעלה תקועים אחרי 6 שבועות

module.exports = function progRefresh(ctx) { // ctx: client, config, coachApi, toWhatsApp, askBrainOnce, stripEmoji, ready()
  const load = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return {} } }
  const save = (s) => fs.writeFileSync(STATE, JSON.stringify(s))

  function liftLines(lifts, names) { // לכל תרגיל בתוכנית: כמה אימונים, משקל ראשון ← אחרון, והאם תקוע 3 אימונים
    const out = []
    names.forEach((n) => { const h = ((lifts || {})[n] || {}).hist || []; if (!h.length) { out.push(n + ': לא נרשם'); return }
      const byDay = {}; h.forEach((x) => { if (x.d) byDay[x.d] = Math.max(byDay[x.d] || 0, +x.kg || 0) })
      const ds = Object.keys(byDay).sort(), tops = ds.map((d) => byDay[d]), last3 = tops.slice(-3)
      const stuck = last3.length === 3 && last3[2] <= last3[0]
      out.push(n + ': ' + ds.length + ' אימונים, ' + tops[0] + ' ← ' + tops[tops.length - 1] + ' ק״ג' + (stuck ? ' (תקוע 3 אימונים)' : '')) })
    return out
  }

  async function build(name, days, goal, onlyIfStalled) {
    const card = await ctx.coachApi('dashboardClientCard', [name])
    if (!card || !card.token) throw new Error('אין קוד אפליקציה')
    const r = await fetch(EXEC + '?api=plan&t=' + encodeURIComponent(card.token)), j = await r.json(), P = (j && j.r) || {}
    const blocks = ((P.program || {}).blocks || []).filter((b) => (b.ex || []).length)
    if (!blocks.length) throw new Error('אין תוכנית קריאה')
    const prog = blocks.map((b) => b.title + ': ' + b.ex.map((e) => e.ex + ' ' + e.s + 'x' + e.r).join(', ')).join('\n')
    const names = []; blocks.forEach((b) => b.ex.forEach((e) => { if (names.indexOf(e.ex) < 0) names.push(e.ex) }))
    const weeks = Math.floor(days / 7), LL = liftLines(P.lifts, names), stuckN = LL.filter((x) => /תקוע/.test(x)).length
    if (onlyIfStalled && stuckN < STALL_MIN) return null
    const prompt = 'אתה עוזר למאמן הכושר אביאל להחליט איך לרענן תוכנית אימון של מתאמן/ת אחרי ' + weeks + ' שבועות על אותה תבנית.\n' +
      'מטרה: ' + (goal || card.goal || 'לא צוינה') + (card.weak ? '\nנקודות חולשה שסומנו: ' + JSON.stringify(card.weak).slice(0, 300) : '') + (card.note ? '\nהערות: ' + String(card.note).slice(0, 200) : '') +
      '\n\nהתוכנית הנוכחית:\n' + prog.slice(0, 2500) + '\n\nהתקדמות לפי תרגיל (משקל עליון ראשון ← אחרון):\n' + LL.join('\n').slice(0, 2500) +
      '\n\nכתוב בדיוק 3 אפשרויות שונות זו מזו לשינוי, מותאמות לנתונים האלה. כל אפשרות היא כיוון אחר: סוג תוכנית או פיצול אחר (AB, עליון-תחתון, PPL, פול-באדי), החלפת התרגילים שנתקעו בווריאציות, או שינוי שיטה (טווחי חזרות, נפח, שבוע דילואד). כל אפשרות בשורה אחת, עד 25 מילים, קונקרטית עם שמות תרגילים, ובסופה סיבה קצרה מהנתונים. ' +
      'פורמט: שלוש שורות שמתחילות ב-"1. ", "2. ", "3. ". בלי פתיח, בלי סיכום, בלי אימוג׳י, בעברית פשוטה.'
    const out = String(await ctx.askBrainOnce(prompt, 'sonnet', { label: 'prog-refresh' })).trim()
    const lines = out.split('\n').map((x) => x.trim()).filter((x) => /^[123][.)]\s/.test(x)).slice(0, 3)
    if (lines.length < 3) throw new Error('לא התקבלו 3 הצעות')
    return { lines, text: '*תוכנית: ' + name + ' · ' + weeks + ' שבועות על אותה תבנית' + (stuckN >= STALL_MIN ? ', ' + stuckN + ' תרגילים תקועים' : '') + '*\n' + ctx.stripEmoji(lines.join('\n')) + '\n\nלענות במספר (1/2/3) = נפתחת משימה לבנות לפי האפשרות הזו.' }
  }

  async function run() {
    if (!ctx.config.owner || !ctx.ready()) return
    try {
      const ages = (await ctx.coachApi('dashboardProgAges', [])) || [], s = load(); let sent = 0
      for (const a of ages) {
        const prev = s[a.name]
        if (prev && a.days < prev.days) delete s[a.name] // התוכנית הוחלפה — מתחילים לספור מחדש
        if (a.days < STALL_DAYS || s[a.name] || sent >= 2) continue
        try { const r = await build(a.name, a.days, a.goal, a.days < DUE_DAYS); if (!r) continue; const m = await ctx.client.sendMessage(ctx.config.owner, ctx.toWhatsApp(r.text)); try { ctx.remember(m, { k: 'prog', n: a.name, o: r.lines }) } catch (e) {} s[a.name] = { at: new Date().toISOString(), days: a.days }; sent++; console.log('[prog-refresh] sent', a.name, a.days) }
        catch (e) { console.error('[prog-refresh]', a.name, e.message) }
      }
      save(s)
    } catch (e) { console.error('[prog-refresh]', e.message) }
  }
  return { run, build }
}
