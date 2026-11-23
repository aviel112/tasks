#!/usr/bin/env node
// 23.11.26 (אביאל: "תמונת לפני/אחרי חודשית"): node tools/ba-card.js "<שם>" [--any] → JPEG שחור-זהב: התמונה הראשונה מול האחרונה, אותה זווית.
// רק אם יש 14+ ימים בין התמונות (--any לבדיקת עיצוב). מדפיס: נתיב, ימים, זווית. יציאה 3 = אין זוג מתאים.
const path = require('path'), os = require('os')
const U = 'https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec'
const coach = (fn, args) => fetch(U, { method: 'POST', body: JSON.stringify({ api: 'coach', k: 'c7dfe880cf024fc59fcc9a8a', fn, args: args || [] }) }).then((r) => r.json()).then((j) => j.ok ? j.r : null).catch(() => null)
const f1 = (n) => (Math.round(Math.abs(n) * 10) / 10).toLocaleString('he-IL')
async function baCard(name, any = false) {
  const card = await coach('dashboardClientCard', [name]); if (!card || !card.token) return null
  const list = await fetch(`${U}?api=photos&t=${card.token}`).then((r) => r.json()).then((j) => j.ok ? j.r : []).catch(() => [])
  const ds = [...new Set(list.map((x) => x.d))].sort(); if (!ds.length) return null
  const d0 = ds[0], d1 = ds[ds.length - 1], gap = Math.round((Date.parse(d1) - Date.parse(d0)) / 864e5)
  if (!any && gap < 14) return null
  let pick = null
  for (const pose of ['חזית', 'צד ימין', 'צד שמאל', 'גב', '']) { const a = list.find((x) => x.d === d0 && x.pose === pose), b = [...list].reverse().find((x) => x.d === d1 && x.pose === pose); if (a && b && (any || a !== b)) { pick = { pose, a, b }; break } }
  if (!pick) return null
  const diff = card.first != null && card.last != null ? card.last - card.first : null, loss = /ירידה|חיטוב/.test(card.goal || '')
  const dt = (d) => d.split('-').reverse().slice(0, 2).join('.')
  const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>*{margin:0;box-sizing:border-box}body{width:1080px;height:1350px;background:#0b0b0d;color:#f2efe8;font-family:-apple-system,"SF Hebrew","Arial Hebrew",Arial,sans-serif;display:flex;flex-direction:column;align-items:center;padding:70px 60px}
.br{font-size:30px;letter-spacing:.35em;color:#d4ac5b;font-weight:700}.nm{font-size:54px;font-weight:800;margin-top:18px}.row{display:flex;gap:28px;margin-top:46px}.ph{display:flex;flex-direction:column;align-items:center;gap:16px}
.ph img{width:466px;height:760px;object-fit:cover;border-radius:26px;background:#151519}.lb{font-size:44px;font-weight:800;color:#d4ac5b}.dt{font-size:30px;color:#9d9aa6}.res{margin-top:40px;font-size:56px;font-weight:800}</style></head><body>
<div class="br">AVIEL</div><div class="nm">${String(name).split(' ')[0]} · ${gap} ימים</div>
<div class="row"><div class="ph"><img src="${pick.a.data}"><div class="lb">לפני</div><div class="dt">${dt(d0)}</div></div><div class="ph"><img src="${pick.b.data}"><div class="lb">אחרי</div><div class="dt">${dt(d1)}</div></div></div>
${diff ? `<div class="res" style="color:${(loss ? diff < 0 : diff > 0) ? '#7fd19b' : '#f2efe8'}">${diff < 0 ? 'ירד' : 'עלה'} ${f1(diff)} ק״ג</div>` : ''}</body></html>`
  const out = path.join(os.tmpdir(), `ba-${Date.now()}.jpg`)
  const puppeteer = require(path.join(__dirname, '..', 'node_modules', 'puppeteer'))
  const br = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] }); const pg = await br.newPage(); await pg.setViewport({ width: 1080, height: 1350 }); await pg.setContent(html, { waitUntil: 'load' }); await pg.screenshot({ path: out, type: 'jpeg', quality: 88 }); await br.close()
  return { path: out, gap, pose: pick.pose, d0, d1 }
}
module.exports = { baCard }
if (require.main === module) baCard(process.argv[2], process.argv.includes('--any')).then((r) => { if (!r) { console.error('אין זוג תמונות מתאים (צריך 14+ ימים בין התמונות)'); process.exit(3) } console.log(r.path); console.log(`${r.gap} ימים · ${r.pose || 'בלי זווית'}`) }).catch((e) => { console.error(e.message); process.exit(1) })
