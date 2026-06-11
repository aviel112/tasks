/* ============================================================
   מערכת זימון אימונים — אביאל | Backend (Google Apps Script)
   - שומר הכול בגוגל שיטס (נוצר אוטומטית בהרצה ראשונה)
   - מייל לאביאל עם כפתורי אישור/דחייה על כל בקשה חדשה
   - באישור: אירוע ביומן גוגל + זימון אוטומטי למייל המתאמן
   - דוח בוקר יומי עם האימונים של היום
   פריסה: Deploy → New deployment → Web app →
           Execute as: Me | Who has access: Anyone
   ============================================================ */

var ADMIN_KEY    = 'YOUR_ADMIN_KEY';
var NOTIFY_EMAIL = 'aviamira5@gmail.com';
var TZ           = 'Asia/Jerusalem';
var APP_URL      = 'https://aviel112.github.io/booking/';

var DAY_NAMES = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
var MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

var DEFAULT_SETTINGS = {
  slotMin: 60,
  minNoticeH: 3,
  phone: '',
  weekTemplate: [
    {on:true,  start:'07:00', end:'15:00'},
    {on:true,  start:'07:00', end:'15:00'},
    {on:true,  start:'07:00', end:'15:00'},
    {on:true,  start:'07:00', end:'15:00'},
    {on:true,  start:'07:00', end:'15:00'},
    {on:true,  start:'07:00', end:'12:00'},
    {on:false, start:'07:00', end:'12:00'}
  ]
};

/* ---------------- storage ---------------- */
function ss_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SS_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  var ss = SpreadsheetApp.create('מערכת זימון אימונים — אביאל');
  props.setProperty('SS_ID', ss.getId());
  return ss;
}
function sheet_(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sh;
}
var BK_HEAD = ['id','date','time','name','phone','email','note','status','createdAt','eventId'];
function bkSheet_()  { return sheet_('בקשות ופגישות', BK_HEAD); }
function avSheet_()  { return sheet_('זמינות', ['date','start','end']); }
function cfgSheet_() { return sheet_('הגדרות', ['key','value']); }

function rows_(sh, head) {
  var vals = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var o = {_row: i + 1};
    for (var j = 0; j < head.length; j++) o[head[j]] = vals[i][j];
    out.push(o);
  }
  return out;
}
function normDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v);
}
function normTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'HH:mm');
  var s = String(v);
  return s.length === 4 ? '0' + s : s;
}

function getSettings_() {
  var rows = rows_(cfgSheet_(), ['key','value']);
  var s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  rows.forEach(function (r) {
    if (r.key === 'weekTemplate') { try { s.weekTemplate = JSON.parse(r.value); } catch (e) {} }
    else if (r.key === 'slotMin' || r.key === 'minNoticeH') s[r.key] = Number(r.value);
    else if (r.key) s[r.key] = String(r.value);
  });
  return s;
}
function saveSettings_(s) {
  var sh = cfgSheet_();
  sh.clearContents();
  sh.appendRow(['key','value']);
  sh.appendRow(['slotMin', s.slotMin]);
  sh.appendRow(['minNoticeH', s.minNoticeH]);
  sh.appendRow(['phone', s.phone || '']);
  sh.appendRow(['weekTemplate', JSON.stringify(s.weekTemplate)]);
}

function getAvail_() {
  var map = {};
  rows_(avSheet_(), ['date','start','end']).forEach(function (r) {
    if (r.date) map[normDate_(r.date)] = { start: normTime_(r.start), end: normTime_(r.end) };
  });
  return map;
}
function writeAvail_(map) {
  var sh = avSheet_();
  sh.clearContents();
  sh.appendRow(['date','start','end']);
  var dates = Object.keys(map).sort();
  if (dates.length) {
    var data = dates.map(function (d) { return [d, map[d].start, map[d].end]; });
    sh.getRange(2, 1, data.length, 3).setValues(data);
  }
}

