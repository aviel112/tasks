// 22.11.26 (אביאל: "סטורי הוכחה מוכן"): תמונת סטורי 1080x1920 שחור-זהב עם תוצאה של מתאמן/ת — בלי שם, רק מספרים.
// סגנון: שחור + זהב דק, מותג אביאל, בלי glow ובלי גרדיאנט בטקסט. נוצר עם puppeteer (עברית תקינה מימין לשמאל).
const fs = require('fs'), path = require('path')
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
function html({ big, bigLabel, liftEx, liftKg, liftDiff, fem }) {
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box} body{width:1080px;height:1920px;background:#0b0b0b;color:#f3efe6;font-family:"SF Hebrew","Arial Hebrew",Arial,sans-serif;display:flex;flex-direction:column;justify-content:space-between;padding:150px 96px 140px}
  .tag{font-size:40px;letter-spacing:0;color:#c9a55c;border-top:2px solid #c9a55c;padding-top:28px;width:fit-content}
  .big{display:flex;align-items:baseline;gap:28px;justify-content:flex-start}.big .n{font-size:260px;font-weight:700;line-height:1;direction:ltr;unicode-bidi:isolate}.big .u{font-size:90px;color:#c9a55c}
  .lbl{font-size:56px;color:#b9b2a3;margin-top:24px}
  .row{border-top:1px solid #3a352b;padding-top:40px;margin-top:70px}
  .row .k{font-size:44px;color:#c9a55c}
  .row .v{font-size:76px;font-weight:700;margin-top:10px}
  .foot{font-size:38px;color:#8c8679;display:flex;justify-content:space-between;border-top:1px solid #3a352b;padding-top:32px}
  .foot b{color:#c9a55c;font-weight:500}
  </style></head><body>
  <div class="tag">${fem ? 'מתאמנת שלי' : 'מתאמן שלי'} · השבוע</div>
  <div><div class="big"><span class="n">${esc(big)}</span><span class="u">ק״ג</span></div><div class="lbl">${esc(bigLabel)}</div>
  ${liftEx ? `<div class="row"><div class="k">ובאותו שבוע, שיא חדש</div><div class="v">${esc(liftEx)}</div><div class="lbl"><bdi dir="ltr">${esc(liftKg)}</bdi> ק״ג · <bdi dir="ltr">+${esc(liftDiff)}</bdi> מהשיא הקודם</div></div>` : ''}</div>
  <div class="foot"><span>אימון אחד על אחד</span><b>אביאל עמירה</b></div></body></html>`
}
async function render(opts, outName) {
  const puppeteer = require('puppeteer')
  const out = path.join(__dirname, 'stories', outName)
  const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  try { const p = await b.newPage(); await p.setViewport({ width: 1080, height: 1920 }); await p.setContent(html(opts), { waitUntil: 'load' }); await p.screenshot({ path: out, type: 'png' }) } finally { await b.close() }
  return out
}
// f = עובדות השבוע (dashboardWeekFacts). מחזיר נתונים לסטורי או null
function storyData(f) {
  if (!f || !f.diff || !(f.up && f.up.length)) return null
  const kg = Math.abs(f.diff), u = f.up[0]
  return { big: (f.diff > 0 ? '+' : '−') + kg, bigLabel: f.goal === 'עלייה' ? 'עלייה בממוצע השבועי, בדיוק לפי התוכנית' : 'ירידה בממוצע השבועי', liftEx: u.ex, liftKg: u.now, liftDiff: u.diff }
}
module.exports = { render, storyData, html }
