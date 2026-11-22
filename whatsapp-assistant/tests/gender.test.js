// 22.11.26: הסקת מין מההודעות של אביאל (מלכה/את מול מלך/אתה). רץ על הביטויים בלבד, בלי מסד נתונים
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'business-whatsapp.js'), 'utf8')
const code = src.slice(src.indexOf('const B = (w)'), src.indexOf('async function genderOf'))
eval(code.replace(/const /g, 'var '))
let fail = 0; const g = (texts) => { let f = 0, m = 0; for (const t of texts) { f += (t.match(FEM) || []).length; m += (t.match(MASC) || []).length } return f + m < 3 ? '' : f >= m * 2 ? 'f' : m >= f * 2 ? 'm' : '' }
const eq = (n, a, b) => { if (a !== b) { fail++; console.log('FAIL', n, a, b) } }
eq('נקבה', g(['היי מלכה מה המצב', 'תשקלי מחר ותעדכני', 'את מדהימה']), 'f')
eq('זכר', g(['מלך מה קורה', 'תשקל מחר אחי', 'אתה בקצב']), 'm')
eq('מעט מדי = לא ידוע', g(['סבבה', 'יאללה']), '')
eq('לא נתפס בתוך מילה (אתמול)', g(['אתמול היה טוב', 'אתמול', 'אתמול']), '')
console.log(fail ? `${fail} בדיקות מין נכשלו` : 'בדיקות מין עברו'); process.exit(fail ? 1 : 0)
