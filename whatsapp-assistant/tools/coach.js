#!/usr/bin/env node
// 23.11.26: קריאה ישירה לשרת המאמן מהמסוף — בשביל המוח המלא (הצ'אט הפרטי) ו-Claude Code.
// שימוש: node whatsapp-assistant/tools/coach.js <fn> '<JSON של מערך ארגומנטים>'
//   node whatsapp-assistant/tools/coach.js dashboardClientCard '["תמיר קורציאה"]'
//   node whatsapp-assistant/tools/coach.js plan <token>      ← מה האפליקציה רואה (תפריט/תוכנית)
//   node whatsapp-assistant/tools/coach.js data <token>      ← נתוני הבית (צעדים, שקילות, photoDue) — לא מסמן כניסה
const U = 'https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec'
const [fn, raw] = process.argv.slice(2)
if (!fn) { console.error('חסר שם פונקציה'); process.exit(2) }
const out = (j) => { console.log(JSON.stringify(j, null, 1).slice(0, 60000)); process.exit(j && j.ok === false ? 1 : 0) }
;(async () => {
  if (fn === 'plan' || fn === 'data') return out(await fetch(`${U}?api=${fn}&t=${encodeURIComponent(raw || '')}`).then((r) => r.json()))
  let args = []; try { args = raw ? JSON.parse(raw) : [] } catch (e) { console.error('הארגומנטים חייבים להיות JSON של מערך'); process.exit(2) }
  if (!Array.isArray(args)) args = [args]
  out(await fetch(U, { method: 'POST', body: JSON.stringify({ api: 'coach', k: 'c7dfe880cf024fc59fcc9a8a', fn, args }) }).then((r) => r.json()))
})().catch((e) => { console.error(e.message); process.exit(1) })
