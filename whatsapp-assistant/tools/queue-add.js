// 22.11.26: הכנסת טיוטה לתור מבחוץ (לקלוד קוד) — יוצר טיוטה וקובץ בתיבת הכניסה; העוזרת מכניסה אותו לתור בבטחה בסבב הבא
// שימוש: node tools/queue-add.js '<json: {name, phone, chat_jid?, alias?, text, alt?, alt2?, clientText?, title?, front?}>'
const path = require('path'), fs = require('fs'), d = require('../drafts')
const a = JSON.parse(process.argv[2] || '{}'); if (!a.name || !a.text || !(a.phone || a.chat_jid)) { console.error('חסר name/text/phone'); process.exit(1) }
const pn = String(a.phone || '').replace(/\D/g, '').replace(/^0/, '972')
const id = d.add({ chat_jid: a.chat_jid || pn + '@s.whatsapp.net', phone: pn, name: a.name, alias: a.alias || a.name.split(' ')[0], text: a.text, alt: a.alt || '', alt2: a.alt2 || '', clientText: a.clientText || '' })
const k = a.alias || a.name.split(' ')[0], said = a.clientText ? a.clientText.split('\n').map((l) => '> ' + l).join('\n') + '\n\n' : ''
const body = a.alt ? `*1.*\n${a.text}\n\n*2.*\n${a.alt}` + (a.alt2 ? `\n\n*3.*\n${a.alt2}` : '') : a.text
const text = `*${a.name}${a.title ? ': ' + a.title : ''}* (#${id})\n${said}${body}\n\n${d.approvalHint(id, k, !!a.alt, !!a.alt2)}`
fs.writeFileSync(path.join(__dirname, '..', 'queue-inbox', `${Date.now()}-${id}.json`), JSON.stringify({ id, text, front: a.front !== false }))
console.log('נוסף לתיבת הכניסה, טיוטה #' + id)
