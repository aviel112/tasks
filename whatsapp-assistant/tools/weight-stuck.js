#!/usr/bin/env node
// 23.11.26 (אביאל: "מי לא עלה במשקל בכלל או לא ירד — שאדע להגיד להם"): ממוצע השבוע מול השבוע הקודם, לפי המטרה של כל מתאמן.
// בלי משפחה/בדיקה. מי שנשקל פחות מ-3 פעמים — ברשימה נפרדת (הממוצע לא אמין). הדפסה = הודעה מוכנה לוואטסאפ.
const U = 'https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec'
const coach = (fn, args) => fetch(U, { method: 'POST', body: JSON.stringify({ api: 'coach', k: 'c7dfe880cf024fc59fcc9a8a', fn, args: args || [] }) }).then((r) => r.json()).then((j) => j.ok ? j.r : null).catch(() => null)
const f1 = (n) => (Math.round(Math.abs(n) * 10) / 10).toLocaleString('he-IL')
async function weightStuck() {
  const [list, tags] = await Promise.all([coach('dashboardList'), coach('dashboardTagsAll')])
  const act = ((list && list.clients) || []).filter((c) => c.status === 'פעיל' && !((tags || {})[c.name] || []).some((t) => t === 'משפחה' || t === 'בדיקה'))
  const stuck = [], few = [], ok = []
  for (const c of act) {
    const f = await coach('dashboardWeekFacts', [c.name]); if (!f) continue
    const goal = f.goal || c.goal || '', up = /עלי/.test(goal), down = /ירידה|חיטוב/.test(goal); if (!up && !down) continue
    if (!f.weighs || f.weighs < 3 || f.diff == null) { few.push(`${c.name} (${f.weighs || 0} שקילות)`); continue }
    const bad = down ? f.diff >= 0 : f.diff <= 0
    const line = `${c.name} — ${down ? 'מטרה ירידה' : 'מטרה עלייה'}, ממוצע ${f.avg}: ${f.diff > 0 ? 'עלה ' + f1(f.diff) : f.diff < 0 ? 'ירד ' + f1(f.diff) : 'לא זז'} מהשבוע שעבר`
    ;(bad ? stuck : ok).push(line)
  }
  let t = '*משקל השבוע — מי לא זז לכיוון המטרה*\n\n'
  t += stuck.length ? stuck.join('\n') : 'כולם זזו לכיוון המטרה השבוע.'
  if (few.length) t += '\n\n*נשקלו פחות מ-3 פעמים* (הממוצע לא אמין, קודם להחזיר אותם לשקילות):\n' + few.join('\n')
  if (ok.length) t += `\n\n_${ok.length} מתאמנים בכיוון הנכון._`
  return { text: t, stuck: stuck.length, few: few.length, ok: ok.length }
}
module.exports = { weightStuck }
if (require.main === module) weightStuck().then((r) => console.log(r.text)).catch((e) => { console.error(e.message); process.exit(1) })
