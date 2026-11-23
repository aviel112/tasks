#!/usr/bin/env node
// 23.11.26 (אביאל: "כרטיס מתאמן כתמונה"): node whatsapp-assistant/tools/trainee-card.js "<שם>" → PNG שחור-זהב + שורת סיכום
// נתונים: לוח (כרטיס, שבוע, כניסות) + נתוני האפליקציה (?api=data — לא מסמן כניסה). לא ממציא: מה שחסר מוצג כ"—".
const fs = require('fs'), path = require('path'), os = require('os')
const U = 'https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec'
const coach = (fn, args) => fetch(U, { method: 'POST', body: JSON.stringify({ api: 'coach', k: 'c7dfe880cf024fc59fcc9a8a', fn, args: args || [] }) }).then((r) => r.json()).then((j) => j.ok ? j.r : null).catch(() => null)
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const f1 = (n) => (Math.round(n * 10) / 10).toLocaleString('he-IL')
const ilDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
;(async () => {
  const q = String(process.argv[2] || '').trim(); if (!q) { console.error('חסר שם'); process.exit(2) }
  const list = await coach('dashboardList'); const all = (list && list.clients) || []
  const c = all.find((x) => x.name === q) || all.find((x) => x.name.startsWith(q + ' ') || x.name.split(' ')[0] === q) || all.find((x) => x.name.includes(q))
  if (!c) { console.error('לא מצאתי מתאמן בשם הזה'); process.exit(1) }
  const [card, wf] = await Promise.all([coach('dashboardClientCard', [c.name]), coach('dashboardWeekFacts', [c.name])])
  const d = card && card.token ? await fetch(`${U}?api=data&t=${card.token}`).then((r) => r.json()).then((j) => j.ok ? j.r : null).catch(() => null) : null
  const today = ilDay(), daysIn = c.start ? Math.round((Date.parse(today) - Date.parse(c.start)) / 864e5) : null
  const spark = ((card && card.spark) || []).map((x) => +x.kg).filter((x) => x > 0)
  const first = card && card.first, last = card && card.last, diff = first && last ? last - first : null
  const loss = /ירידה|חיטוב/.test(c.goal || (card && card.goal) || '')
  const good = diff == null ? null : loss ? diff < 0 : diff > 0
  const wk = (d && d.week) || [], sg = (d && +d.stepsGoal) || 0, stepsDays = wk.filter((x) => x.steps != null), stepsAvg = stepsDays.length ? Math.round(stepsDays.reduce((a, x) => a + +x.steps, 0) / stepsDays.length) : null
  const ups = ((wf && wf.up) || []).slice(0, 3)
  const miss = []
  if (!(c.seen && (c.seen.d || c.seen.at))) miss.push('עוד לא נכנס/ה לאפליקציה')
  if (card && !(card.blood || card.bloodFile || (card.bloodFiles || []).length || card.bloodPending)) miss.push('בדיקות דם')
  if (d && d.photoDue) miss.push('תמונות')
  if (wf && wf.weighs != null && wf.weighs < 3) miss.push(`רק ${wf.weighs} שקילות השבוע`)
  // גרף משקל
  let svg = ''
  if (spark.length >= 2) { const W = 920, H = 220, P = 14, mn = Math.min(...spark), mx = Math.max(...spark), rg = mx - mn || 1
    const pts = spark.map((v, i) => [Math.round(P + i / (spark.length - 1) * (W - 2 * P)), Math.round(H - 20 - (v - mn) / rg * (H - 40))])
    svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><polyline fill="none" stroke="#d4ac5b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" points="${pts.map((p) => p.join(',')).join(' ')}"/>${pts.map((p, i) => i === pts.length - 1 ? `<circle cx="${p[0]}" cy="${p[1]}" r="11" fill="#d4ac5b"/>` : '').join('')}</svg>` }
  const tile = (lbl, val, sub, col) => `<div class="t"><div class="l">${esc(lbl)}</div><div class="v"${col ? ` style="color:${col}"` : ''}>${val}</div><div class="s">${esc(sub || '')}</div></div>`
  const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1350px;background:#0b0b0d;color:#f2efe8;font-family:-apple-system,"SF Hebrew","Arial Hebrew",Arial,sans-serif;padding:80px 80px;display:flex;flex-direction:column;gap:48px}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #2a2a30;padding-bottom:28px}.nm{font-size:76px;font-weight:800;line-height:1}.meta{font-size:30px;color:#9d9aa6;margin-top:14px}.brand{font-size:26px;letter-spacing:.3em;color:#d4ac5b;font-weight:700}
.big{display:flex;align-items:baseline;gap:22px}.big b{font-size:150px;font-weight:800;line-height:1}.big span{font-size:40px;color:#9d9aa6}.chg{font-size:44px;font-weight:700}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px}.t{background:#151519;border-radius:28px;padding:30px 30px}.l{font-size:26px;color:#9d9aa6}.v{font-size:58px;font-weight:800;margin-top:8px}.s{font-size:24px;color:#9d9aa6;margin-top:6px}
.lifts{background:#151519;border-radius:28px;padding:30px 34px;display:flex;flex-direction:column;gap:14px}.lifts h3{font-size:28px;color:#d4ac5b;font-weight:700}.lr{display:flex;justify-content:space-between;font-size:34px}.lr b{color:#7fd19b}
.miss{font-size:32px;color:#e8b04a}.miss b{color:#f2efe8}</style></head><body>
<div class="top"><div><div class="nm">${esc(c.name)}</div><div class="meta">${daysIn != null ? `${daysIn} ימים בליווי` : ''}${c.goal ? ' · ' + esc(c.goal) : ''}</div></div><div class="brand">AVIEL</div></div>
<div><div class="big"><b>${last ? f1(last) : '—'}</b><span>ק״ג ממוצע</span>${diff != null ? `<span class="chg" style="color:${good ? '#7fd19b' : '#e86b5a'}">${diff > 0 ? 'עלה' : diff < 0 ? 'ירד' : 'ללא שינוי'} ${diff ? f1(Math.abs(diff)) + ' מההתחלה' : ''}</span>` : ''}</div>${svg}</div>
<div class="grid">${tile('שקילות השבוע', wf && wf.weighs != null ? wf.weighs + '/7' : '—', '')}${tile('אימונים השבוע', wf && wf.trains != null ? String(wf.trains) : '—', '')}${tile('צעדים ביום', stepsAvg != null ? stepsAvg.toLocaleString('he-IL') : '—', sg ? 'יעד ' + sg.toLocaleString('he-IL') : '', stepsAvg != null && sg ? (stepsAvg >= sg ? '#7fd19b' : '#e8b04a') : '')}</div>
${ups.length ? `<div class="lifts"><h3>עלה במשקל השבוע</h3>${ups.map((u) => `<div class="lr"><span>${esc(u.ex)}</span><span>${esc(u.now)} ק״ג <b>עלה ${esc(u.diff)}</b></span></div>`).join('')}</div>` : ''}
${miss.length ? `<div class="miss"><b>חסר:</b> ${miss.map(esc).join(' · ')}</div>` : '<div class="miss" style="color:#7fd19b">הכל מעודכן</div>'}
</body></html>`
  const out = path.join(os.tmpdir(), `card-${Date.now()}.png`)
  const puppeteer = require(path.join(__dirname, '..', 'node_modules', 'puppeteer'))
  const br = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] }); const pg = await br.newPage(); await pg.setViewport({ width: 1080, height: 1350 }); await pg.setContent(html, { waitUntil: 'load' }); await pg.screenshot({ path: out }); await br.close()
  console.log(out)
  console.log(`${c.name}: ${last ? f1(last) + ' ק"ג' : 'אין שקילות'}${diff != null ? ` (${diff > 0 ? 'עלה' : 'ירד'} ${f1(Math.abs(diff))} מההתחלה)` : ''}, ${wf && wf.trains != null ? wf.trains + ' אימונים השבוע' : ''}${stepsAvg != null ? ', ' + stepsAvg + ' צעדים ביום' : ''}${miss.length ? '. חסר: ' + miss.join(', ') : ''}`)
})().catch((e) => { console.error(e.message); process.exit(1) })