function getBookings_() {
  return rows_(bkSheet_(), BK_HEAD).map(function (b) {
    b.date = normDate_(b.date);
    b.time = normTime_(b.time);
    return b;
  });
}
function setBookingFields_(rowNum, fields) {
  var sh = bkSheet_();
  Object.keys(fields).forEach(function (k) {
    var col = BK_HEAD.indexOf(k) + 1;
    if (col > 0) sh.getRange(rowNum, col).setValue(fields[k]);
  });
}

/* ---------------- time helpers ---------------- */
function ilDate_(dateStr, timeStr) {
  var guess = new Date(dateStr + 'T' + timeStr + ':00+02:00');
  var shown = Utilities.formatDate(guess, TZ, 'HH:mm');
  if (shown !== timeStr) {
    var want = parseInt(timeStr, 10), got = parseInt(shown, 10);
    var diff = want - got;
    if (diff > 12) diff -= 24;
    if (diff < -12) diff += 24;
    guess = new Date(guess.getTime() + diff * 3600000);
  }
  return guess;
}
function heDate_(dateStr) {
  var d = ilDate_(dateStr, '12:00');
  var dow = Number(Utilities.formatDate(d, TZ, 'u')) % 7; // u: Mon=1..Sun=7
  return 'יום ' + DAY_NAMES[dow] + ', ' + d.getDate() + ' ב' + MONTHS[Number(Utilities.formatDate(d, TZ, 'M')) - 1];
}

function slotsFor_(dateStr, avail, settings, bookings) {
  var win = avail[dateStr];
  if (!win) return [];
  var taken = {};
  bookings.forEach(function (b) {
    if (b.date === dateStr && (b.status === 'pending' || b.status === 'approved')) taken[b.time] = 1;
  });
  var minTime = new Date(Date.now() + settings.minNoticeH * 3600000);
  var p = function (t) { return parseInt(t.split(':')[0], 10) * 60 + parseInt(t.split(':')[1], 10); };
  var f = function (m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); };
  var out = [];
  for (var cur = p(win.start); cur + settings.slotMin <= p(win.end); cur += settings.slotMin) {
    var t = f(cur);
    if (!taken[t] && ilDate_(dateStr, t) > minTime) out.push(t);
  }
  return out;
}

/* ---------------- web app entry ---------------- */
function doGet(e) {
  var a = (e.parameter && e.parameter.action) || '';
  if (a === 'state')  return json_(publicState_());
  if (a === 'approve' || a === 'reject') {
    if (e.parameter.key !== ADMIN_KEY) return html_('⛔', 'אין הרשאה');
    var res = (a === 'approve') ? approve_(e.parameter.id) : reject_(e.parameter.id);
    return html_(res.ok ? (a === 'approve' ? '✅' : '🚫') : '⚠️', res.msg);
  }
  return json_({ ok: true, service: 'aviel-booking' });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  var a = body.action;
  if (a === 'book')   return json_(book_(body));
  if (a === 'status') return json_(statusOf_(body.ids || []));
  if (a === 'cancelMine') return json_(cancelMine_(body));
  if (a === 'admin') {
    if (body.key !== ADMIN_KEY) return json_({ ok: false, error: 'unauthorized' });
    ensureTrigger_();
    if (body.op === 'list')    return json_(adminList_());
    if (body.op === 'approve') return json_(approve_(body.id));
    if (body.op === 'reject')  return json_(reject_(body.id));
    if (body.op === 'cancel')  return json_(cancel_(body.id, true));
    if (body.op === 'setAvail')      return json_(setAvail_(body));
    if (body.op === 'applyTemplate') return json_(applyTemplate_(body));
    if (body.op === 'saveSettings')  { saveSettings_(body.settings); return json_({ ok: true }); }
  }
  return json_({ ok: false, error: 'unknown action' });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function html_(emoji, msg) {
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{background:#0a0c12;color:#eef0ff;font-family:-apple-system,Arial;display:flex;align-items:center;justify-content:center;min-height:90vh;text-align:center}' +
    '.c{background:#161a26;border:1px solid #2a3050;border-radius:20px;padding:40px 30px;max-width:340px}' +
    '.e{font-size:3.5rem;margin-bottom:14px}h2{color:#00d68f;font-size:1.15rem;line-height:1.6}' +
    'a{display:inline-block;margin-top:22px;color:#00d68f;font-weight:700}</style></head>' +
    '<body><div class="c"><div class="e">' + emoji + '</div><h2>' + msg + '</h2>' +
    '<a href="' + APP_URL + '?admin=1">למערכת הניהול ←</a></div></body></html>'
  );
}

/* ---------------- public actions ---------------- */
function publicState_() {
  var settings = getSettings_();
  var avail = getAvail_();
  var bookings = getBookings_();
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var slots = {};
  Object.keys(avail).forEach(function (d) {
    if (d >= today) {
      var s = slotsFor_(d, avail, settings, bookings);
      if (s.length) slots[d] = s;
    }
  });
  return { ok: true, slots: slots, slotMin: settings.slotMin, phone: settings.phone };
}

function book_(b) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!b.name || !b.phone || !b.email || !b.date || !b.time) return { ok: false, error: 'missing fields' };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) return { ok: false, error: 'bad email' };
    var settings = getSettings_();
    var free = slotsFor_(b.date, getAvail_(), settings, getBookings_());
    if (free.indexOf(b.time) === -1) return { ok: false, error: 'slot_taken' };

    var id = 'bk' + Date.now() + Math.floor(Math.random() * 1000);
    bkSheet_().appendRow([id, b.date, b.time, b.name, b.phone, b.email, b.note || '', 'pending',
      Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), '']);

    notifyAviel_(id, b);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function statusOf_(ids) {
  var map = {};
  getBookings_().forEach(function (b) {
    if (ids.indexOf(b.id) !== -1) map[b.id] = { status: b.status, date: b.date, time: b.time, name: b.name };
  });
  return { ok: true, bookings: map };
}

