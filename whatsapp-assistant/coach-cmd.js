// פקודות מאמן בווטסאפ (29.10.26, אביאל: "שתהיה לי דרך פשוט לכתוב בווטסאפ — להוסיף קלוריות או משהו — בלי לעשות כלום ידנית")
// "ליהב יעד 1400 קלוריות" / "תוסיף למאגר טונה 110 קלוריות 25 חלבון" / "תשלח לשון שימלא צ'ק-אין" → העוזרת מבינה (השרת, Gemini), שואלת "בצע / בטל", ומבצעת.
// לא פקודה → ממשיך לשיחה הרגילה עם העוזרת.
const API = 'https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec', KEY = 'c7dfe880cf024fc59fcc9a8a'
let D = {}, FIRST = [], FULL = [], namesAt = 0, PENDING = null, MSWAIT = null
const OK0 = /^(בצע|תבצע|כן בצע|בצעי|לבצע)$/, NO0 = /^(בטל|תבטל|עזוב|לא לבצע)$/
// 21.11.26 (אביאל: "אישורים בהקלדה"): בשלוש הדקות אחרי השאלה מספיק "1" / "כן" (או "2" / "לא"), בלי ציטוט
const LOOSE_OK = /^(1|כן|אוקי|סבבה|יאללה|מאשר)[.!]?$/, LOOSE_NO = /^(2|לא)[.!]?$/
const fresh = () => !!(PENDING && Date.now() - PENDING.at < 3 * 60000)
const OK = { test: (t) => OK0.test(t) || (fresh() && LOOSE_OK.test(t)) }, NO = { test: (t) => NO0.test(t) || (fresh() && LOOSE_NO.test(t)) }
const ACT = /יעד|קלור|צעד|מים|ליטר|משקל|תשלח|תשלחי|תזכיר|תזכירי|הודעה|תכתוב|תכתבי|דגש|פוקוס|לשבוע/
async function coach(fn, args) { const r = await fetch(API, { method: 'POST', body: JSON.stringify({ api: 'coach', k: KEY, fn, args: args || [] }) }); const j = await r.json(); if (!j.ok) throw new Error(j.error || 'שגיאה'); return j.r }
async function names() { if (Date.now() - namesAt < 36e5 && FIRST.length) return FIRST; try { const p = await coach('dashboardPulse'); FULL = Object.keys(p || {}); FIRST = FULL.map((n) => n.split(' ')[0]).filter((n) => n.length >= 2); namesAt = Date.now() } catch {} return FIRST }
function isCandidate(t, quoted) { t = String(t || '').trim(); if (!t) return false
  if (PENDING && Date.now() - PENDING.at < 10 * 60000 && (OK0.test(t) || NO0.test(t) || (!quoted && (OK.test(t) || NO.test(t))))) return true
  if (MSWAIT && Date.now() - MSWAIT.at < 10 * 60000 && FIRST.some((n) => nameRe(n).test(t))) return true
  if (t.length <= 1500 && isMeasure(t)) return true
  if (t.length > 400) return false
  if (/למאגר|תוסיף מאכל|תכניס מאכל|מאכל חדש/.test(t)) return true
  if (!ACT.test(t)) return false
  return FIRST.some((n) => new RegExp('(^|[\\s,])[לשבו]?' + n + '(?=$|[\\s,.?!])').test(t)) }

