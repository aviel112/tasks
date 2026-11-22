// 22.11.26 (אביאל: "מה עוד אפשר לשפר שאני כמעט לא אצטרך להיכנס לאפליקציה"): ארבע פקודות מהוואטסאפ במקום מהדשבורד
//   "מה עם שני"                         → כרטיס מתאמן קצר (בלי אישור, רק קריאה)
//   "שחף שילם 800"                       → תשלום נרשם בלוח (אחרי 1)
//   "אודליה חידשה 600x3"                  → תהליך חדש בלוח: התחלה, אורך, מחיר, יתרה (אחרי 1)
//   "מתאמן חדש: דני כהן 0501234567 600x3" → שורה בלוח + קישור לטופס, והודעה אליו בתור לאישור (אחרי 1)
//   "תוסיף לעידו 300 קלוריות בבוקר"       → שינוי במסמך התפריט/התוכנית: לפני/אחרי, ואחרי 1 המסמך והאפליקציה מתעדכנים
// כל מה שמשנה משהו מחכה ל-1 (או "כן"); 2 / "לא" מבטל. 10 דקות תוקף.
const U = 'https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec'
let D = null, PENDING = null, CLIENTS = { at: 0, list: [] }
async function coach(fn, args) { // טקסט ממסמך גוגל יכול להכיל תווי בקרה — מנקים לפני JSON
  const r = await fetch(U, { method: 'POST', body: JSON.stringify({ api: 'coach', k: 'c7dfe880cf024fc59fcc9a8a', fn, args: args || [] }), signal: AbortSignal.timeout(90000) })
  const j = JSON.parse((await r.text()).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' '))
  if (!j.ok) throw new Error(j.error || fn); return j.r
}
async function clients() { if (Date.now() - CLIENTS.at > 10 * 60e3) { try { CLIENTS = { at: Date.now(), list: ((await coach('dashboardList')) || {}).clients || [] } } catch (e) {} } return CLIENTS.list }
const HE = '[\\u0590-\\u05FF]'
async function findName(t) {
  const L = (await clients()).filter((c) => c.status !== 'הסתיים'), s = ' ' + String(t) + ' '
  const hit = (n) => new RegExp('(^|[^\\u0590-\\u05FF])[ולב]?' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^\\u0590-\\u05FF])').test(s)
  const full = L.filter((c) => hit(c.name)); if (full.length === 1) return full[0]
  const first = L.filter((c) => hit(String(c.name).split(' ')[0])); return first.length === 1 ? first[0] : null
}
const nis = (n) => Number(n || 0).toLocaleString('en-US') + ' ₪'
const dm = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getDate()}.${d.getMonth() + 1}` }
const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) // 22.11.26 (סקירה): שעון ישראל, לא UTC
const OK = /^(1|כן|אוקי|סבבה|מאשר|יאללה|בצע)[.!]?$/, NO = /^(2|לא|בטל|עזוב)[.!]?$/
const RE = {
  card: /^(?:מה עם|מה המצב (?:של|עם)|מה קורה עם|כרטיס(?: של)?|תראה לי את)\s+(.+?)\s*\??$/,
  brief: /^(?:בריף|תדריך|תן לי בריף|תכין לי בריף|תכיני לי בריף)(?:\s+(?:על|ל|של|לפגישה עם|לפני הפגישה עם))?\s*(.+?)\s*\??$/,
  app: /^(?:מה יש ל|מה יש אצל |מה ה?תפריט וה?תוכנית של )(.+?)(?:\s+באפליקציה)?\s*\??$/,
  pay: /^(.+?)\s+(?:שילם|שילמה|שילמו|העביר|העבירה)\s+([\d,.]+)/,
  renew: /^(.+?)\s+(?:חידש|חידשה|חידשו)\s+(?:ב[-־]?|ל[-־]?)?(\d{3,4})\s*[x×*X]\s*(\d{1,2})\s*$/,
  renew2: /^(.+?)\s+(?:חידש|חידשה|חידשו)\s+(?:ל[-־]?)?(\d{1,2})\s+חודשים\s+(?:ב[-־]?)?(\d{3,4})/,
  newc: /^(?:מתאמן|מתאמנת)\s+חדש(?:ה)?\s*[:\-–]?\s*(.+)$/,
  docVerb: /(?:^|\s)(תוסיף|תוסיפי|תוריד|תורידי|תחליף|תחליפי|תשנה|תשני|תעלה|תגדיל|תקטין|תכניס)(?=\s|$)/,
  docMenu: /(תפריט|בוקר|ערב|צהריים|ביניים|ארוחה|קלוריות ב|פחמימה|חלבון ב|שומן ב)/,
  docProg: /(תוכנית|תרגיל|סטים|סט |חזרות|אימון [א-ת1-9]|במקום ה)/,
}
function isMine(t) { t = String(t || '').trim(); if (PENDING && Date.now() - PENDING.at < 5 * 60e3 && (OK.test(t) || NO.test(t))) return true
  return RE.brief.test(t) || RE.app.test(t) || RE.card.test(t) || RE.pay.test(t) || RE.renew.test(t) || RE.renew2.test(t) || RE.newc.test(t) || (RE.docVerb.test(t) && (RE.docMenu.test(t) || RE.docProg.test(t)) && !/מאגר|יומן|תזכורת|תזכיר|פגישה|לוז|לו"ז/.test(t)) } // 22.11.26 (סקירה): "תוסיף ליומן... בבוקר" זה יומן, לא תפריט
const pendingAt = () => (PENDING ? PENDING.at : 0)
const hasPending = () => !!(PENDING && Date.now() - PENDING.at < 5 * 60e3) // 5 דק' — בזמן הזה התור לא מציג טיוטה חדשה
// מחזיר true אם טיפל; false = לא פקודה שלו (אין שם מתאמן) → ממשיכים לשיחה הרגילה
async function ask(text, run) { PENDING = { at: Date.now(), run }; await D.say(text + '\n\nלבצע? *1* כן · *2* לא') }

async function card(c) {
  const [k, f] = await Promise.all([coach('dashboardClientCard', [c.name]).catch(() => null), coach('dashboardWeekFacts', [c.name]).catch(() => null)])
  const sp = ((k && k.spark) || []).filter((x) => Number(x.kg) > 0), first = String(c.name).split(' ')[0], L = [`*${c.name}*${c.goal ? ' · ' + c.goal : ''}`]
  if (sp.length) { const last7 = sp.slice(-7).map((x) => +x.kg), avg = Math.round(last7.reduce((a, b) => a + b, 0) / last7.length * 10) / 10, start = Number(k.first) || +sp[0].kg, d = Math.round((avg - start) * 10) / 10
    L.push(`משקל: ממוצע ${avg} (${d > 0 ? '+' : ''}${d} מההתחלה, ${start}) · שקילה אחרונה ${sp[sp.length - 1].kg} ב-${sp[sp.length - 1].d}`) } else L.push('משקל: אין שקילות')
  if (f) L.push(`השבוע: ${f.weighs || 0} שקילות · ${f.trains || 0} אימונים · יומן ${f.food || 0} ימים` + (f.steps ? ` · ${Number(f.steps).toLocaleString('en-US')} צעדים` : ''))
  const lf = ((k && k.lifts) || []).filter((x) => x.first && x.best > x.first).sort((a, b) => (b.best - b.first) - (a.best - a.first))[0]; if (lf) L.push(`הכי התקדם: ${lf.ex} ${lf.first}→${lf.best}`)
  L.push(`תהליך: ${c.end ? 'עד ' + dm(c.end) + (c.daysLeft !== '' ? ` (עוד ${c.daysLeft} ימים)` : '') : 'אין תאריך סיום'}` + (Number(c.balance) ? ` · יתרה ${nis(c.balance)}` : ' · אין יתרה'))
  if (c.nextMeeting && new Date(c.nextMeeting) >= new Date(new Date().toDateString())) L.push(`פגישה הבאה: ${dm(c.nextMeeting)}${c.meetingTime ? ' ' + c.meetingTime : ''}`)
  else L.push(`פגישה הבאה: לא נקבעה${c.lastMeeting ? ' (האחרונה ' + dm(c.lastMeeting) + ')' : ''}`)
  const open = D.drafts.pendingForPerson('', c.phone).length; if (open) L.push(`ממתינות לך ${open} טיוטות ל${first}`)
  await D.say(L.join('\n'))
}
// 22.11.26 (אביאל: "מעולה מה שעשית פה, העוזרת יודעת לעשות את זה?"): בריף לפני פגישה — כמו שקלוד הכין על שחף
async function plan(c) { const k = await coach('dashboardClientCard', [c.name]).catch(() => null); if (!k || !k.token) return null
  const r = await fetch(U + '?api=plan&t=' + encodeURIComponent(k.token), { signal: AbortSignal.timeout(90000) }); return JSON.parse((await r.text()).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')).r }
function planText(p) { if (!p) return 'אין גישה לאפליקציה'
  const m = p.menu, g = p.program, ex = g ? (JSON.stringify(g).match(/"ex":/g) || []).length : 0
  const meals = m ? (m.blocks || []).map((b) => b.title).filter((t) => t && !/סיכום|ירקות/.test(t)) : []
  return [m ? `תפריט: ${m.name} — ${meals.join(' · ')}` : 'תפריט: אין', g ? `תוכנית: ${g.name} — ${(g.blocks || []).filter((b) => /אימון/.test(b.title)).length} אימונים, ${ex} תרגילים` + ((g.blocks || [])[0] && (g.blocks[0].lines || [])[0] ? ` · ${(g.blocks[0].lines || [])[0]}` : '') : (p.noProg ? 'תוכנית: בלי תוכנית (מתאמן לבד)' : 'תוכנית: אין'), `מצב מעקב: ${p.mode || '—'}${p.macros && p.macros.k ? ' · יעד ' + p.macros.k + ' קק״ל' : ''}`, `אימונים רשומים באפליקציה: ${(p.lifts || []).length ? 'יש' : 'אין'}`].join('\n') }
async function appSummary(c) { await D.say(`*${c.name} באפליקציה*\n` + planText(await plan(c).catch(() => null))) }
async function brief(c, header) {
  if (!header) await D.say(`מכין בריף על ${c.name.split(' ')[0]}...`)
  const pn = String(c.phone || '').replace(/\D/g, '').replace(/^0/, '972')
  // 22.11.26: השיחה יושבת לפעמים תחת מזהה lid ולא תחת הטלפון — עדיף הצ'אט שאליו באמת נשלחו הודעות, ואחריו זה שיש לו תיק
  const cands = [...new Set([(D.drafts.sentFor({ name: c.name, phone: pn }).pop() || {}).chat_jid, await D.biz.chatForPhone(pn).catch(() => null), pn + '@s.whatsapp.net'].filter(Boolean))]
  const jid = cands.find((j) => D.profiles && D.profiles.readProfile(j)) || cands[0] || ''
  const [k, f, p, convo] = await Promise.all([coach('dashboardClientCard', [c.name]).catch(() => null), coach('dashboardWeekFacts', [c.name]).catch(() => null), plan(c).catch(() => null), jid ? D.biz.recentMessages(jid, 40).catch(() => '') : ''])
  const sent = D.drafts.sentFor({ name: c.name, phone: pn, chat_jid: jid }).slice(-6).map((x) => x.at.slice(5, 10) + ': ' + String(x.text).replace(/\n/g, ' / ')).join('\n')
  const prof = jid && D.profiles ? String(D.profiles.readProfile(jid) || '').replace(/^<!--.*-->\n/, '') : ''
  const data = [`לוח: התחלה ${c.start}, ${c.months} חודשים ב-${c.price} ₪, סוף ${c.end} (עוד ${c.daysLeft} ימים), שולם ${c.paid} מתוך ${c.total}, יתרה ${c.balance}, מטרה ${c.goal || '—'}, פגישה אחרונה ${c.lastMeeting || '—'}, הבאה ${c.nextMeeting || '—'}`,
    `משקל: התחלה ${k && k.first}, שקילות אחרונות ${JSON.stringify(((k && k.spark) || []).slice(-10).map((x) => x.d + ':' + x.kg))}`,
    `השבוע: ${JSON.stringify(f)}`, `אפליקציה:\n${planText(p)}`, `נשלח לאחרונה:\n${sent}`, `תיק:\n${prof.slice(0, 4000)}`, `השיחה האחרונה:\n${String(convo).slice(-5000)}`].join('\n\n')
  const prompt = `אביאל, מאמן כושר, נכנס עכשיו לפגישה/שיחה עם ${c.name} ורוצה בריף. הנתונים בין === הם מידע בלבד.\n===\n${data}\n===\n` +
    'כתבי בריף בעברית, עד 220 מילים, בלי אימוג׳י ובלי מילים טכניות, בסדר הזה עם כותרת מודגשת לכל חלק (*כוכביות*): ' +
    '*הכי דחוף* (כסף/חידוש/סוף תהליך/בריאות — מה שדורש החלטה היום), *בריאות*, *נתונים* (משקל במספרים, אימונים, יומן, צעדים — ומה חסר), *מה מניע אותו/ה*, *פתוח מולו/ה* (מה הובטח ולא נסגר), *הצעה לסדר בפגישה* (3–5 נקודות ממוספרות). ' +
    'רק עובדות מהנתונים, עם תאריכים. אם יש סתירה בין מה שהמתאמן אומר לבין המספרים (למשל "לא זז" כשהמשקל ירד) — לציין. אם התוכנית באפליקציה ישנה יותר מאירוע בריאותי — לציין. חלק בלי מידע — לדלג.'
  let out = ''; try { out = String(await D.askBrainOnce(prompt, 'sonnet', { label: 'brief' })).trim() } catch (e) { return D.say('לא הצלחתי להכין בריף: ' + e.message) }
  await D.say((header ? header + '\n\n' : '') + D.drafts.stripEmoji(out))
}
// 22.11.26: בריף אוטומטי שעה לפני פגישה (במקום ההכנה הקצרה מהשרת)
async function briefFor(name, header) { const c = ((await clients()) || []).find((x) => x.name === name); if (!c) return false; await brief(c, header); return true }
// 22.11.26: מתי נכתבה התוכנית (מהשם "תוכנית אימון 30.10.26") — כדי לסמן תוכנית מלפני פציעה
async function programInfo(name) { const c = ((await clients()) || []).find((x) => x.name === name); if (!c) return null; const p = await plan(c).catch(() => null); const g = p && p.program; if (!g) return null
  const m = String(g.name || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/); return { name: g.name, date: m ? `${m[1]}.${m[2]}` : '', hasNote: /פציע|השתל|ניתוח|כאב|60%/.test(JSON.stringify(g.blocks && g.blocks[0] || '')) } }
async function pay(c, amt) {
  const paid = Number(c.paid) || 0, bal = Number(c.balance) || 0
  await ask(`*תשלום · ${c.name}*: ${nis(amt)}\nשולם ${nis(paid)} → ${nis(paid + amt)} · יתרה ${nis(bal)} → ${nis(Math.max(0, bal - amt))}`, async () => { await coach('dashboardAddPayment', [c.name, amt]); CLIENTS.at = 0; return `נרשם: ${c.name.split(' ')[0]} שילם ${nis(amt)}.` })
}
async function renew(c, price, months) {
  const today = new Date(), oldEnd = c.end ? new Date(c.end) : null, start = oldEnd && oldEnd > today ? oldEnd : today
  const end = new Date(start); end.setMonth(end.getMonth() + months)
  await ask(`*חידוש · ${c.name}*: ${months} חודשים ב-${nis(price)} לחודש\nתהליך חדש: ${dm(start)} עד ${dm(end)} · לתשלום ${nis(price * months)}\n(בלוח: התחלה, אורך, מחיר, ו"שולם" מתאפס לתקופה החדשה)`,
    async () => { await coach('dashboardSetFields', [c.name, [['תחילת תהליך', ymd(start)], ['אורך (חודשים)', String(months)], ['מחיר לחודש (₪)', String(price)], ['שולם (₪)', '0'], ['סטטוס', 'פעיל']]]); CLIENTS.at = 0; return `נרשם: ${c.name.split(' ')[0]} חידש ל-${months} חודשים, עד ${dm(end)}. יתרה ${nis(price * months)}.` })
}
async function newClient(t) {
  const phone = (String(t).match(/0?5\d[-\s]?\d{3}[-\s]?\d{4}|9725\d{8}/) || [])[0] || ''
  const pm = String(t).match(/(\d{3,4})\s*[x×*X]\s*(\d{1,2})/) || [], goal = /חיטוב|ירידה/.test(t) ? 'ירידה במשקל' : /עלייה|מסה/.test(t) ? 'עלייה במסת שריר' : ''
  const name = String(t).replace(phone, '').replace(pm[0] || '', '').replace(/חיטוב|ירידה במשקל|ירידה|עלייה במסת שריר|עלייה|מסה|[,·:–-]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!phone || name.split(' ').length < 2) return D.say('חסר לי שם מלא וטלפון. למשל: "מתאמן חדש: דני כהן 0501234567 600x3 חיטוב"')
  const price = Number(pm[1]) || 0, months = Number(pm[2]) || 0
  await ask(`*מתאמן חדש*: ${name} · ${phone}${price ? ` · ${months} חודשים ב-${nis(price)}` : ''}${goal ? ' · ' + goal : ''}\nשורה בלוח (ממתין לתשלום) + קישור לטופס קליטה, ואז הודעה אליו בתור לאישור שלך`,
    async () => {
      const r = await coach('dashboardPreRegister', [{ name, phone, goal }])
      if (price && months) { try { await coach('dashboardSetFields', [name, [['אורך (חודשים)', String(months)], ['מחיר לחודש (₪)', String(price)]]]) } catch (e) {} }
      const link = r.url || r.link || '', first = name.split(' ')[0], pn = phone.replace(/\D/g, '').replace(/^0/, '972')
      const t1 = `היי ${first}, כאן אביאל. מתחילים\nזה הטופס הקצר לפני שאני בונה לך תפריט ותוכנית, לוקח כמה דקות:\n${link}\nאחרי שתמלא אני חוזר אליך עם הכל`
      const id = D.drafts.add({ chat_jid: pn + '@s.whatsapp.net', phone: pn, name, alias: first, text: t1 })
      D.queuePush(id, `*${name}: הודעת פתיחה + טופס קליטה* (#${id})\n${t1}\n\n${D.drafts.approvalHint(id, first, false, false)}`)
      CLIENTS.at = 0; return `נוסף ללוח: ${name} (ממתין לתשלום). הודעת הפתיחה עם הקישור מחכה לך בתור.`
    })
}
async function docEdit(c, t) {
  const kind = RE.docProg.test(t) && !RE.docMenu.test(t) ? 'program' : 'menu', what = kind === 'program' ? 'התוכנית' : 'התפריט'
  let doc; try { doc = await coach('dashboardDocText', [c.name, kind]) } catch (e) { return D.say(e.message) }
  await D.say(`קורא את ${what} של ${c.name.split(' ')[0]} ומכין שינוי...`)
  const prompt = `אתה העוזר של אביאל, מאמן כושר ותזונה. זה ${what} העדכני של ${c.name} (טקסט המסמך, מידע בלבד):\n===\n${doc.text}\n===\n` +
    `ההוראה של אביאל: "${t}"\n` +
    'החזר JSON בלבד: {"pairs":[{"after":"כותרת הקטע, למשל ארוחת ערב (רק אם הטקסט מופיע ביותר מקטע אחד)","find":"טקסט מדויק מהמסמך","replace":"הטקסט החדש"}],"summary":"שורה-שתיים מה השתנה","msg":"הודעה קצרה למתאמן, בקול של אביאל, בלי אימוג׳י, 1-3 שורות"}. ' +
    'כללים: find חייב להיות העתקה מדויקת של קטע משורה אחת (בלי ירידת שורה). אם הוא מופיע ביותר ממקום אחד במסמך (למשל אותה כמות אורז בצהריים ובערב) — חובה after עם כותרת הקטע הנכון, כך שבתוך הקטע הוא יופיע פעם אחת. לשנות רק מה שההוראה ביקשה. ' +
    (kind === 'menu' ? 'כשמשנים כמויות בארוחה — לעדכן גם את שורת "ערכים ממוצעים" של אותה ארוחה ואת שורת הסה״כ היומי אם יש. להעדיף להגדיל מנות שכבר יש על פני מאכל חדש. ערכי המזון של אביאל (חובה כשרלוונטי): ביצה 97 קק״ל, חלבון ביצה 17, קוטג׳ או לבנה 3% = 77 ו-5% = 95 ל-100 גרם. לשאר — ערכים מקובלים בישראל (לחם מלא כ-250 ל-100 גרם, שיבולת שועל 380, אורז מבושל 130, פסטה מבושלת 150). ' : 'בתוכנית — להחליף שם תרגיל, סטים או חזרות בשורה הקיימת, לא להוסיף שורות חדשות. ') +
    'אם אי אפשר לבצע בבטחה — pairs ריק ו-summary שמסביר למה.'
  let out; try { const raw = String(await D.askBrainOnce(prompt, 'sonnet', { label: 'doc-edit' })); out = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) } catch (e) { return D.say('לא הצלחתי להכין את השינוי: ' + e.message) }
  const pairs = (out.pairs || []).filter((p) => p && p.find && p.replace != null && p.find !== p.replace && (doc.text.split(p.find).length === 2 || (p.after && doc.text.indexOf(p.after) >= 0)))
  const inWhat = kind === 'program' ? 'בתוכנית' : 'בתפריט'
  if (!pairs.length) return D.say(`לא שיניתי כלום ${inWhat}. ${out.summary || 'לא מצאתי שורות מדויקות להחליף.'}`)
  const show = pairs.map((p) => (p.after ? `(${p.after})\n` : '') + `לפני: ${p.find}\nאחרי: ${p.replace}`).join('\n\n')
  await ask(`*${what} · ${c.name}*\n${out.summary || ''}\n\n${show}`, async () => {
    const r = await coach('dashboardDocReplace', [c.name, kind, pairs])
    const first = c.name.split(' ')[0], msg = D.drafts.stripEmoji(out.msg || `${first}, עדכנתי לך את ${what} באפליקציה`)
    const pn = String(c.phone || '').replace(/\D/g, '').replace(/^0/, '972'), jid = (await D.biz.chatForPhone(pn).catch(() => null)) || pn + '@s.whatsapp.net'
    const id = D.drafts.add({ chat_jid: jid, phone: pn, name: c.name, alias: first, text: msg, clientText: `(עדכון ${what} לבקשת אביאל)` })
    D.queuePush(id, `*${c.name}: עדכון ${what}* (#${id})\n${msg}\n\n${D.drafts.approvalHint(id, first, false, false)}`, true)
    return `עודכן ${what} של ${first} (${r.n} שינויים), באותו מסמך ובאפליקציה. ההודעה אליו מחכה לך בתור.`
  })
}
async function handle(t) {
  t = String(t || '').trim()
  if (hasPending() && (OK.test(t) || NO.test(t))) { const p = PENDING; PENDING = null; if (NO.test(t)) { await D.say('בוטל. לא שיניתי כלום.'); return true } try { await D.say(await p.run()) } catch (e) { await D.say('לא בוצע: ' + e.message) } return true }
  let m
  if ((m = t.match(RE.newc))) { await newClient(m[1]); return true }
  if ((m = t.match(RE.brief))) { const c = await findName(m[1]); if (!c) return false; await brief(c); return true }
  if ((m = t.match(RE.app))) { const c = await findName(m[1]); if (!c) return false; await appSummary(c); return true }
  if ((m = t.match(RE.card))) { const c = await findName(m[1]); if (!c) return false; await card(c); return true }
  if ((m = t.match(RE.pay))) { const c = await findName(m[1]); if (!c) return false; await pay(c, Number(m[2].replace(/,/g, ''))); return true }
  if ((m = t.match(RE.renew)) || (m = t.match(RE.renew2))) { const c = await findName(m[1]); if (!c) return false; const a = Number(m[2]), b = Number(m[3]); await (RE.renew.test(t) ? renew(c, a, b) : renew(c, b, a)); return true }
  const c = await findName(t); if (!c) return false
  await docEdit(c, t); return true
}
function init(d) { D = d }
const _setClients = (l) => { CLIENTS = { at: Date.now(), list: l } } // לבדיקות
module.exports = { init, isMine, handle, hasPending, pendingAt, RE, findName, _setClients, briefFor, programInfo, clients }