function cancelMine_(body) {
  var bk = findBooking_(body.id);
  if (!bk) return { ok: false, error: 'not found' };
  if (String(bk.phone).replace(/\D/g, '').slice(-7) !== String(body.phone || '').replace(/\D/g, '').slice(-7))
    return { ok: false, error: 'unauthorized' };
  return cancel_(body.id, false);
}

/* ---------------- admin actions ---------------- */
function adminList_() {
  return { ok: true, bookings: getBookings_(), avail: getAvail_(), settings: getSettings_() };
}

function findBooking_(id) {
  var all = getBookings_();
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return null;
}

function approve_(id) {
  var bk = findBooking_(id);
  if (!bk) return { ok: false, msg: 'הבקשה לא נמצאה' };
  if (bk.status === 'approved') return { ok: true, msg: 'הפגישה כבר אושרה — ' + bk.name + ', ' + heDate_(bk.date) + ' ' + bk.time };
  if (bk.status !== 'pending') return { ok: false, msg: 'הבקשה כבר טופלה (' + bk.status + ')' };

  var settings = getSettings_();
  var start = ilDate_(bk.date, bk.time);
  var end = new Date(start.getTime() + settings.slotMin * 60000);
  var ev = CalendarApp.getDefaultCalendar().createEvent(
    '🏋️ אימון — ' + bk.name,
    start, end,
    { description: 'טלפון: ' + bk.phone + (bk.note ? '\nהערה: ' + bk.note : '') + '\nנקבע דרך מערכת הזימונים',
      guests: bk.email, sendInvites: true }
  );
  setBookingFields_(bk._row, { status: 'approved', eventId: ev.getId() });
  mailClient_(bk, 'approved');
  return { ok: true, msg: 'הפגישה אושרה ✓ ' + bk.name + ' קיבל זימון ליומן — ' + heDate_(bk.date) + ' בשעה ' + bk.time };
}

function reject_(id) {
  var bk = findBooking_(id);
  if (!bk) return { ok: false, msg: 'הבקשה לא נמצאה' };
  if (bk.status !== 'pending') return { ok: false, msg: 'הבקשה כבר טופלה (' + bk.status + ')' };
  setBookingFields_(bk._row, { status: 'rejected' });
  mailClient_(bk, 'rejected');
  return { ok: true, msg: 'הבקשה נדחתה ונשלחה הודעה ל-' + bk.name };
}