// ── היקפים (3.11.26, אביאל: "שאשלח לה והיא תכניס את זה") ── הודעה עם 3+ שורות "איבר מספר" (+ שם מתאמן) → בצע/בטל → dashboardMeasureSave
const MS_STD = ['בטן', 'חזה', 'כתפיים', 'יד ימין', 'יד שמאל', 'ירך ימין', 'ירך שמאל', 'ישבן', 'צוואר', 'מותן']
const nameRe = (n) => new RegExp('(^|[\\s,])[לשבו]?' + n + '(?=$|[\\s,.?!:])')
function msLines(t) { const out = []
  String(t || '').split(/\n|,(?!\d)/).forEach((ln) => { ln = ln.trim(); const m = ln.match(/^(.*?)[\s:=\-–]*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:ס["״']?מ|cm)?\.?\s*$/i); if (!m) return
    const lab = m[1].replace(/\([^)]*\)?/g, ' ').replace(/[^֐-׿a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim(), v = parseFloat(m[2].replace(',', '.')); if (lab && lab.length <= 40 && v >= 10 && v <= 250) out.push([lab, v]) })
  return out }
function isMeasure(t) { return msLines(t).length >= 3 || (/היקפ/.test(t) && msLines(t).length >= 1) }
function whoIn(t) { const f = FIRST.filter((n) => nameRe(n).test(t)); if (f.length !== 1) return null; return FULL.find((x) => x.split(' ')[0] === f[0]) || null }
function mapLabel(lab, known) { const ws = (x) => x.split(' ').filter(Boolean), L = ws(lab)
  let best = known.find((k) => k === lab); if (best) return best
  known.filter((k) => !/ממוצע/.test(k)).forEach((k) => { const K = ws(k); if (K.every((w) => L.includes(w)) && (!best || K.length > ws(best).length)) best = k })
  return best || L.slice(0, 2).join(' ') }
async function msPrepare(name, t) { let known = []; try { const c = await coach('dashboardClientCard', [name]); known = ((c && c.measures && c.measures.labels) || []).slice() } catch {}
  const pool = known.concat(MS_STD.filter((x) => !known.includes(x))), vals = {}
  msLines(t).forEach(([lab, v]) => { if (FIRST.some((n) => lab === n || lab.startsWith(n + ' '))) return; vals[mapLabel(lab, pool)] = v })
  known.filter((k) => /\(ממוצע\)/.test(k)).forEach((k) => { const b = k.replace(/\s*\(ממוצע\)/, '').trim(), r = vals[b + ' ימין'], l = vals[b + ' שמאל']; if (r != null && l != null) vals[k] = Math.round((r + l) / 2 * 100) / 100 })
  const d = new Date(), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  const fresh = Object.keys(vals).filter((k) => !pool.includes(k))
  return { action: 'measure', name, day, vals, say: 'היקפים ל' + name.split(' ')[0] + ' (' + day.slice(8) + '/' + day.slice(5, 7) + '):', fresh } }
const fmtMs = (c) => Object.keys(c.vals).filter((k) => !/ממוצע/.test(k)).map((k) => k + ' ' + c.vals[k]).join('\n') + (c.fresh && c.fresh.length ? '\n\nחדש בטבלה: ' + c.fresh.join(', ') : '')
const fmt = (c) => c.action === 'measure' ? fmtMs(c) : c.action === 'food' && c.food ? `${c.food.name}: ${c.food.k100} קק״ל ל-100 ג׳, ח׳ ${c.food.p || 0}, פ׳ ${c.food.c || 0}, ש׳ ${c.food.fat || 0}` : `${c.name.split(' ')[0]}: ${c.value}`
async function exec(c) { const n = c.name, num = Number(String(c.value).replace(/[^\d.]/g, ''))
  switch (c.action) {
    case 'steps': return coach('dashboardStepsGoal', [n, num])
    case 'kcal': return coach('dashboardKcalSet', [n, num])
    case 'water': return coach('dashboardWaterGoal', [n, num])
    case 'goalKg': return coach('dashboardGoalKg', [n, num])
    case 'focus': return coach('dashboardFocus', [n, c.value])
    case 'note': return coach('dashboardNote', [n, c.value])
    case 'wa': if (!c.phone) throw new Error('אין טלפון בכרטיס'); return coach('dashboardWaSend', [c.phone, c.value, n])
    case 'food': return coach('dashboardFoodAddManual', [c.food])
    case 'measure': return coach('dashboardMeasureSave', [n, c.day, c.vals])
  } throw new Error('פעולה לא מוכרת') }
const n1 = (c) => c.name.split(' ')[0]
async function msAsk(c) { if (!Object.keys(c.vals).length) return false; PENDING = { cmd: c, at: Date.now() }; await D.client.sendMessage(D.config.owner, D.toWhatsApp(c.say + '\n' + fmtMs(c) + '\n\nלהכניס? *1* כן · *2* לא')).catch(() => {}); return true }
async function handle(t) { t = String(t || '').trim(); const say = (x) => D.client.sendMessage(D.config.owner, D.toWhatsApp(x)).catch(() => {})
  if (PENDING && (OK.test(t) || NO.test(t))) { const c = PENDING.cmd, no_ = NO.test(t); PENDING = null
    if (no_) { await say('בוטל.'); return true }
    try { await exec(c); await say(c.action === 'measure' ? 'בוצע. ההיקפים של ' + n1(c) + ' נכנסו לאפליקציה ולטבלה.' : 'בוצע. ' + (c.say || fmt(c))) } catch (e) { await say('לא בוצע: ' + e.message) } return true }
  if (MSWAIT && Date.now() - MSWAIT.at < 10 * 60000) { const who = whoIn(t); if (who && !isMeasure(t)) { const src = MSWAIT.t; MSWAIT = null; await names(); return msAsk(await msPrepare(who, src)) } }
  if (isMeasure(t)) { await names(); const who = whoIn(t); if (!who) { MSWAIT = { t, at: Date.now() }; await say('קיבלתי ' + msLines(t).length + ' היקפים. של מי?'); return true } return msAsk(await msPrepare(who, t)) }
  let c; try { c = await coach('dashboardTextCmd', [t]) } catch (e) { console.error('[coach-cmd]', e.message); return false }
  if (!c || c.action === 'none') return false
  if (c.action === 'food' ? !(c.food && c.food.name && c.food.k100) : !c.name) { if (c.action !== 'food' && !c.name) await say('לא זיהיתי למי. כתוב שוב עם השם של המתאמן/ת.'); else await say('חסרים ערכים. למשל: "תוסיף למאגר טונה 110 קלוריות 25 חלבון 1 שומן"'); return true }
  if ((c.action === 'note' || c.action === 'wa' || c.action === 'focus') ? !c.value : !(c.action === 'food' || Number(String(c.value).replace(/[^\d.]/g, '')) > 0)) return false
  PENDING = { cmd: c, at: Date.now() }
  await say((c.say || 'לבצע:') + '\n' + fmt(c) + ((c.action === 'wa' || c.action === 'note') ? '' : '') + '\n\nלבצע? *1* כן · *2* לא'); return true }
module.exports = { init: (d) => { D = d; names() }, isCandidate, handle, names, hasPending: () => !!(PENDING && Date.now() - PENDING.at < 10 * 60000) }