function cancel_(id, byAdmin) {
  var bk = findBooking_(id);
  if (!bk) return { ok: false, error: 'not found', msg: 'לא נמצא' };
  if (bk.eventId) {
    try { CalendarApp.getDefaultCalendar().getEventById(bk.eventId).deleteEvent(); } catch (e) {}
  }
  setBookingFields_(bk._row, { status: 'cancelled' });
  if (byAdmin) mailClient_(bk, 'cancelled');
  else MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: '❌ ביטול אימון — ' + bk.name + ' | ' + heDate_(bk.date) + ' ' + bk.time,
    htmlBody: mailShell_('המתאמן ביטל את הפגישה', '<b>' + esc_(bk.name) + '</b> ביטל את האימון של ' + heDate_(bk.date) + ' בשעה ' + bk.time + '.<br>השעה חזרה להיות פנויה במערכת.') });
  return { ok: true, msg: 'הפגישה בוטלה' };
}

function setAvail_(body) {
  var map = getAvail_();
  (body.remove || []).forEach(function (d) { delete map[d]; });
  Object.keys(body.set || {}).forEach(function (d) { map[d] = body.set[d]; });
  writeAvail_(map);
  return { ok: true, avail: map };
}

function applyTemplate_(body) {
  var settings = getSettings_();
  var tpl = body.template || settings.weekTemplate;
  var ym = body.month; // 'YYYY-MM'
  var y = +ym.split('-')[0], m = +ym.split('-')[1];
  var daysInMonth = new Date(y, m, 0).getDate();
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var map = getAvail_();
  for (var day = 1; day <= daysInMonth; day++) {
    var ds = ym + '-' + ('0' + day).slice(-2);
    if (ds < today) continue;
    var dow = new Date(y, m - 1, day).getDay();
    if (tpl[dow] && tpl[dow].on) map[ds] = { start: tpl[dow].start, end: tpl[dow].end };
    else delete map[ds];
  }
  writeAvail_(map);
  return { ok: true, avail: map };
}

/* ---------------- emails ---------------- */
function esc_(s) {
  return String(s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function mailShell_(title, inner, buttons) {
  return '<div dir="rtl" style="background:#0a0c12;padding:30px 16px;font-family:Arial,sans-serif">' +
    '<div style="max-width:480px;margin:0 auto;background:#161a26;border:1px solid #2a3050;border-radius:18px;padding:28px">' +
    '<div style="font-size:1.6rem;margin-bottom:4px">🏋️</div>' +
    '<h2 style="color:#00d68f;margin:0 0 14px;font-size:1.2rem">' + title + '</h2>' +
    '<div style="color:#eef0ff;font-size:.95rem;line-height:1.8">' + inner + '</div>' +
    (buttons || '') +
    '<div style="color:#8892b0;font-size:.75rem;margin-top:22px;border-top:1px solid #2a3050;padding-top:12px">מערכת הזימונים של אביאל</div>' +
    '</div></div>';
}

function notifyAviel_(id, b) {
  var base = ScriptApp.getService().getUrl();
  var ok = base + '?action=approve&id=' + id + '&key=' + ADMIN_KEY;
  var no = base + '?action=reject&id=' + id + '&key=' + ADMIN_KEY;
  var btns =
    '<div style="margin-top:24px">' +
    '<a href="' + ok + '" style="display:inline-block;background:#00d68f;color:#06281c;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none;margin-left:10px">✓ אשר את האימון</a>' +
    '<a href="' + no + '" style="display:inline-block;background:#2a3050;color:#e45858;font-weight:bold;padding:13px 30px;border-radius:10px;text-decoration:none">✗ דחה</a>' +
    '</div>';
  var inner =
    '<table dir="rtl" style="color:#eef0ff;font-size:.95rem;line-height:2">' +
    '<tr><td style="color:#8892b0;padding-left:14px">מתאמן</td><td><b>' + esc_(b.name) + '</b></td></tr>' +
    '<tr><td style="color:#8892b0">מועד</td><td><b>' + heDate_(b.date) + ' · ' + b.time + '</b></td></tr>' +
    '<tr><td style="color:#8892b0">טלפון</td><td><a href="tel:' + esc_(b.phone) + '" style="color:#00d68f">' + esc_(b.phone) + '</a></td></tr>' +
    '<tr><td style="color:#8892b0">מייל</td><td>' + esc_(b.email) + '</td></tr>' +
    (b.note ? '<tr><td style="color:#8892b0">הערה</td><td>' + esc_(b.note) + '</td></tr>' : '') +
    '</table>' +
    '<div style="color:#8892b0;font-size:.8rem;margin-top:10px">באישור — נוצר אירוע ביומן שלך והמתאמן מקבל זימון אוטומטי למייל.</div>';
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: '🔔 בקשת אימון חדשה — ' + b.name + ' | ' + heDate_(b.date) + ' ' + b.time,
    htmlBody: mailShell_('בקשת אימון חדשה ממתינה לאישור שלך', inner, btns)
  });
}

function mailClient_(bk, kind) {
  var subj, title, inner;
  if (kind === 'approved') {
    subj = '✅ האימון שלך אושר — ' + heDate_(bk.date) + ' בשעה ' + bk.time;
    title = 'האימון אושר — נתראה במכון! 💪';
    inner = 'היי ' + esc_(bk.name) + ',<br>אביאל אישר את האימון שלך:<br><b style="color:#00d68f">' +
      heDate_(bk.date) + ' · ' + bk.time + '</b><br><br>זימון ליומן גוגל נשלח אליך בנפרד — אשר אותו וזה ביומן.<br>מגיעים עם מים, מגבת ואנרגיות.';
  } else if (kind === 'rejected') {
    subj = 'לגבי בקשת האימון שלך — ' + heDate_(bk.date) + ' ' + bk.time;
    title = 'השעה הזו לא מסתדרת הפעם';
    inner = 'היי ' + esc_(bk.name) + ',<br>השעה שביקשת (' + heDate_(bk.date) + ' · ' + bk.time +
      ') לא מתאפשרת.<br><br><a href="' + APP_URL + '" style="color:#00d68f;font-weight:bold">בחר שעה אחרת כאן ←</a>';
  } else {
    subj = 'האימון בוטל — ' + heDate_(bk.date) + ' ' + bk.time;
    title = 'האימון בוטל';
    inner = 'היי ' + esc_(bk.name) + ',<br>האימון של ' + heDate_(bk.date) + ' בשעה ' + bk.time +
      ' בוטל.<br><br><a href="' + APP_URL + '" style="color:#00d68f;font-weight:bold">לקביעת מועד חדש ←</a>';
  }
  try {
    MailApp.sendEmail({ to: bk.email, subject: subj, htmlBody: mailShell_(title, inner) });
  } catch (e) {}
}

/* ---------------- daily digest ---------------- */
function ensureTrigger_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'dailyDigest'; });
  if (!has) ScriptApp.newTrigger('dailyDigest').timeBased().atHour(6).everyDays(1).inTimezone(TZ).create();
}
function dailyDigest() {
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var list = getBookings_().filter(function (b) { return b.date === today && b.status === 'approved'; })
    .sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  if (!list.length) return;
  var inner = '<b>' + list.length + ' אימונים היום:</b><br><br>' + list.map(function (b) {
    return '🕐 <b>' + b.time + '</b> — ' + esc_(b.name) + ' · <a href="tel:' + esc_(b.phone) + '" style="color:#00d68f">' + esc_(b.phone) + '</a>' + (b.note ? '<br><span style="color:#8892b0;font-size:.85rem">📝 ' + esc_(b.note) + '</span>' : '');
  }).join('<br><br>');
  MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: '☀️ הלוז שלך להיום — ' + list.length + ' אימונים | ' + heDate_(today),
    htmlBody: mailShell_('בוקר טוב אלוף, זה הלוז של היום', inner) });
}
