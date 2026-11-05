#!/usr/bin/env python3
"""בונה את אפליקציית הבטא (aviel-app/beta) מתוך index.html הרגיל + תוספות: יומן אוכל, תמונות התקדמות, התראות פוש."""
import pathlib, json, shutil, re
ROOT = pathlib.Path(__file__).parent
OUT = ROOT / 'beta'; OUT.mkdir(exist_ok=True)
html = (ROOT / 'index.html').read_text(encoding='utf8')
foods = (ROOT / 'foods.json').read_text(encoding='utf8')
API = re.search(r"var API='([^']+)'", html).group(1)

CSS = """
.beta{font-size:11px;background:var(--gold);color:var(--ink);border-radius:6px;padding:1px 6px;margin-right:4px;vertical-align:middle}
nav.tabs .in{grid-template-columns:none!important;grid-auto-flow:column;grid-auto-columns:1fr} /* טאב מוסתר (תפריט אצל מתאמני "ערכים") לא משאיר חור */
.fsearch{display:flex;flex-direction:column;gap:8px}
.flist{display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto}
.flist button{background:var(--panel2);color:var(--text);border:1px solid var(--line);text-align:right;font-weight:600;padding:10px 12px}
.flist button small{color:var(--mute);font-weight:600;margin-right:6px}
.fadd{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
.fadd input{font-size:17px;padding:8px}
.fnav{margin-bottom:10px}
.fnav b{font-size:15px}
.fnav .swarr[disabled]{opacity:.35;cursor:not-allowed;color:var(--mute);background-color:transparent}
.ftop{display:flex;align-items:center;gap:18px}
.fringw{position:relative;width:118px;height:118px;flex:none}
.fring{width:100%;height:100%}
.fring circle{fill:none;stroke-width:9}
.fring .rbg{stroke:var(--panel2)}
.fring .rfg{stroke:var(--gold);stroke-linecap:round;transition:stroke-dasharray .5s ease}
.fring .rfg.over{stroke:var(--bad)}
.fringt{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.fringt b{font-size:26px;line-height:1}
.fringt small{font-size:12px;color:var(--mute);margin-top:3px}
.feq{display:flex;flex-direction:column;gap:6px;min-width:0}
.feq>div:not(.sub){display:flex;gap:8px;align-items:baseline}
.feq b{font-size:18px}
.fcopy{width:100%;margin-top:12px}
.fmeal{border-bottom:1px solid var(--line);padding:10px 0}
.fmeal:first-child{padding-top:0}
.fmeal:last-child{border:0;padding-bottom:0}
.fmh{display:flex;justify-content:space-between;align-items:baseline}
.fmh b{font-size:15px}
.fmh .num{font-size:13px;color:var(--mute)}
.fmadd{background:none;border:0;padding:6px 0 0;min-height:0;color:var(--gold);font-weight:700;font-size:13.5px}
.frec{display:flex;gap:6px;overflow-x:auto;padding:6px 0 4px;scrollbar-width:none}
.frec button{flex:none;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:999px;padding:7px 12px;font-size:13.5px;font-weight:600;min-height:0;white-space:nowrap}
.frec button small{color:var(--mute);margin-right:5px;font-weight:600}
#fMeals{margin-top:4px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;overflow:visible}#fMeals .chip{padding:8px 2px;text-align:center;justify-content:center;white-space:nowrap;min-width:0} /* חמש הארוחות בשורה אחת, בלי "חופ…" חתוך */
#fList:empty,#fUnits:empty,#fRecent:empty{display:none}
.fpr{font-size:14px;line-height:1.5;margin:4px 0 10px;color:var(--gold)}
/* שטח מגע נוח (27.10.26): קישורי טקסט וכפתורים קטנים מקבלים עוד 8px למעלה ולמטה ללחיצה, בלי לשנות את המראה ובלי לחפוף לשכנים בצד */
.linkbtn,.fmadd,.mall,a.vid,.swapbtn{position:relative}.linkbtn::after,.fmadd::after,.mall::after,a.vid::after,.swapbtn::after{content:"";position:absolute;inset:-8px 0}
.wfeel{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0 4px}.wfeel span{font-size:14px;color:var(--mute);margin-inline-end:2px;flex-basis:100%}.sheet-in .wfeel .chip{width:auto;flex:1;margin:0;min-height:40px;padding:6px 8px;font-size:14px}
.fpr b{color:var(--text)}
.eo h3{margin:0;font-size:16px}
.eo .chips{margin-top:8px}
.eorow{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)}
.eorow:last-of-type{border:0}
.eon{min-width:0}
.eon b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.eon small,.eov small{color:var(--mute);font-size:12px;display:block}
.eov{text-align:left;direction:ltr}
.eov b{font-size:15px}
.eov.over b{color:var(--bad)}
.mcar{display:grid;grid-template-columns:40px 1fr 40px;align-items:center;gap:6px}
.mcur{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px 12px;text-align:center;min-height:0;color:var(--text);font-size:15px;font-weight:600;display:flex;flex-direction:column;gap:3px}
.mcur small{font-size:12px;color:var(--mute);font-weight:600}
.mcur.picked{border-color:var(--good);background:rgba(46,133,81,.12)}
.mcur.picked small{color:var(--good)}
.mall{background:none;border:0;padding:6px 0 0;min-height:0;color:var(--mute);font-size:12.5px;text-decoration:underline}
.opt.car ul{display:none}
.opt.car.open ul{display:flex;margin-top:8px}
.mealshot{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)}
.mealshot label{flex:none;border:1px solid var(--gold-d);color:var(--gold);border-radius:999px;padding:6px 12px;font-size:13px;font-weight:700;cursor:pointer}
.mealshot .sub{font-size:12.5px}
.fitem{display:flex;justify-content:space-between;align-items:center;gap:8px;border-bottom:1px solid var(--line);padding:8px 0;font-size:14px}
.fitem:last-child{border:0}
.fitem small{color:var(--mute)}
.bar{height:8px;border-radius:6px;background:var(--panel2);overflow:hidden;margin-top:4px}
.bar i{display:block;height:100%;background:var(--gold)}
.bar i.over{background:var(--bad)}
.mac{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:8px;font-size:13px}
.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}
.photos figure{margin:0;text-align:center;font-size:11px;color:var(--mute)}
.photos img{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:10px;border:1px solid var(--line)}
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.cmp figure{margin:0;text-align:center;font-size:12px;color:var(--mute)}
.sets{display:flex;flex-direction:column;gap:6px;margin-top:4px}
.sets .sh,.setrow{display:grid;grid-template-columns:24px 1fr 1fr 86px 44px;gap:6px;align-items:center}.setrow select{font-size:13px!important;padding-inline:2px!important}
.setrow select{font-family:inherit;font-size:16px;font-weight:800;padding:7px 2px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:var(--text);text-align:center;text-align-last:center;width:100%;-webkit-appearance:none;appearance:none}
.rirhelp{font-size:11px;color:var(--mute);margin:4px 2px 0}
.sets .sh{font-size:11px;color:var(--mute);font-weight:700;text-align:center}
.setrow input{font-size:16px;padding:7px}
.setrow button{padding:7px 0;font-size:16px}
.setrow.ok input,.setrow.ok button{background:rgba(92,196,137,.15);border-color:var(--good);color:var(--good)}
.setrow .num{text-align:center;font-weight:800;color:var(--gold)}
.vid{display:inline-block;font-size:13px;font-weight:700;color:var(--gold);text-decoration:none;margin:2px 0}
.vid.ghost{color:var(--mute)}
.opt li{cursor:pointer}
.opt li.picked{border-color:var(--good);background:rgba(92,196,137,.14)}
.opt li.picked::before{content:"✓ ";color:var(--good);font-weight:800}
.swaphint{font-size:12px;color:var(--mute);margin-top:6px}
.cmp img{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:12px;border:1px solid var(--gold-d)}
.ic{width:1.05em;height:1.05em;vertical-align:-.16em;flex:none}
button .ic{width:18px;height:18px}
.vid{display:inline-flex;align-items:center;gap:5px}
.mine{display:inline-block;font-size:11px;font-weight:800;color:var(--gold);border:1px solid var(--gold-d);border-radius:6px;padding:0 5px;margin-left:6px;line-height:1.5;vertical-align:1px}
.mhint{font-size:13px;color:var(--gold);margin-top:4px}
.plus{font-size:12px;font-weight:800;color:var(--mute);margin:10px 0 0;display:flex;align-items:center;gap:8px}
.plus::before,.plus::after{content:"";flex:1;height:1px;background:var(--line)}
.meal.mnote{background:transparent;border-style:dashed}
.meal.mnote .plain:first-child{font-weight:800;color:var(--gold)}
.kpi b span{font-size:inherit}
:root[data-theme="light"]{--ink:#f6f2ea;--panel:#ffffff;--panel2:#f0eadf;--line:#e3d9c8;--text:#1f1b16;--mute:#6b6358;--gold:#94691c;--gold-d:#c9a560;--good:#2e8551;--warn:#a8650f;--bad:#c2443a;color-scheme:light}
:root[data-theme="light"] nav.tabs{background:rgba(255,255,255,.96);box-shadow:0 -2px 12px rgba(60,45,20,.06)}
:root[data-theme="light"] .card,:root[data-theme="light"] .kpi{box-shadow:0 1px 3px rgba(60,45,20,.06)}
:root[data-theme="light"] .chart line{stroke:var(--line)}
:root[data-theme="light"] .chart text{fill:var(--mute)}
:root[data-theme="light"] .chart text[fill="#f2efe8"]{fill:var(--text)}
:root[data-theme="light"] .chart path[stroke]{stroke:var(--gold)}
:root[data-theme="light"] .chart circle{fill:var(--panel);stroke:var(--gold)}
:root[data-theme="light"] .sdot{background:#b9b0a2}
:root[data-theme="light"] .setrow.ok input,:root[data-theme="light"] .setrow.ok button{background:rgba(46,133,81,.1)}
:root[data-theme="light"] .opt li.picked{background:rgba(46,133,81,.1)}
.thbtn{width:38px;height:38px;border-radius:50%;background:var(--panel2);border:1px solid var(--line);color:var(--gold);display:flex;align-items:center;justify-content:center;padding:0;flex:none}
.thbtn svg{width:19px;height:19px}
.topr{display:flex;gap:8px;align-items:center}

.scan{position:fixed;inset:0;background:#000;z-index:60;display:flex;flex-direction:column}
.scan[hidden]{display:none}
.scan .bar2{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 16px;padding-top:calc(12px + env(safe-area-inset-top,0px));color:#fff;font-weight:800}
.scan .bar2 button{background:rgba(255,255,255,.15);color:#fff}
.scan .vw{position:relative;flex:1;display:flex;min-height:0}
.scan video{width:100%;height:100%;object-fit:cover}
.scanbox{position:absolute;left:10%;right:10%;top:38%;height:24%;border:2px solid var(--gold);border-radius:12px;pointer-events:none}
.qrow{display:flex;gap:8px}
.qrow input{flex:1;min-width:0}
.qrow button{flex:none;width:48px;padding:0;display:flex;align-items:center;justify-content:center}
.label-form{display:flex;flex-direction:column;gap:8px}
.label-form input{font-size:16px;padding:10px}
.flist button .tag2{display:inline-block;font-size:11px;font-weight:800;color:var(--mute);border:1px solid var(--line);border-radius:6px;padding:0 5px;margin-left:6px;line-height:1.5;vertical-align:1px}

#wBtn:disabled,#sBtn:disabled,#ciBtn:disabled,#mBtn:disabled,#fBtn:disabled,#pushBtn:disabled{color:transparent;position:relative;opacity:1;cursor:progress}
#wBtn:disabled::after,#sBtn:disabled::after,#ciBtn:disabled::after,#mBtn:disabled::after,#fBtn:disabled::after,#pushBtn:disabled::after{content:"";position:absolute;inset:0;margin:auto;width:18px;height:18px;border-radius:50%;border:2.5px solid var(--ink);border-top-color:transparent;animation:spin .7s linear infinite}
#sBtn:disabled::after{border-color:var(--gold);border-top-color:transparent}
@keyframes spin{to{transform:rotate(360deg)}}
body:has(#rest:not([hidden])) .app{padding-bottom:calc(170px + env(safe-area-inset-bottom,0px))}

.sdot{display:inline-block;width:14px;height:14px;border-radius:50%;background:var(--mute);margin-top:6px}
.sdot.s-good{background:var(--good)}.sdot.s-warn{background:var(--warn)}.sdot.s-bad{background:var(--bad)}
::selection{background:rgba(212,172,91,.35);color:var(--text)}
input,textarea{caret-color:var(--gold)}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
"""

NAV_FOOD = '<button role="tab" aria-selected="false" data-tab="food"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>יומן</button>'

FOOD_VIEW = """
  <section data-view="food" hidden>
    <h1>יומן אוכל</h1>
    <div class="sub">רושמים מה אכלת ורואים כמה נשאר להיום. מאכלים עם התג <span class="mine">אביאל</span> הם מהמאגר שלי, והשאר מהמאגר הלאומי של משרד הבריאות.</div>
    <div class="stack">
      <div class="card" id="fTot"></div>
      <div class="card fsearch">
        <span class="label">הוספה</span>
        <div class="qrow"><input id="fQ" type="search" placeholder="חיפוש: עוף, אורז, קוטג׳…" aria-label="חיפוש מאכל" style="font-size:16px;text-align:right;flex:1"><button type="button" class="ghost" id="fScan" aria-label="סריקת ברקוד" title="סריקת ברקוד"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M17 8v8"/></svg></button></div>
        <div id="fRecent"></div>
        <div class="flist" id="fList"></div>
        <div class="mealshot"><label class="ghost sm" for="msIn">צילום ארוחה והערכת קלוריות</label><input type="file" id="msIn" accept="image/*" capture="environment" hidden><span class="sub">מצלמים את הצלחת, מקבלים הערכה של מה שיש בה, ורושמים ביומן בלחיצה. התמונה נשמרת גם אצל אביאל.</span></div>
        <div class="chips" id="fUnits"></div>
        <div class="chips" id="fMeals" role="group" aria-label="לאיזו ארוחה"></div>
        <form class="fadd" id="fAdd" hidden><input id="fG" inputmode="numeric" aria-label="גרם"><button type="submit" id="fBtn">הוספה</button></form>
        <div class="sub" id="fPick"></div>
        <div id="fLabel" class="label-form" hidden>
          <div class="sub">המוצר עוד לא במאגר. כותבים את השם ומצלמים את טבלת הערכים התזונתיים. האפליקציה קוראת את הערכים, ומיד אפשר להוסיף ליומן.</div>
          <input id="flName" placeholder="שם המוצר, למשל: קוטג׳ 5% תנובה" aria-label="שם המוצר">
          <label class="installbtn" for="flIn" style="text-align:center;cursor:pointer">צילום התווית</label>
          <input type="file" id="flIn" accept="image/*" capture="environment" hidden>
        </div>
      </div>
      <div class="card"><div id="fItems"></div></div>
    </div>
    <div class="scan" id="scan" hidden><div class="bar2"><span>מכוונים את הברקוד למסגרת</span><button type="button" id="scanX">סגירה</button></div><div class="vw"><video id="scanV" playsinline muted></video><div class="scanbox"></div></div></div>
  </section>
"""

PUSH_CARD = """<div class="card" id="pushCard" hidden>
        <div class="row"><span class="label">תזכורות לטלפון</span><button class="ghost sm" type="button" id="pushX" aria-label="סגירה"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
        <div style="margin-top:6px;font-size:14px" id="pushTxt">בלי זה התזכורות וההודעות ממני לא מגיעות אליך: שקילת בוקר, אימונים, מים וצ׳ק-אין. לחיצה אחת, ואפשר לכבות בכל רגע בהגדרות הטלפון.</div>
        <button type="button" class="installbtn" id="pushBtn">הפעלת תזכורות</button>
      </div>
      """

PHOTO_CARD = """<div class="card"><div class="row"><span class="label">תמונות התקדמות, פעם בחודש</span><label class="ghost sm" for="phIn" style="border:1px solid var(--line);border-radius:12px;padding:6px 10px;font-size:13px;font-weight:700;cursor:pointer">+ תמונה</label></div>
        <input type="file" id="phIn" accept="image/*" hidden>
        <div class="sub" style="margin-top:6px">מצלמים באותו מקום ובאותה תאורה, בבוקר. רק לך ולאביאל יש גישה. מצלמים 4: חזית, שני הצדדים וגב. אביאל עובר עליהן ומדייק לפיהן את התוכנית.</div>
        <div id="phBox"></div></div>
      """

JS = r"""
<script>
/* ===================== בטא ===================== */
var FOODS=__FOODS__;
function fmatch(q){ q=String(q||'').trim(); if(!q) return []; return FOODS.filter(function(f){ return f[0].indexOf(q)>=0||f[1].split('|').some(function(a){ return a.indexOf(q)>=0; }); }).slice(0,12); }
var FDAY={items:[]}, FSEL=null;
function targets(){ if(P&&P.macros&&P.macros.k) return {'קלוריות':P.macros.k,'חלבון':P.macros.p||0,'פחמימות':P.macros.c||0,'שומן':P.macros.f||0}; var m=P&&P.menu, out={}; if(!m||!m.blocks) return out;
  m.blocks.forEach(function(b){ b.lines.forEach(function(l){ var mm=l.match(/^(קלוריות|חלבון|פחמימות|שומן):\s*([\d,]+)(?:\s*[–-]\s*([\d,]+))?/); if(mm){ var a=+mm[2].replace(/,/g,''), z=mm[3]?+mm[3].replace(/,/g,''):a; out[mm[1]]=Math.round((a+z)/2); } }); });
  /* פורמט המסמכים החדש: טבלת "סה״כ קלוריות | כ-1,350" ו"· 1,350 קלוריות" בכותרת */
  var KEYS={'קלוריות':'קלוריות','חלבון':'חלבון','חלבונים':'חלבון','פחמימות':'פחמימות','שומן':'שומן','שומנים':'שומן'};
  m.blocks.forEach(function(b){ (b.rows||[]).forEach(function(r){ var k=String(r[0]||'').replace(/^סה["״]?כ\s*/,'').trim(), mm=String(r[1]||'').match(/([\d,]+)/); if(KEYS[k]&&mm&&!out[KEYS[k]]) out[KEYS[k]]=+mm[1].replace(/,/g,''); }); });
  if(!out['קלוריות']){ var tm=String(m.title||m.name||'').match(/([\d,]{3,6})\s*קלוריות/); if(tm) out['קלוריות']=+tm[1].replace(/,/g,''); }
  /* אין טבלת סיכום — מחברים את "ערכים ממוצעים ל..." של כל הארוחות */
  if(!out['קלוריות']){ var sum={}, n=0; m.blocks.forEach(function(b){ b.lines.forEach(function(l){ if(!/^ערכי(ם ממוצעים| הארוחה)/.test(l)) return; n++; var re=/כ-?\s*([\d.,]+)\s*(קלוריות|גרם חלבון|גרם פחמימ\S*|גרם שומן)/g, mm; while((mm=re.exec(l))){ var k=/קלור/.test(mm[2])?'קלוריות':/חלבון/.test(mm[2])?'חלבון':/פחמ/.test(mm[2])?'פחמימות':'שומן'; sum[k]=(sum[k]||0)+(+mm[1].replace(/,/g,'')); } }); });
    if(n) Object.keys(sum).forEach(function(k){ out[k]=Math.round(sum[k]); }); }
  return out; }
var MEALS=['בוקר','צהריים','ביניים','ערב'], FMEAL=null;
function mealByTime(t){ var h=parseInt(String(t||'').slice(0,2),10); if(isNaN(h)) h=new Date().getHours(); return h<11?'בוקר':h<16?'צהריים':h<19?'ביניים':'ערב'; }
var FM_LAST=null, FM_AT=0; function fMeal(){ if(FMEAL!==FM_LAST){ FM_LAST=FMEAL; FM_AT=Date.now(); } if(FMEAL&&Date.now()-FM_AT>20*60000){ FMEAL=null; FM_LAST=null; } return FMEAL||mealByTime(); } /* "הוספה לבוקר" לא נתקע עד הערב */
function ring(v,t){ var r=44, C=2*Math.PI*r, pc=t?Math.min(1,v/t):0, over=t&&v>t*1.05;
  return '<svg class="fring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="'+r+'" class="rbg"/>'+(pc>0?'<circle cx="50" cy="50" r="'+r+'" class="rfg'+(over?' over':'')+'" stroke-dasharray="'+(C*pc).toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 50 50)"/>':'')+'</svg>'; }
var FVIEW=null; /* תאריך שמוצג ביומן; null = היום */
function dshift(d,n){ var x=new Date(d+'T12:00:00'); x.setDate(x.getDate()+n); return x.getFullYear()+'-'+('0'+(x.getMonth()+1)).slice(-2)+'-'+('0'+x.getDate()).slice(-2); }
function foodNav(n){ var cur=FVIEW||TODAY, d=dshift(cur,n); if(d>TODAY) return; FVIEW=d===TODAY?null:d; api('foodday',{d:d}).then(function(r){ FDAY=r; renderFood(); }).catch(function(e){ toast(e.message,1); }); }
var DELQ=[], DELBUSY=false;
function delSync(r){ var used={}; DELQ.forEach(function(j){ var m=(r.items||[]).filter(function(x){ return !used[x.row]&&x.f===j.f&&+x.k===j.k; })[0]; if(m){ used[m.row]=1; j.row=+m.row; } else j.gone=true; });
  DELQ=DELQ.filter(function(j){ return !j.gone; }); r.items=(r.items||[]).filter(function(x){ return !used[x.row]; }); return r; } /* השורות זזו אחרי כל מחיקה: מעדכנים את מספר השורה של מה שעוד בתור, ולא מחזירים למסך מה שנמחק */
function delPump(){ if(DELBUSY||!DELQ.length) return; DELBUSY=true; var j=DELQ[0];
  api('fooddel',{row:j.row,f:j.f,d:j.d,quiet:1}).then(function(r){ if(r&&r.deleted===false&&j.n++<2){ /* נשאר בראש התור, delSync מתקן את השורה */ } else DELQ.shift(); if(r&&r.items&&FDAY&&r.d===FDAY.d){ FDAY=delSync(r); renderFood(); } })
    .catch(function(e){ DELQ=[]; toast((e&&e.message)||'לא נמחק',1); api('foodday',{d:FDAY.d}).then(function(r){ FDAY=r; renderFood(); }).catch(function(){}); })
    .then(function(){ DELBUSY=false; delPump(); }); }
function renderFood(){
  if(FDAY&&FDAY.d) FVIEW=FDAY.d===TODAY?null:FDAY.d; /* התאריך לפי הנתונים שמוצגים */
  var past=!!FVIEW, vd=FVIEW||TODAY, vlab=past?(vd.slice(8,10)+'/'+vd.slice(5,7)+(dshift(TODAY,-1)===vd?' · אתמול':'')):'היום';
  var fs=document.querySelector('.fsearch'); if(fs) fs.hidden=past;
  var it=FDAY.items||[], s={k:0,p:0,c:0,fat:0}; it.forEach(function(x){ s.k+=+x.k||0; s.p+=+x.p||0; s.c+=+x.c||0; s.fat+=+x.fat||0; });
  var T=targets(), bar=function(v,t){ if(!t) return ''; var pc=Math.min(100,Math.round(v/t*100)); return '<div class="bar"><i class="'+(v>t*1.05?'over':'')+'" style="width:'+pc+'%"></i></div>'; };
  var row=function(lbl,v,t,u){ var l=t?Math.round(t-v):null; return '<div><b class="num">'+(t?Math.abs(l):Math.round(v))+'</b> '+u+'<div class="sub">'+(t?(l>=0?lbl+' · נשאר':lbl+' · מעל'):lbl)+'</div>'+bar(v,t)+'</div>'; }; /* אביאל: מראים כמה נשאר, לא כמה אכלו */
  var tk=T['קלוריות'], left=tk?tk-Math.round(s.k):null;
  $('#fTot').innerHTML='<div class="row fnav"><button type="button" class="swarr" data-fn="-1" aria-label="יום קודם">'+IC_GO+'</button><b>'+vlab+'</b><button type="button" class="swarr prev" data-fn="1" aria-label="יום הבא"'+(past?'':' disabled')+'>'+IC_GO+'</button></div><div class="ftop"><div class="fringw">'+ring(s.k,tk)+'<div class="fringt"><b class="num">'+(tk?Math.abs(left):Math.round(s.k))+'</b><small>'+(tk?(left>=0?'נשארו':'מעל היעד'):'קק״ל')+'</small></div></div>'+
    '<div class="feq"><div><span class="sub">יעד</span><b class="num">'+(tk||'עוד לא')+'</b></div><div class="sub">'+it.length+' רישומים היום</div></div></div>'+
    '<div class="mac">'+row('חלבון',s.p,T['חלבון'],'ג׳')+row('פחמימה',s.c,T['פחמימות'],'ג׳')+row('שומן',s.fat,T['שומן'],'ג׳')+'</div>'+
    (it.length||past?'':'<button type="button" class="ghost fcopy" id="fCopy">העתקת היומן של אתמול</button>');
  document.querySelectorAll('#fTot [data-fn]').forEach(function(b){ b.onclick=function(){ foodNav(+b.dataset.fn); }; });
  var del='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  $('#fItems').innerHTML=MEALS.map(function(ml){ var xs=it.filter(function(x){ return (x.m||mealByTime(x.t))===ml; }), k=xs.reduce(function(a,x){ return a+(+x.k||0); },0);
    return '<div class="fmeal"><div class="fmh"><b>'+ml+'</b><span class="num">'+(xs.length?Math.round(k)+' קק״ל':'')+'</span></div>'+
      xs.map(function(x){ return '<div class="fitem"><span><b>'+esc(x.f)+'</b>'+(+x.g>0?' <small>'+esc(x.g)+' ג׳</small>':'')+'</span><span><span class="num">'+esc(x.k)+'</span> <small>קק״ל</small> '+(x._p?'<small class="fpend">נשמר…</small>':'<button class="ghost sm" data-del="'+x.row+'" data-f="'+esc(x.f)+'" aria-label="מחיקה">'+del+'</button>')+'</span></div>'; }).join('')+
      (past?'':'<button type="button" class="fmadd" data-meal="'+ml+'">+ הוספה ל'+ml+'</button>')+'</div>'; }).join('');
  document.querySelectorAll('#fItems [data-del]').forEach(function(b){ b.onclick=function(){ var row=+b.dataset.del, it=(FDAY.items||[]).filter(function(x){ return +x.row===row&&x.f===b.dataset.f; })[0]; if(!it) return;
    FDAY.items=FDAY.items.filter(function(x){ return x!==it; }); DELQ.push({row:row,f:it.f,k:+it.k,d:FDAY.d,n:0}); renderFood(); delPump(); }; }); /* 30.10.26: מחיקה מיידית — השורה יורדת מהמסך מיד, והשרת מוחק ברקע לפי התור (delPump) */
  document.querySelectorAll('#fItems .fmadd').forEach(function(b){ b.onclick=function(){ FMEAL=b.dataset.meal; drawMealChips(); $('#fQ').scrollIntoView({block:'center',behavior:'smooth'}); $('#fQ').focus(); }; });
  var cp=$('#fCopy'); if(cp) cp.onclick=copyYesterday;
  drawMealChips(); drawRecent();
}
function drawMealChips(){ var w=$('#fMeals'); if(!w) return; var cur=fMeal(); w.innerHTML=MEALS.map(function(m){ return '<button type="button" class="chip" aria-pressed="'+(m===cur)+'" data-m="'+m+'">'+m+'</button>'; }).join('');
  w.querySelectorAll('[data-m]').forEach(function(b){ b.onclick=function(){ FMEAL=b.dataset.m; drawMealChips(); }; }); }
/* מאכלים אחרונים — לחיצה אחת, עם הכמות של הפעם הקודמת (כמו ב-MyFitnessPal) */
function recentAdd(it,g){ if(!it) return; var r=ls('aviel_food_recent',[]).filter(function(x){ return x.name!==it.name; }); r.unshift({name:it.name,p:it.p,c:it.c,fat:it.fat,k100:it.k100||0,units:it.units||[],g:g,n:1}); lsSet('aviel_food_recent',r.slice(0,14)); }
function drawRecent(){ var w=$('#fRecent'); if(!w) return; var r=ls('aviel_food_recent',[]); if(!r.length||$('#fQ').value.trim()){ w.innerHTML=''; return; }
  w.innerHTML='<span class="label">אחרונים</span><div class="frec">'+r.map(function(x,i){ return '<button type="button" data-rc="'+i+'">'+esc(x.name)+'<small>'+x.g+' ג׳</small></button>'; }).join('')+'</div>';
  w.querySelectorAll('[data-rc]').forEach(function(b){ b.onclick=function(){ var x=r[+b.dataset.rc]; pick({name:x.name,p:x.p,c:x.c,fat:x.fat,k100:x.k100,units:x.units,g:x.g}); w.innerHTML=''; }; }); }
function copyYesterday(){ var b=$('#fCopy'), d=new Date(); d.setDate(d.getDate()-1); var ys=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
  b.disabled=true; b.textContent='מעתיק…';
  api('foodday',{d:ys}).then(function(r){ var xs=(r&&r.items)||[]; if(!xs.length){ toast('אתמול לא נרשם כלום',1); b.disabled=false; b.textContent='העתקת היומן של אתמול'; return; }
    return xs.reduce(function(pr,x){ return pr.then(function(){ return api('food',{f:x.f,g:x.g,k:x.k,p:x.p,c:x.c,fat:x.fat,m:x.m||mealByTime(x.t)}); }); },Promise.resolve()).then(function(r2){ FDAY=r2; renderFood(); toast('הועתקו '+xs.length+' רישומים מאתמול'); }); })
  .catch(function(e){ toast(e.message||'לא הצליח',1); api('foodday',{}).then(function(r){ FDAY=r; renderFood(); }).catch(function(){ b.disabled=false; b.textContent='העתקת היומן של אתמול'; }); }); }
/* חיפוש: קודם המאגר המאושר של אביאל, ואז המאגר הלאומי של משרד הבריאות (data.gov.il, ערכים ל-100 ג׳) */
var MOH='https://data.gov.il/api/3/action/datastore_search?resource_id=', MOH_FOODS='c3cb0630-0650-46c1-a068-82d575c094b2', MOH_UNITS='755d28c0-75f7-40e1-9c8c-ecdd106f9b2d', MOH_UNAMES='98fb46fe-e8de-4067-94d2-b0a8ea4269da';
var UNAMES=null, FQT=null, FQN=0;
function unitNames(){ if(UNAMES) return Promise.resolve(UNAMES); return fetch(MOH+MOH_UNAMES+'&limit=300').then(function(r){ return r.json(); }).then(function(j){ UNAMES={}; (j.result.records||[]).forEach(function(r){ var v=Object.keys(r).filter(function(k){ return k!=='_id'; }).map(function(k){ return r[k]; }); UNAMES[String(v[0])]=String(v[1]).trim(); }); return UNAMES; }).catch(function(){ UNAMES={}; return UNAMES; }); }
function shortName(n){ return String(n).replace(/\s+/g,' ').trim(); }
function drawList(local, nat, q){
  var ex=ematch(q);
  /* 30.10.26 אביאל: קודם לפי השם (מתחיל במה שחיפשו, אחר כך מילה שלמה), ובתוך זה לפי קלוריות מהנמוך לגבוה */
  var qq=String(q||'').trim(), nsc=function(n){ n=String(n||'').trim(); return n===qq?0:n.indexOf(qq)===0?1:(' '+n+' ').indexOf(' '+qq+' ')>=0?2:3; }, srt=function(a,nm,kc){ a.sort(function(x,y){ return (nsc(nm(x))-nsc(nm(y)))||((kc(x)||0)-(kc(y)||0)); }); };
  try{ srt(ex,function(f){ return f.name; },function(f){ return +f.k100; }); local=local.slice(); srt(local,function(f){ return f[0]; },function(f){ return 4*f[2]+4*f[3]+9*f[4]; }); if(nat) srt(nat,function(r){ return shortName(r.shmmitzrach); },function(r){ return +r.food_energy; }); }catch(e){}
  /* 4.11.26 (אביאל): בגבינות ומוצרי חלב — האחוז הנמוך ראשון (צהובה 5, 9, 18, 22), מכל המאגרים יחד */
  var DAIRY=/גבינ|קוטג|לבנ|יוגורט|שמנת|מוצרלה|צהובה|בולגרית|פטה|ריקוטה|חלב/.test(qq), fp=function(n,fat){ var m=String(n||'').match(/(\d+(?:\.\d+)?)\s*%/); return m?+m[1]:(+fat||0); }, E=[];
  var h=ex.map(function(f,i){ var t='<button type="button" data-ex="'+i+'"><span class="'+(f.ok?'mine':'tag2')+'">'+(f.ok?'אביאל':'סרוק')+'</span>'+esc(f.name)+(f.brand?' <small>'+esc(f.brand)+'</small>':'')+'<small>'+Math.round(f.k100)+' קק״ל ל-100 ג׳</small></button>'; E.push([nsc(f.name),fp(f.name,f.fat),t]); return t; }).join('');
  h+=local.map(function(f){ var t='<button type="button" data-loc="'+FOODS.indexOf(f)+'"><span class="mine">אביאל</span>'+esc(f[0])+'<small>'+Math.round(4*f[2]+4*f[3]+9*f[4])+' קק״ל ל-100 ג׳, מאגר אביאל</small></button>'; E.push([nsc(f[0]),fp(f[0],f[4]),t]); return t; }).join('');
  if(nat!==null) h+=nat.map(function(r,i){ var t='<button type="button" data-nat="'+i+'">'+esc(shortName(r.shmmitzrach))+'<small>'+Math.round(+r.food_energy||0)+' קק״ל ל-100 ג׳</small></button>'; E.push([nsc(shortName(r.shmmitzrach)),fp(r.shmmitzrach,r.total_fat),t]); return t; }).join('');
  if(DAIRY&&E.length) h=E.sort(function(x,y){ return ((x[0]?1:0)-(y[0]?1:0))||(x[1]-y[1]); }).map(function(x){ return x[2]; }).join('');
  if(nat===null) h+='<div class="sub">מחפש במאגר הלאומי…</div>';
  if(!ex.length&&!local.length&&nat&&!nat.length) h='<div class="sub">לא נמצא במאגרים. מוצר ממותג? סורקים את הברקוד, או מצלמים את התווית.</div><button type="button" class="ghost" data-label="1">צילום התווית</button>';
  $('#fList').innerHTML=q?h:'';
  var exBtns=ex; document.querySelectorAll('#fList [data-ex]').forEach(function(b){ b.onclick=function(){ pickExtra(exBtns[+b.dataset.ex]); }; });
  document.querySelectorAll('#fList [data-loc]').forEach(function(b){ b.onclick=function(){ var f=FOODS[+b.dataset.loc]; pick({name:f[0], p:f[2], c:f[3], fat:f[4], units:[['יחידה / מנה',f[5]]], g:f[5]}); }; });
  var lb=document.querySelector('#fList [data-label]'); if(lb) lb.onclick=function(){ showLabel('', q); };
  document.querySelectorAll('#fList [data-nat]').forEach(function(b){ b.onclick=function(){ var r=nat[+b.dataset.nat]; var it={name:shortName(r.shmmitzrach), p:+r.protein||0, c:+r.carbohydrates||0, fat:+r.total_fat||0, k100:+r.food_energy||0, units:[], g:100};
    pick(it); Promise.all([unitNames(), fetch(MOH+MOH_UNITS+'&limit=20&filters='+encodeURIComponent(JSON.stringify({mmitzrach:String(r.Code)}))).then(function(x){ return x.json(); })]).then(function(z){ var N=z[0]; it.units=(z[1].result.records||[]).map(function(u){ return [N[String(u.mida)]||'מנה', Math.round(+u.mishkal)]; }).filter(function(u){ return u[1]>=5&&u[1]<1000&&!/^(גרם|ק"ג|קילו)/.test(u[0]); }).slice(0,6); if(FSEL===it) drawUnits(); }).catch(function(){}); }; });
}
/* יחידות של אביאל (28.10.26): ביצה L/M לפי קלוריות, פרוסת צהובה, קופסת טונה, גביע קוטג׳/יוגורט/לבנה. לחיצה חוזרת על אותה יחידה = עוד אחת */
var HOUSE_UNITS=[{re:/ביצ(ה|ים)/, not:/שליו|אבקת|חלבון ביצה/, u:[['ביצה L',0,97],['ביצה M',0,83]]},
 {re:/^שמן|שמן זית|שמן קנולה|שמן קוקוס/, not:/דג|טונה|סרדין/, u:[['כף',13],['כפית',5]]},
 {re:/צהובה|גאודה|עמק|אדם|מוצרלה|צ׳דר|צדר|גילבוע|ברי|קממבר/, not:/מגורדת|מגוררת/, u:[['פרוסה',25]]},
 {re:/פסטרמה|נקניק|סלמי|קבנוס|פרוס|מעושן/, not:/לחם|גבינה/, u:[['פרוסה',10]]},
 {re:/שניצל/, u:[['שניצל',120]]},
 {re:/המבורגר/, u:[['קציצת המבורגר',120]]},
 {re:/קציצ/, not:/המבורגר/, u:[['קציצה',60]]},
 {re:/חזה עוף|פרגית|שוקיים|כרעיים|ירכי|עוף|הודו|בשר|סטייק|אנטריקוט|סינטה|פילה|כתף|צלעות|דג |^דג|סלמון|אמנון|לברק|דניס|בקלה|מוסר|טילאפיה/, not:/פרוס|נקניק|פסטרמה|מרק|קציצ|שניצל|המבורגר|טחון|שמן|ממרח|אבקת/, u:[['מנה',150],['חצי מנה',75]]},
 {re:/טחון/, u:[['מנה',120]]},
 {re:/חטיף/, u:[['חטיף',40]]},
 {re:/מנגו/, u:[['מנגו',200],['חצי מנגו',100]]},
 {re:/תפוז|אשכולית/, u:[['פרי',150]]},
 {re:/קלמנטינה|מנדרינה/, u:[['קלמנטינה',70]]},
 {re:/אפרסק|נקטרינה|אגס/, u:[['פרי',150]]},
 {re:/קיווי/, u:[['קיווי',75]]},
 {re:/ענבים|דובדבנ|תות/, u:[['חופן',80]]},
 {re:/מלפפון/, u:[['מלפפון',100]]},
 {re:/עגבני(?!ות שרי)/, not:/שרי|רסק|רוטב/, u:[['עגבנייה',120]]},
 {re:/גמבה|פלפל אדום|פלפל צהוב/, u:[['פלפל',150],['חצי',75]]},
 {re:/טחינה/, u:[['כף',15],['כפית',5]]},
 {re:/חמאת בוטנים|חמאת שקדים/, u:[['כף',16],['כפית',5]]},
 {re:/דבש|סילאן|ריבה|מייפל/, u:[['כפית',7],['כף',21]]},
 {re:/^סוכר/, u:[['כפית',4]]},
 {re:/מיונז/, u:[['כף',14],['כפית',5]]},
 {re:/קטשופ/, u:[['כף',17]]},
 {re:/^חומוס|ממרח חומוס/, not:/גרגירי/, u:[['כף',20]]},
 {re:/(אורז|פסטה|קינואה|בורגול|קוסקוס|פתיתים|ספגטי).*(מבושל|מוכן)|(מבושל|מוכן).*(אורז|פסטה|קינואה|בורגול|קוסקוס|פתיתים)/, not:/דפי|פריך|קמח|לא מבושל|לא מוכן|יבש|גולמי/, u:[['כוס',160],['חצי כוס',80]]},
 {re:/שיבולת|קוואקר|דייסת/, u:[['כף',10],['חצי כוס',40]]},
 {re:/גרנולה/, u:[['חצי כוס',50],['כף',12]]},
 {re:/שקד|אגוז|קשיו|פקאן|פיסטוק|בוטנים/, not:/חמאת|חלב/, u:[['חופן',30],['כף',10]]},
 {re:/^חלב(?!ון)|משקה (סויה|שקדים|שיבולת)/, not:/אבקת|מרוכז/, u:[['כוס',240],['חצי כוס',120]]},
 {re:/לחם|פרוסת/, not:/פירורי|כוסמין פריך/, u:[['פרוסה',30]]},
 {re:/פיתה/, u:[['פיתה',90],['חצי פיתה',45]]},
 {re:/טורטיה|לאפה/, u:[['יחידה',40]]},
 {re:/אבוקדו/, u:[['חצי',70],['רבע',35]]},
 {re:/בננה/, u:[['בננה',100]]},
 {re:/תפוח(?! אדמה)/, u:[['תפוח בינוני',180]]},
 {re:/תמר/, u:[['תמר',8]]},
 {re:/פריכי|פריכית/, u:[['פריכית',9]]},
 {re:/טונה/, u:[['קופסה',100]]},
 {re:/קוטג/, u:[['גביע שלם',250],['כף',30]]},
 {re:/יוגורט|יופלה|פרו /, u:[['גביע',200]]},
 {re:/לבנה/, not:/שעועית|גבינה/, u:[['גביע',250],['כף',25]]},
 {re:/גבינה לבנה/, u:[['גביע',250],['כף',30]]},
 {re:/^(אורז|פסטה|קינואה|בורגול|כוסמת|פתיתים|קוסקוס|עדשים|גרגירי חומוס|מג.?דרה)/, not:/יבש|לא מבושל|דפי|פריך/, u:[['כוס מבושל',160],['חצי כוס',80]]}];
function houseUnits(it){ var n=String(it&&it.name||''), out=[], k100=+it.k100||((+it.p||0)*4+(+it.c||0)*4+(+it.fat||0)*9); HOUSE_UNITS.forEach(function(r){ if(!r.re.test(n)||(r.not&&r.not.test(n))) return; r.u.forEach(function(x){ var g=x[1]; if(x[2]) g=k100?Math.round(x[2]*100/k100):0; if(g>0&&!out.some(function(o){ return o[0]===x[0]; })) out.push([x[0],g]); }); }); return out; }
var UNITN={}; 
/* כמות במילים (28.10.26, אביאל: "הקטע של הביצה לא נוח"): בוחרים יחידה (ביצה L / פרוסה / גרם) ולוחצים − 1 +. הגרמים מחושבים לבד */
var FU=null, FQTY=1;
function pick(it){ FSEL=it; UNITN={}; var hu=allUnits(it); $('#fAdd').hidden=false; FU=hu.length?{n:hu[0][0],g:+hu[0][1]}:null; FQTY=1; $('#fG').value=FU?FU.g:(it.g||100); $('#fList').innerHTML=''; $('#fQ').value=it.name; drawUnits(); updPick(); if(!FU) $('#fG').focus(); }
/* 30.10.26 אביאל: "פסטרמה בכפות זה לא הגיוני" — מאכלים מוצקים לא מקבלים כף / כפית / כוס מהמאגר הלאומי */
var NO_SPOON=/פסטרמה|נקניק|סלמי|קבנוס|חזה|עוף|הודו|בשר|סטייק|אנטריקוט|סינטה|שניצל|קציצ|המבורגר|דג |^דג|סלמון|אמנון|טונה|ביצ|לחם|פיתה|לאפה|טורטיה|צהובה|גאודה|עמק|מוצרלה|תפוח|בננה|מנגו|תפוז|אגס|אפרסק|קיווי|מלפפון|עגבני|גמבה|פלפל|חטיף|פריכי|תמר/;
function unitSane(it,u){ var n=String(it&&it.name||''); if(!NO_SPOON.test(n)||/מבושל.*(אורז|פסטה)|ממרח|רוטב|מרק|שמן/.test(n)) return u; return u.filter(function(x){ return !/(^|\s)(כף|כפית|כפות|כוס|כוסות)(\s|$)/.test(String(x[0])); }); }
function allUnits(it){ return unitSane(it,allUnits0(it)); }
/* "יחידה / מנה" לא אומר כלום — שם אמיתי לפי המאכל (30.10.26) */
var GEN_NAMES=[[/חלבון ביצה/,'חלבון אחד'],[/אבקת חלבון/,'סקופ'],[/מעדן|יוגורט/,'גביע'],[/משקה|שייק/,'בקבוק'],[/לחמני/,'לחמנייה'],[/בולגרית|פטה/,'קובייה'],[/דפי אורז/,'דף'],[/קרקר/,'קרקר'],[/פלאפל/,'כדור'],[/זית/,'זית'],[/שום/,'שן'],[/תפוח אדמה/,'תפוח אדמה בינוני'],[/בטטה/,'בטטה קטנה'],[/תירס/,'קלח'],[/שוקולד/,'שורה'],[/חלווה/,'פרוסה'],[/אבטיח|מלון|אננס/,'פרוסה'],[/שזיף|גזר|בצל/,'יחידה'],[/ברוקולי|כרובית|שעועית ירוקה|פטריות|ירקות|טופו|אדממה|קורנפלקס|פירות יער/,'מנה'],[/זרעי|מיוקל|קמח|פרמזן/,'כף'],[/שמנת/,'כוס'],[/חמאה/,'כפית']];
function allUnits0(it){ var hu=houseUnits(it), nm=String(it&&it.name||''); if(!it.own&&it.units){ it=Object.assign({},it,{units:(it.units||[]).filter(function(x){ return !(hu.length&&/יחידה \/ מנה/.test(x[0])); }).map(function(x){ if(!/יחידה \/ מנה/.test(x[0])) return x; var g=GEN_NAMES.filter(function(r){ return r[0].test(nm); })[0]; return [g?g[1]:'מנה',x[1]]; }).filter(function(x){ return +x[1]>=5||/זית|שן|קרקר|דף/.test(x[0]); })}); } if(it.own){ var own=(it.units||[]).filter(function(x){ return +x[1]>0; }); if(own[0]&&own[0][1]>=30) own=own.concat([['חצי '+own[0][0],Math.round(own[0][1]/2)]]); return own.concat(hu.filter(function(h){ return !own.some(function(o){ return o[0]===h[0]||h[0].indexOf(o[0])>=0||Math.abs(+o[1]-+h[1])<1; }); })); } return hu.concat((it.units||[]).filter(function(x){ return !hu.some(function(h){ return h[0]===x[0]||Math.abs(+h[1]-+x[1])<1; }); })).filter(function(x){ return +x[1]>0; }); } /* בלי "יחידה / מנה · 13 ג׳" כשכבר יש "כף" */
function drawUnits(){ var it=FSEL; if(!it) return; var u=allUnits(it);
  $('#fUnits').innerHTML=u.map(function(x){ return '<button type="button" class="chip'+(FU&&FU.n===x[0]?' on':'')+'" data-u="'+esc(x[0])+'" data-g="'+x[1]+'">'+esc(x[0])+'</button>'; }).join('')+'<button type="button" class="chip'+(FU?'':' on')+'" data-u="" data-g="">גרם</button>';
  var st=document.getElementById('fStep'); if(!st){ st=document.createElement('div'); st.id='fStep'; st.className='fstep'; $('#fUnits').parentNode.insertBefore(st,$('#fUnits').nextSibling); }
  if(FU){ st.hidden=false; st.innerHTML='<button type="button" data-q="-1" aria-label="פחות">−</button><b class="num">'+(FQTY%1?FQTY.toFixed(1):FQTY)+'</b><button type="button" data-q="1" aria-label="יותר">+</button><span>'+esc(FU.n)+'<small>'+Math.round(FU.g*FQTY)+' ג׳</small></span>'; $('#fG').value=Math.round(FU.g*FQTY); $('#fG').classList.add('fhideg');
    st.querySelectorAll('[data-q]').forEach(function(b){ b.onclick=function(){ var d=+b.dataset.q, step=FQTY<=1&&d<0||FQTY<1?0.5:1; FQTY=Math.max(0.5,Math.round((FQTY+d*step)*2)/2); drawUnits(); updPick(); }; }); }
  else { st.hidden=true; $('#fG').classList.remove('fhideg'); }
  document.querySelectorAll('#fUnits .chip').forEach(function(c){ c.onclick=function(){ if(c.dataset.u){ FU={n:c.dataset.u,g:+c.dataset.g}; FQTY=1; } else { FU=null; $('#fG').value=Math.round(+$('#fG').value||100); setTimeout(function(){ $('#fG').focus(); $('#fG').select(); },50); } drawUnits(); updPick(); }; }); }
(function(){ var st=document.createElement('style'); st.textContent='.fstep{display:flex;align-items:center;gap:10px;margin:10px 0 4px}.fstep button{width:46px;height:46px;min-height:0;padding:0;border-radius:50%;font-size:24px;font-weight:700;background:var(--panel2);border:1px solid var(--line);color:var(--text)}.fstep b{min-width:44px;text-align:center;font-size:24px}.fstep span{display:flex;flex-direction:column;font-weight:700}.fstep small{color:var(--mute);font-weight:600}.fhideg{display:none!important}'; document.head.appendChild(st); })();
$('#fQ').addEventListener('input',function(){ $('#fLabel').hidden=true; drawRecent(); var q=this.value.trim(), local=fmatch(q).slice(0,5); clearTimeout(FQT); if(q.length<2){ drawList(local,[],q); return; } drawList(local,null,q); var my=++FQN;
  var loc=mohLocal(q); if(loc){ drawList(local,loc,q); return; }
  FQT=setTimeout(function(){ fetch(MOH+MOH_FOODS+'&limit=25&fields=Code,smlmitzrach,shmmitzrach,protein,total_fat,carbohydrates,food_energy&q='+encodeURIComponent(q)).then(function(r){ return r.json(); }).then(function(j){ if(my!==FQN) return; drawList(local,(j.result&&j.result.records)||[],q); }).catch(function(){ if(my===FQN) drawList(local,[],q); }); },350); });
function mac(f,g){ var r=g/100, p=f.p*r, c=f.c*r, fat=f.fat*r; return {p:Math.round(p*10)/10, c:Math.round(c*10)/10, fat:Math.round(fat*10)/10, k:Math.round(f.k100?f.k100*r:4*p+4*c+9*fat)}; }
function updPick(){ if(!FSEL) return; var g=+$('#fG').value||0, m=mac(FSEL,g); $('#fPick').textContent=g?((FU?(FQTY%1?FQTY.toFixed(1):FQTY)+' × '+FU.n:g+' ג׳ '+FSEL.name)+' = '+m.k+' קק״ל · '+m.p+' ג׳ חלבון'):''; }
$('#fG').addEventListener('input',updPick);
$('#fAdd').addEventListener('submit',function(e){ e.preventDefault(); var g=Math.round(+$('#fG').value); if(!FSEL||!(g>0&&g<3000)){ toast('בוחרים מאכל וכמות בגרם',1); return; }
  var m=mac(FSEL,g); $('#fBtn').disabled=true;
  /* הוספה מיידית: הפריט מופיע ביומן מיד (מסומן "נשמר…"), השרת מאשר ברקע. אם נכשל, הפריט יורד והבחירה נשארת */
  var sel=FSEL, ml=fMeal(), pend={f:FSEL.name.slice(0,80),g:g,k:m.k,p:m.p,c:m.c,fat:m.fat,m:ml,_p:1}; FDAY=FDAY||{d:TODAY,items:[]}; FDAY.items=(FDAY.items||[]).concat([pend]);
  recentAdd(sel,g); renderFood(); toast('נוסף · '+m.k+' קק״ל'); FSEL=null; $('#fAdd').hidden=true; $('#fQ').value=''; $('#fPick').textContent=''; $('#fBtn').disabled=false;
  api('food',{f:pend.f,g:g,k:m.k,p:m.p,c:m.c,fat:m.fat,m:ml}).then(function(r){ FDAY=r; renderFood(); }).catch(function(er){ FDAY.items=(FDAY.items||[]).filter(function(x){ return x!==pend; }); renderFood(); FSEL=sel; $('#fAdd').hidden=false; $('#fG').value=g; updPick(); toast(er.message||'לא נשמר, נסו שוב',1); }); });


/* ----- מאגר המזון של אביאל (מוצרים סרוקים) + סריקת ברקוד + צילום תווית ----- */
/* המאגר הלאומי של משרד הבריאות (4,600 מזונות, ערכים ל-100 ג׳) — נטען פעם אחת לטלפון, החיפוש מיידי וגם בלי אינטרנט */
var MOHL=null; function loadMoh(){ if(MOHL) return; fetch('../data/foods-moh.json').then(function(r){ return r.json(); }).then(function(d){ MOHL=d; }).catch(function(){}); }
function mohLocal(q){ if(!MOHL) return null; var ws=q.split(/\s+/).filter(Boolean);
  return MOHL.filter(function(f){ return ws.every(function(w){ return f[0].indexOf(w)>=0; }); })
    .sort(function(a,b){ var sc=function(n){ return (n.indexOf(q)===0?0:n.indexOf(ws[0])===0?300:800)+(ws.some(function(w){ return n.indexOf('לא '+w)>=0; })?3000:0)+n.length; }; return sc(a[0])-sc(b[0]); }).slice(0,25) /* "אורז מבושל": מבושל קודם, "לא מבושל" בסוף */
    .map(function(f){ return {shmmitzrach:f[0], protein:f[1], carbohydrates:f[2], total_fat:f[3], food_energy:f[4], Code:f[5]}; }); }
var EXTRA=[]; function loadExtra(){ loadMoh(); api('foods',{}).then(function(r){ EXTRA=r||[]; }).catch(function(){}); }
function ematch(q){ q=String(q||'').trim(); if(q.length<2) return []; return EXTRA.filter(function(f){ return f.name.indexOf(q)>=0||(f.brand&&f.brand.indexOf(q)>=0); }).slice(0,6); }
function pickExtra(f){ var g=+f.g||100, un=g!==100?(function(n){ return /פיתה/.test(n)?'פיתה':/טורטיה|לאפה/.test(n)?'טורטיה':/חטיף/.test(n)?'חטיף':/משקה|בקבוק/.test(n)?'בקבוק':/יוגורט|מעדן|דנונה|יופלה|מולר|גביע|קוטג/.test(n)?'גביע':/במבה|ביסלי|שקית/.test(n)?'שקית':/נודלס|חבילה/.test(n)?'חבילה':/דגני|קראנץ|פצפוצ/.test(n)?'מנה':/פרוסה|לחם/.test(n)?'פרוסה':/קופסה|טונה/.test(n)?'קופסה':'יחידה'; })(String(f.name)):'מנה'; pick({name:f.name+(f.brand?' '+f.brand:''), p:f.p, c:f.c, fat:f.fat, k100:f.k100, units:[[un,g]], g:g, own:g!==100}); } /* מוצר מהמאגר של אביאל עם משקל יחידה: היחידה שלו קודמת (פיתה 55 ג׳, לא 90) */
var SCAN={reader:null,stream:null,off:null};
/* מצלמה פעם אחת לכל פתיחה של האפליקציה (30.10.26): אייפון שואל שוב על כל getUserMedia אחרי שהמצלמה נעצרה — אז הזרם נשמר מושהה 3 דק׳ אחרי סגירה וחוזר בלי שאלה */
function camKill(){ SCAN.reader=null; /* בלי reset — הוא היה עוצר את הזרם המשותף; הזרם נעצר כאן */ try{ (SCAN.stream&&SCAN.stream.getTracks()||[]).forEach(function(t){ t.stop(); }); }catch(e){} SCAN.stream=null; }
function camGet(){ clearTimeout(SCAN.off); var st=SCAN.stream; if(st&&st.getTracks().some(function(t){ return t.readyState==='live'; })){ st.getTracks().forEach(function(t){ t.enabled=true; }); return Promise.resolve(st); }
  return navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(function(s2){ SCAN.stream=s2; return s2; }); }
function scanStop(){ try{ if(SCAN.reader&&SCAN.reader.stopContinuousDecode) SCAN.reader.stopContinuousDecode(); }catch(e){} try{ $('#scanV').pause(); }catch(e){}
  try{ (SCAN.stream&&SCAN.stream.getTracks()||[]).forEach(function(t){ t.enabled=false; }); }catch(e){} clearTimeout(SCAN.off); SCAN.off=setTimeout(camKill,180000); $('#scan').hidden=true; }
document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='hidden'&&$('#scan').hidden) camKill(); });
function camFail(){ scanStop(); camKill(); toast('אין גישה למצלמה. מאשרים מצלמה בהגדרות הטלפון ומנסים שוב.',1); }
function scanStart(){ $('#scan').hidden=false; var v=$('#scanV');
  if(!window.BarcodeDetector&&!window.ZXing){ scanStop(); toast('הסורק עוד נטען, מנסים שוב בעוד רגע',1); return; }
  camGet().then(function(st){ if($('#scan').hidden) throw 'closed'; v.srcObject=st; v.setAttribute('playsinline',''); return v.play().then(function(){ return st; }); }).then(function(st){
    if(window.BarcodeDetector){ var det=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']});
      (function loop(){ if($('#scan').hidden) return; det.detect(v).then(function(r){ if(r&&r.length&&String(r[0].rawValue||'').replace(/\D/g,'')) onCode(r[0].rawValue); else setTimeout(loop,250); }).catch(function(){ setTimeout(loop,400); }); })(); return; }
    try{ if(SCAN.reader&&SCAN.reader.stopContinuousDecode) SCAN.reader.stopContinuousDecode(); }catch(e){} { var hints=new Map(); hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.EAN_8,ZXing.BarcodeFormat.UPC_A,ZXing.BarcodeFormat.UPC_E,ZXing.BarcodeFormat.CODE_128]); SCAN.reader=new ZXing.BrowserMultiFormatReader(hints); }
    SCAN.reader.decodeFromStream(st,v,function(res){ if(res&&!$('#scan').hidden) onCode(res.getText()); }).catch(function(){}); }).catch(function(e){ if(e!=='closed') camFail(); });
}
function onCode(code){ code=String(code||'').replace(/\D/g,''); if(!code) return; scanStop(); try{ if(navigator.vibrate) navigator.vibrate(60); }catch(e){}
  var nz=function(c){ return String(c||'').replace(/^0+/,''); }, ex=EXTRA.filter(function(f){ return f.code&&nz(f.code)===nz(code); })[0]; /* ברקוד שמתחיל ב-0 נשמר בגיליון בלי האפס */ if(ex){ pickExtra(ex); toast('נמצא במאגר של אביאל'); return; }
  toast('מחפש את הברקוד…');
  fetch('https://world.openfoodfacts.org/api/v2/product/'+code+'.json?fields=product_name,product_name_he,brands,nutriments,serving_quantity').then(function(r){ return r.json(); }).then(function(j){
    var p=j&&j.status===1&&j.product, n=(p&&p.nutriments)||{}; var k=+n['energy-kcal_100g']||0, pr=+n.proteins_100g||0, c=+n.carbohydrates_100g||0, fat=+n.fat_100g||0;
    if(!p||(!k&&!pr&&!c&&!fat)){ showLabel(code,''); return; }
    var it={code:code, name:String(p.product_name_he||p.product_name||('מוצר '+code)).slice(0,80), brand:String(p.brands||'').split(',')[0].trim(), k100:k, p:pr, c:c, fat:fat, g:Math.round(+p.serving_quantity)||100, ok:false};
    pickExtra(it); toast('נמצא: '+it.name); api('foodsave',it).then(function(){ loadExtra(); }).catch(function(){});
  }).catch(function(){ showLabel(code,''); });
}
function showLabel(code,q){ var L=$('#fLabel'); L.hidden=false; L.dataset.code=code||''; $('#fList').innerHTML=''; $('#fAdd').hidden=true; $('#flName').value=q||''; $('#flName').focus(); }
$('#fScan').onclick=scanStart; $('#scanX').onclick=scanStop;
$('#flIn').addEventListener('change',function(){ var file=this.files&&this.files[0]; if(!file) return; var nm=$('#flName').value.trim(); if(!nm){ toast('קודם כותבים את שם המוצר',1); this.value=''; return; } toast('קורא את התווית…');
  shrink(file,1280,.82).then(function(img){ return fetch(API,{method:'POST',body:JSON.stringify({api:'foodlabel',t:T,p:{code:$('#fLabel').dataset.code||'',name:nm,photo:img}})}).then(function(r){ return r.json(); }).then(function(j){ if(!j.ok) throw new Error(j.error); $('#fLabel').hidden=true; $('#fQ').value='';
    var r=j.r||j; if(!(r&&r.approved)){ toast('לא הצלחתי לקרוא את הערכים מהתמונה. אביאל יבדוק ויוסיף, ובינתיים אפשר לרשום ביומן ידנית',1); return; }
    /* 4.11.26 (אביאל: "שמי שסורק יוכל גם להוסיף אותו ישר"): הערכים נקראו מהתווית — המוצר נפתח מיד להוספה ליומן */
    return api('foods',{}).then(function(L){ EXTRA=L||[]; var nm2=nm.trim(), it=EXTRA.filter(function(f){ return String(f.name).trim()===nm2; }).pop(); if(it){ pickExtra(it); toast('נקרא מהתווית: '+Math.round(it.k100)+' קק״ל ל-100 ג׳. בוחרים כמות ומוסיפים'); } else toast('נשמר במאגר. מחפשים אותו בשם ומוסיפים'); }); }); })
  .catch(function(e){ toast((e&&e.message)||'לא נשלח',1); }); this.value=''; });
if(T) loadExtra();

/* ----- תמונות ----- */
function shrink(file,max,q){ return new Promise(function(res,rej){ var img=new Image(), u=URL.createObjectURL(file); img.onload=function(){ var s=Math.min(1,max/Math.max(img.width,img.height)), c=document.createElement('canvas'); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s); c.getContext('2d').drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg',q)); }; img.onerror=rej; img.src=u; }); }
function renderPhotos(L){ var box=$('#phBox'); if(!L||!L.length){ box.innerHTML='<div class="sub" style="padding-top:8px">עוד אין תמונות. התמונה הראשונה היא נקודת ההתחלה.</div>'; return; }
  var f=L[0], l=L[L.length-1], d=function(x){ return x.d.slice(8,10)+'/'+x.d.slice(5,7); };
  box.innerHTML=(L.length>1?'<div class="cmp"><figure><img src="'+f.data+'" alt="תמונה ראשונה"><figcaption>התחלה · '+d(f)+'</figcaption></figure><figure><img src="'+l.data+'" alt="תמונה אחרונה"><figcaption>עכשיו · '+d(l)+'</figcaption></figure></div>':'')+
    '<div class="photos">'+L.slice().reverse().map(function(x){ return '<figure><img src="'+x.data+'" alt=""><figcaption>'+d(x)+'</figcaption></figure>'; }).join('')+'</div>'; }
$('#msIn').addEventListener('change',function(){ var file=this.files&&this.files[0]; this.value=''; if(!file) return; mealShot(file); });
/* צילום ארוחה (28.10.26): התמונה נשמרת אצל אביאל, וג'מיני מעריך מאכלים, משקל וערכים. המתאמן בוחר מה לרשום ביומן */
function mealShot(file){ var ov=document.createElement('div'); ov.className='msov'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-label','צילום ארוחה');
  ov.innerHTML='<div class="msbox mshot"><div class="mspin" aria-hidden="true"></div><h2>מנתח את הצלחת…</h2><p class="sub">כמה שניות. התמונה נשמרת גם אצל אביאל.</p></div>'; document.body.appendChild(ov);
  var close=function(){ ov.remove(); }, ml=fMeal();
  shrink(file,1024,.78).then(function(img){ return fetch(API,{method:'POST',body:JSON.stringify({api:'mealphoto',t:T,p:{photo:img,meal:ml}})}).then(function(r){ return r.json().catch(function(){ throw new Error('השרת לא זמין כרגע. נסו שוב בעוד רגע'); }); }); })
  .then(function(j){ if(!j.ok) throw new Error(j.error||'לא נשלח'); var an=(j.r&&j.r.an)||{}, it=an.items||[], box=ov.querySelector('.msbox');
    if(!it.length){ box.innerHTML='<h2>התמונה אצל אביאל</h2><p class="sub">'+esc(an.note||(an.err?'הניתוח האוטומטי לא זמין כרגע. אביאל יראה את התמונה.':'לא זיהיתי מאכלים בתמונה.'))+'</p><button type="button" id="msOk">סגירה</button>'; box.querySelector('#msOk').onclick=close; return; }
    var draw=function(){ var on=it.filter(function(x){ return !x.off; }), t={k:0,p:0,c:0,f:0}; on.forEach(function(x){ t.k+=x.k; t.p+=x.p; t.c+=x.c; t.f+=x.f; });
      box.innerHTML='<h2>מה יש בצלחת</h2><p class="sub">הערכה לפי התמונה. מורידים מה שלא אכלתם, ואז רושמים.</p><div class="msl">'+it.map(function(x,i){ return '<button type="button" class="msi'+(x.off?' off':'')+'" data-i="'+i+'" aria-pressed="'+!x.off+'"><span class="tdc">'+(x.off?'':IC_OK)+'</span><span class="msn"><b>'+esc(x.n)+'</b><small>'+(x.g?x.g+' ג׳ · ':'')+x.p+' ח׳ · '+x.c+' פ׳ · '+x.f+' ש׳</small></span><span class="num">'+x.k+'</span></button>'; }).join('')+'</div>'+
        '<div class="mstot"><span>סה״כ</span><b class="num">'+t.k+' קק״ל</b><small>'+t.p+' חלבון · '+t.c+' פחמימה · '+t.f+' שומן</small></div>'+(an.note?'<p class="msnote">'+esc(an.note)+'</p>':'')+
        '<button type="button" id="msLog"'+(on.length?'':' disabled')+'>לרשום ביומן ('+esc(ml)+')</button><button type="button" class="ghost" id="msX">בלי לרשום</button>';
      box.querySelectorAll('.msi').forEach(function(b){ b.onclick=function(){ var x=it[+b.dataset.i]; x.off=!x.off; draw(); }; });
      box.querySelector('#msX').onclick=close;
      box.querySelector('#msLog').onclick=function(){ var bt=this; bt.disabled=true; bt.textContent='רושם…'; var q=Promise.resolve();
        on.forEach(function(x){ q=q.then(function(){ return api('food',{f:x.n+' (צילום)',g:x.g||0,k:x.k,p:x.p,c:x.c,fat:x.f,m:ml}).then(function(r){ FDAY=r; }); }); });
        q.then(function(){ close(); toast('נרשם ביומן: '+t.k+' קק״ל'); try{ renderFood(); }catch(e){} try{ renderTodayCard(); }catch(e){} }).catch(function(e){ bt.disabled=false; bt.textContent='לנסות שוב'; toast(e.message||'לא נרשם',1); }); }; };
    draw(); })
  .catch(function(e){ var box=ov.querySelector('.msbox'); box.innerHTML='<h2>התמונה לא נשלחה</h2><p class="sub">'+esc(e.message||'נסו שוב בעוד רגע')+'</p><button type="button" id="msOk">סגירה</button>'; box.querySelector('#msOk').onclick=close; }); }
$('#phIn').addEventListener('change',function(){ var file=this.files&&this.files[0]; if(!file) return; toast('מעלה את התמונה…');
  Promise.all([shrink(file,1280,.82),shrink(file,320,.7)]).then(function(x){
    return fetch(API,{method:'POST',body:JSON.stringify({api:'photo',t:T,p:{full:x[0],thumb:x[1]}})}).then(function(r){ return r.json(); }).then(function(j){ if(!j.ok) throw new Error(j.error); renderPhotos(j.r); toast('התמונה נשמרה ✓'); });
  }).catch(function(e){ toast((e&&e.message)||'התמונה לא נשמרה',1); }); this.value=''; });

/* ----- התראות ----- */
function b64ToU8(s){ s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; var r=atob(s), u=new Uint8Array(r.length); for(var i=0;i<r.length;i++) u[i]=r.charCodeAt(i); return u; }
(function(){
  var can='serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  var sa=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true, iosDev=/iphone|ipad|ipod/i.test(navigator.userAgent);
  var done=false; try{ done=localStorage.getItem('aviel_push')==='1'; }catch(e){}
  try{ caches.open('aviel-beta-t').then(function(c){ c.put('token', new Response(T)); }); }catch(e){}
  if(done&&can&&Notification.permission==='granted'){ navigator.serviceWorker.ready.then(function(reg){ return reg.pushManager.getSubscription().then(function(sub){ return sub||api('vapid').then(function(v){ return reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64ToU8(v.pub)}); }); }); }).then(function(sub){ if(sub) return api('pushsub',{sub:{endpoint:sub.endpoint}}); }).catch(function(){}); return; } /* השרת מוחק מנוי שנפל (התקנה מחדש וכו׳) — נרשמים שוב בשקט */
  var pc=$('#pushCard'); if(pc&&pc.parentNode){ pc.style.borderColor='var(--gold)'; var hm=document.querySelector('section[data-view="home"]'), fc=hm&&hm.querySelector('.card'); if(hm&&fc&&fc!==pc) fc.parentNode.insertBefore(pc,fc); } /* ראשון בבית: בלי זה שום תזכורת לא מגיעה */
  if(iosDev&&!sa){ $('#pushCard').hidden=false; $('#pushTxt').innerHTML='כדי לקבל ממני תזכורות באייפון:<br>1. לוחצים על כפתור השיתוף בספארי (ריבוע עם חץ)<br>2. "הוספה למסך הבית"<br>3. פותחים את האפליקציה מהאייקון ולוחצים כאן "הפעלת תזכורות"'; $('#pushBtn').hidden=true; }
  else if(can&&!(done&&Notification.permission==='granted')){ $('#pushCard').hidden=false; }
  $('#pushX').onclick=function(){ $('#pushCard').hidden=true; };
  $('#pushBtn').onclick=function(){ var b=this; b.disabled=true;
    Notification.requestPermission().then(function(p){ if(p!=='granted') throw new Error('לא אושרו התראות. אפשר לאשר בהגדרות הטלפון.');
      return Promise.all([navigator.serviceWorker.ready, api('vapid')]); })
    .then(function(x){ return x[0].pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64ToU8(x[1].pub)}); })
    .then(function(sub){ return api('pushsub',{sub:{endpoint:sub.endpoint}}); })
    .then(function(){ try{ localStorage.setItem('aviel_push','1'); }catch(e){} $('#pushCard').hidden=true; toast('התזכורות הופעלו'); })
    .catch(function(e){ toast((e&&e.message)||'לא הצלחנו להפעיל',1); b.disabled=false; }); };
})();

/* ----- טעינת נתוני בטא ----- */
document.querySelector('[data-tab=food]').addEventListener('click',function(){ FVIEW=null; api('foodday',{}).then(function(r){ FDAY=r; renderFood(); }).catch(function(){}); });
document.querySelector('[data-tab=prog]').addEventListener('click',function(){ api('photos',{}).then(function(r){ renderPhotos(r); }).catch(function(){}); });
if(T){ api('foodday',{}).then(function(r){ FDAY=r; renderFood(); }).catch(function(){ renderFood(); }); api('photos',{}).then(function(r){ renderPhotos(r); }).catch(function(){ renderPhotos([]); }); }
</script>
"""


SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>'
MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>'

# ===== שכבת עיצוב יוקרתית (20.10.26): שמנת/דיו/זהב, כותרות Frank Ruhl Libre, שדות לבנים, כפתורים כהים =====
LUX_CSS = """
:root{--f-display:'Frank Ruhl Libre','Assistant',Georgia,serif;--cta:#d6b066;--cta-t:#120f0a;--soft:rgba(214,176,102,.14);--sh:0 1px 2px rgba(0,0,0,.25),0 12px 32px -16px rgba(0,0,0,.6);--ink:#0e0d0b;--panel:#181612;--panel2:#211e19;--line:#2f2a22;--text:#f2ece1;--mute:#a59c8d;--gold:#d6b066;--gold-d:#9c7d42}
:root[data-theme="light"]{--ink:#f7f3ec;--panel:#fffdf9;--panel2:#f4efe6;--line:#e8e0d2;--text:#1c1813;--mute:#6b6257;--gold:#8a6220;--gold-d:#c9a560;--cta:#1c1813;--cta-t:#f7f3ec;--soft:#f5ecdb;--sh:0 1px 2px rgba(40,30,10,.05),0 14px 34px -18px rgba(40,30,10,.18)}
body{font-size:15.5px;line-height:1.55;-webkit-font-smoothing:antialiased}
::selection{background:var(--soft);color:var(--text)}
input,textarea{caret-color:var(--gold)}
*{scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.num,.kpi b,.setrow input,.dot{font-variant-numeric:tabular-nums}
header.top{padding:14px 0 8px}
.brand{font-family:'Assistant',Arial,sans-serif;font-weight:800;font-size:13px;letter-spacing:.16em;color:var(--text)}
.beta{background:transparent!important;color:var(--gold)!important;border:1px solid var(--gold-d);letter-spacing:0;font-weight:700}
h1{font-family:var(--f-display);font-weight:700;font-size:31px;line-height:1.15;letter-spacing:-.01em;margin:10px 0 4px;text-wrap:balance}
.meal h3{font-family:var(--f-display);font-weight:700;font-size:20px}
.sub{font-size:14.5px;line-height:1.5}
.card,.kpi{background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:var(--sh)}
.card{padding:18px}
.stack{gap:16px;margin-top:18px}
.label{font-size:12.5px;letter-spacing:.02em;color:var(--mute)}
button{background:var(--cta);color:var(--cta-t);border-radius:14px;font-weight:700;transition:transform .15s cubic-bezier(.2,.8,.2,1),background-color .2s,opacity .2s}
button:active{transform:scale(.98)}
button.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
.installbtn,.weigh button,.steps button,.sheet-in button{min-height:48px}
.open{background:var(--cta);color:var(--cta-t);border-radius:14px}
.wa{border-radius:14px;background:var(--panel)}
input,textarea,.setrow select{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:14px;font-weight:700;transition:border-color .2s,box-shadow .2s}
input::placeholder,textarea::placeholder{color:var(--mute);font-weight:500;opacity:1}
input:focus,textarea:focus,.setrow select:focus{outline:none;border-color:var(--gold-d);box-shadow:0 0 0 3px var(--soft)}
button:focus-visible,a:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.chip{background:transparent;color:var(--mute);border:1px solid var(--line);font-weight:700}
.chip[aria-pressed="true"]{background:var(--cta);color:var(--cta-t);border-color:var(--cta)}
.chip[aria-pressed="true"].done::after{color:var(--cta-t)}
.scale button,.pct button{background:var(--panel);color:var(--text);border:1px solid var(--line);min-height:42px;font-weight:700}
.scale button[aria-pressed="true"],.pct button[aria-pressed="true"]{background:var(--cta);color:var(--cta-t);border-color:var(--cta)}
.spec span{background:var(--panel2);border-color:transparent}
.dot{background:var(--panel2);border-color:transparent;border-radius:12px;max-width:none;aspect-ratio:auto;height:38px;padding:0 1px;line-height:1;white-space:nowrap;font-size:10.5px;letter-spacing:-.4px;overflow:hidden}
.dot.on{background:var(--soft);border-color:var(--gold-d);color:var(--gold)}
.dot.today{outline:1.5px solid var(--gold);outline-offset:2px}
.week .dot.today{padding:0 1px!important;outline:1.5px solid var(--gold)!important;border:1px solid var(--gold-d)!important}
.cal{border-radius:14px}
.cal i{background:var(--cta);color:var(--cta-t)}
.cal b{background:var(--panel)}
.opt li{background:var(--panel);border:1px solid var(--line);border-radius:12px}
.ex .mu{color:var(--gold);letter-spacing:.02em}
.ex .nm{font-size:17px}
.setrow input{background:var(--panel)}
.setrow button{background:transparent;color:var(--gold);border:1.5px solid var(--gold-d);min-height:40px}
.setrow:focus-within button[type=submit]{background:var(--cta);color:var(--cta-t);border-color:var(--cta)} /* סט שעוד לא בוצע: מסגרת; הסט שממלאים עכשיו: מלא; בוצע: ירוק */
.setrow.ok input,.setrow.ok button,.setrow.ok select{background:rgba(46,133,81,.08);border-color:rgba(46,133,81,.45);color:var(--good)}
.sugg{background:var(--soft);border-color:var(--gold-d)}
.toast{background:var(--cta);color:var(--cta-t);border-radius:14px;box-shadow:0 10px 30px -10px rgba(0,0,0,.35);font-weight:700}
nav.tabs{background:var(--panel)!important;border-top:1px solid var(--line);box-shadow:none!important}
html,body{overscroll-behavior-y:none}nav.tabs{-webkit-transform:translateZ(0);transform:translateZ(0);will-change:transform;z-index:50}
nav.tabs button{position:relative;min-height:0;color:var(--mute);font-weight:700}
nav.tabs button[aria-selected="true"]{color:var(--text)}
nav.tabs button[aria-selected="true"]::before{content:"";position:absolute;top:0;left:calc(50% - 14px);width:28px;height:2px;border-radius:2px;background:var(--gold)}
nav.tabs button[aria-selected="true"] svg{color:var(--gold)}
.avatar{background:var(--panel);color:var(--gold);font-family:var(--f-display);font-weight:700}
.thbtn{background:var(--panel);min-height:0;color:var(--text)}
.skel{background:linear-gradient(100deg,var(--panel) 30%,var(--panel2) 50%,var(--panel) 70%);background-size:200% 100%}
.sheet{position:fixed;inset:0;z-index:120;display:flex;align-items:flex-end;justify-content:center;background:rgba(20,15,8,.38);animation:shf .25s cubic-bezier(.2,.8,.2,1)}
.sheet-in{width:min(440px,100%);background:var(--panel);border-radius:24px 24px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom,0px));box-shadow:0 -12px 40px -12px rgba(0,0,0,.3);animation:shu .32s cubic-bezier(.16,1,.3,1)}
.sheet-in h2{font-family:var(--f-display);font-weight:700;font-size:24px;margin:0 0 12px;line-height:1.2}
.sheet-in ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;counter-reset:s}
.sheet-in li{display:grid;grid-template-columns:26px 1fr;gap:10px;font-size:15.5px;line-height:1.45;counter-increment:s}
.sheet-in li::before{content:counter(s);width:26px;height:26px;border-radius:50%;background:var(--soft);color:var(--gold);font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center}
.sheet-in button{width:100%;margin-top:18px}
.today{padding:18px 18px 8px}
.tdh{font-family:var(--f-display);font-weight:700;font-size:22px;margin:0}
.tdn{font-weight:800;color:var(--gold);font-size:15px}
.tdbar{height:4px;border-radius:4px;background:var(--panel2);overflow:hidden;margin:10px 0 6px}
.tdbar i{display:block;height:100%;background:var(--gold);border-radius:4px;transform-origin:right center;animation:barIn .6s cubic-bezier(.16,1,.3,1) both}
@keyframes barIn{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.tdbar i,.tbar i{animation:none}}
.tdi{display:grid;grid-template-columns:28px 1fr 20px;gap:12px;align-items:center;width:100%;background:transparent;color:var(--text);border:0;border-top:1px solid var(--line);border-radius:0;padding:12px 2px;text-align:right;font-weight:600}
.tdi:first-of-type{border-top:0}
.tdc{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--gold-d);display:flex;align-items:center;justify-content:center;color:var(--cta-t)}
.tdc svg{width:15px;height:15px}
.tdi.ok .tdc{background:var(--gold);border-color:var(--gold)}
.tdt{display:flex;flex-direction:column;gap:1px;min-width:0}
.tdt b{font-size:15.5px;font-weight:700}
.tdt small{font-size:13px;color:var(--mute);font-weight:500}
.tdi.ok .tdt b{color:var(--mute)}
.tdg{color:var(--mute);display:flex}
.tdg svg{width:18px;height:18px}
.tdall{font-size:13.5px;color:var(--gold);font-weight:700;padding:4px 2px 10px}
.fin{text-align:center}
.fin .label{font-size:14px}
.fbig{font-family:var(--f-display);font-weight:700;font-size:56px;line-height:1.05;margin:8px 0 4px;color:var(--text);letter-spacing:-.01em}
.fbig small{font-family:'Assistant',Arial,sans-serif;font-size:18px;font-weight:700;color:var(--mute)}
.flike{font-size:17px;color:var(--text);margin-bottom:16px}
.flike b{color:var(--gold)}
.fstats{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:12px 0}
.fstats div{display:flex;flex-direction:column;gap:2px}
.fstats div+div{border-inline-start:1px solid var(--line)}
.fstats b{font-size:22px;font-weight:800}
.fstats span{font-size:12.5px;color:var(--mute)}
.fin .fbig{animation:fup .6s cubic-bezier(.16,1,.3,1)}
.fin .fshare{width:100%;margin-top:16px;min-height:48px}.fin .fshare.ghost{border-color:var(--gold-d);color:var(--gold)} /* אחרי שיא: כפתור מלא עם טקסט כהה; בלי שיא: מסגרת זהב */
.fin .fclose{margin-top:10px}
@keyframes fup{from{transform:translateY(10px);opacity:0}}
.ba{position:relative;margin-top:12px;border-radius:16px;overflow:hidden;aspect-ratio:3/4;background:var(--panel2);user-select:none;-webkit-user-select:none;touch-action:pan-y}
.ba img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.ba-b{clip-path:inset(0 0 0 var(--p))}
.ba-l{position:absolute;top:0;bottom:0;left:var(--p);width:2px;margin-left:-1px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.15);pointer-events:none}
.ba-l b{position:absolute;top:50%;left:50%;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.ba-l b::before,.ba-l b::after{content:"";position:absolute;top:50%;width:0;height:0;border:6px solid transparent;margin-top:-6px}
.ba-l b::before{left:5px;border-right-color:#1c1813}
.ba-l b::after{right:5px;border-left-color:#1c1813}
.ba-t{position:absolute;top:10px;font-size:12px;font-weight:700;color:#fff;background:rgba(20,15,8,.55);border-radius:999px;padding:3px 10px;pointer-events:none}
.ba-tr{right:10px}.ba-tl{left:10px}
.ba input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:ew-resize;-webkit-appearance:none;appearance:none;background:none;border:0;padding:0}
.ba-sum{font-size:14.5px;margin-top:10px;color:var(--text)}
.ba-sum b{color:var(--gold)}
.photos figure[data-i]{cursor:pointer}
.photos figure.on img{outline:2px solid var(--gold);outline-offset:1px}
.lvl,.hit{display:flex;align-items:center;gap:8px;border-radius:12px;padding:9px 12px;font-size:14px;font-weight:700;animation:lvlin .7s cubic-bezier(.16,1,.3,1)}
.lvl{background:var(--soft);border:1px solid var(--gold-d);color:var(--text)}
.lvl b{margin-inline-start:auto;color:var(--gold);font-size:16px;font-variant-numeric:tabular-nums}
.lvl svg,.hit svg{width:18px;height:18px;color:var(--gold);flex:none}
.hit{background:var(--gold);color:var(--cta-t)}
.hit svg{color:var(--cta-t)}
.hit b{font-variant-numeric:tabular-nums}
.setrow input.upk{border-color:var(--gold);box-shadow:0 0 0 3px var(--soft);color:var(--gold)}
@keyframes lvlin{0%{transform:scale(.97)}60%{transform:scale(1.02)}100%{transform:none}}
@media (prefers-reduced-motion:reduce){.lvl,.hit{animation:none}}
.news,.recap,.board{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:14px 16px;margin-bottom:12px;box-shadow:var(--sh)}
.news{border-color:var(--gold-d)}
.news.fw p{margin:6px 0 10px;font-size:14.5px;line-height:1.55}
.news.guides .gd{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--line);color:var(--text);text-decoration:none}
.news.guides .gd:first-of-type{border-top:0;margin-top:4px}
.news.guides .gd b{display:block;font-size:15px}
.news.guides .gd small{display:block;color:var(--mute);font-size:13px;margin-top:2px}
.news.guides .gd i{font-style:normal;font-weight:700;font-size:13px;color:var(--gold);white-space:nowrap}
.askf{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.ciqin{width:100%;font:inherit;font-size:16px;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--text);margin:4px 0 6px}
.chat{display:flex;flex-direction:column;gap:6px;margin-top:8px}.chat .cb{max-width:86%;align-self:flex-start;background:var(--soft);border:1px solid var(--line);border-radius:16px 16px 5px 16px;padding:8px 12px;font-size:15px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}.chat .cb.me{align-self:flex-end;background:var(--text);color:var(--ink);border-color:var(--text);border-radius:16px 16px 16px 5px}.chat .cb small{display:block;font-size:12px;opacity:.7;margin-top:2px}.chat .cb i{font-style:normal;opacity:.8}
.askf textarea{width:100%;font:inherit;font-size:16px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--text)}
.askf button{min-height:40px}
.bfrow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:8px 0 2px}.bfv{font-size:26px}.bfsp{color:var(--gold);margin-inline-start:auto}.bff{display:flex;gap:8px;margin-top:10px}.bff input{flex:1;min-width:0;font:inherit;font-size:16px;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--text)}.bff button{flex:none;min-height:40px;padding:0 16px}
.ctl .cti{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line)}.ctl .cti:first-of-type{border-top:0}.ctl .cti .tdc{flex:none;background:transparent;border:2px solid var(--line);width:26px;height:26px;border-radius:50%;display:grid;place-items:center;padding:0;min-height:0;color:var(--good)}.ctl .cti.ok .tdc{border-color:var(--good)}.ctl .ctt{flex:1;min-width:0;display:flex;flex-direction:column}.ctl .ctt small{font-size:12.5px;color:var(--mute)}.ctl .ctt small.late{color:var(--bad);font-weight:700}.ctl .cti.ok b{text-decoration:line-through;opacity:.6}
.fpend{color:var(--mute);font-size:12px;margin-inline-start:6px}
.setrow .sundo{background:var(--good)!important;color:#fff!important;border-color:var(--good)!important}.setrow .sundo.arm{background:var(--bad)!important;border-color:var(--bad)!important;font-size:12.5px;font-weight:800;padding:0 6px;white-space:nowrap}
a.vplay{text-decoration:none}.vmeet .vplay{margin:8px 0 0}.paycard .vplay{margin:8px 0 0}
.askrow{display:flex;gap:8px}.askrow button[type=submit]{flex:1}.mic{display:inline-flex;align-items:center;gap:6px;flex:none;padding:0 14px;background:transparent!important;color:var(--text)!important;border:1px solid var(--line)!important}.mic.rec{border-color:var(--bad)!important;color:var(--bad)!important;animation:micp 1.2s ease-in-out infinite}@keyframes micp{50%{opacity:.6}}@media (prefers-reduced-motion:reduce){.mic.rec{animation:none}}
.projgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.projgrid>div{background:var(--panel2);border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;gap:2px}
.projgrid b{font-size:20px}
.projgrid small{font-size:12px;color:var(--mute)}
.pgood{margin:8px 0 0;font-size:14px;color:var(--good)}
.trk{display:flex;flex-direction:column;gap:12px}
.tgoal{background:var(--panel2);border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.tgoal .row b{font-size:15.5px}
.tgoal .tok{color:var(--good)}
.tbar{position:relative;height:8px;border-radius:99px;background:var(--line);margin:6px 0 2px}
.tbar i{position:absolute;inset-block:0;right:0;border-radius:99px;background:var(--gold);transform-origin:right center;animation:barIn .6s cubic-bezier(.2,.8,.2,1) both}
.tbar.ok i{background:var(--good)}
.tknob{position:absolute;top:50%;width:22px;height:22px;border-radius:50%;background:var(--panel);border:3px solid var(--gold);transform:translate(50%,-50%)}
.tends .num{direction:ltr;unicode-bidi:isolate}
.tends{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;color:var(--mute)}
.tends b{color:var(--gold);font-size:14px}
.tnote{font-size:13px;color:var(--mute);line-height:1.5}
.tmets{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
.tmet{flex:1;min-width:72px;background:transparent;color:var(--mute);border:1px solid var(--line);border-radius:12px;padding:9px 10px;font-size:14px;min-height:42px}
.tmet.on{background:rgba(212,172,91,.14);color:var(--gold);border-color:var(--gold-d)}
.tml{display:flex;gap:6px;flex-wrap:wrap}
.tml button{background:var(--panel2);color:var(--mute);border:1px solid var(--line);border-radius:99px;padding:5px 12px;font-size:13px;font-weight:600}
.tml button.on{color:var(--text);border-color:var(--gold-d)}
.tseg{display:grid;grid-template-columns:repeat(3,1fr);background:var(--panel2);border-radius:14px;padding:4px;gap:4px}
.tseg button{background:transparent;color:var(--text);border-radius:10px;padding:9px 0;font-size:14.5px;min-height:40px}
.tseg button.on{background:var(--gold);color:var(--ink)}
.tstats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.tstats>div{background:var(--panel2);border-radius:14px;padding:10px 6px;text-align:center;display:flex;flex-direction:column;gap:2px;min-width:0}
.tstats small{font-size:12.5px;color:var(--mute)}
.tstats b{font-size:21px;font-weight:800;direction:ltr;unicode-bidi:isolate}
.tstats b.cur{color:var(--gold)}
.tstats b.up{color:var(--good)}
.tstats b.dn{color:var(--bad)}
.tnav{display:flex;align-items:center;justify-content:space-between;gap:8px}
.tnav b{font-size:16px}
.tarr{width:40px;height:40px;padding:0;border-radius:50%;background:var(--panel2);color:var(--text);display:flex;align-items:center;justify-content:center}
.tarr svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.tarr[disabled]{opacity:.3;cursor:not-allowed;color:var(--mute);background-color:transparent}
.tchart{position:relative;color:var(--gold)}
.tchart svg{width:100%;height:auto;display:block;cursor:pointer}
.tgrid line{stroke:var(--line);stroke-width:1}
.tgrid text{fill:var(--mute);font-size:11px}
.tline{fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round}
.tpt{fill:var(--panel);stroke:currentColor;stroke-width:2}
.tpt.tlast,.tpt.sel{fill:currentColor}
.ttip{position:absolute;transform:translateX(-50%);background:var(--text);color:var(--ink);font-size:12.5px;font-weight:700;padding:4px 9px;border-radius:8px;white-space:nowrap;pointer-events:none;direction:rtl}
.tempty{font-size:14px;color:var(--mute);text-align:center;padding:22px 0}
@media (prefers-reduced-motion:reduce){.tbar i{transition:none}}
.hgoal{display:flex;flex-direction:column;gap:6px;width:100%;text-align:right;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:18px;padding:14px 16px;font-weight:400;font-size:15px;box-shadow:var(--sh)}
.hgoal .row b{color:var(--gold);font-size:18px}
.hgoal .tbar{margin:2px 0}
.mshot{text-align:start;max-height:88vh;overflow:auto}.mshot h2{text-align:center}.mshot .sub{text-align:center}.mspin{width:44px;height:44px;margin:4px auto 0;border-radius:50%;border:3px solid var(--line);border-top-color:var(--gold);animation:msp .9s linear infinite}@keyframes msp{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.mspin{animation:none}}
.msl{display:flex;flex-direction:column;gap:6px;margin-top:4px}.msi{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);color:var(--text);text-align:start;font:inherit}.msi.off{opacity:.45}.msi .msn{flex:1;min-width:0;display:flex;flex-direction:column}.msi small{color:var(--mute);font-weight:500}.msi .num{font-weight:800}.mstot{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 10px;padding:10px 4px;border-top:1px solid var(--line);margin-top:4px}.mstot b{margin-inline-start:auto;font-size:20px}.mstot small{width:100%;color:var(--mute)}.msnote{background:var(--panel2);border-radius:12px;padding:10px 12px;font-size:14px;margin:0}
.msov{position:fixed;inset:0;z-index:30;background:rgba(8,8,10,.72);display:flex;align-items:center;justify-content:center;padding:24px max(16px,env(safe-area-inset-left,0px))}
.msbox{width:min(380px,100%);background:var(--panel);border:1px solid var(--gold-d);border-radius:24px;padding:26px 22px 18px;text-align:center;display:flex;flex-direction:column;gap:10px;animation:msin .45s cubic-bezier(.2,.8,.2,1)}
.msbox h2{font-family:var(--f-display);font-size:28px;margin:6px 0 0;text-wrap:balance}
.msbox p{margin:0;color:var(--mute);font-size:15px;line-height:1.55}
.msring{--p:50;width:148px;height:148px;margin:0 auto;border-radius:50%;background:conic-gradient(var(--gold) calc(var(--p)*1%),var(--line) 0);display:flex;align-items:center;justify-content:center;position:relative}
.msring:before{content:"";position:absolute;inset:12px;border-radius:50%;background:var(--panel)}
.msring b{position:relative;font-size:38px;font-weight:800;direction:ltr}
.msnums{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0}
.msnums>div{background:var(--panel2);border-radius:14px;padding:10px;display:flex;flex-direction:column}
.msnums b{font-size:22px}
.msnums small{color:var(--mute);font-size:12.5px}
.msbox button{width:100%;min-height:46px}
@keyframes msin{from{opacity:0;transform:translateY(16px) scale(.97)}}
@media (prefers-reduced-motion:reduce){.msbox{animation:none}}
.wstreak{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;margin-top:10px;padding:9px 12px;border-radius:12px;background:var(--soft,rgba(212,172,91,.12));color:var(--text);font-size:14px}
.wstreak b{font-size:20px;font-weight:800;color:var(--gold)}
.wstreak small{flex-basis:100%;color:var(--mute);font-size:12.5px}
.sgoal{display:flex;flex-direction:column;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
.sgoal .row b{color:var(--gold);font-size:15px}
.sgoal .row b.tok{color:var(--good)}
.sgdays{display:flex;align-items:center;gap:5px;font-size:12.5px;color:var(--mute)}
.sgdays i{width:16px;height:16px;border-radius:5px;background:var(--line)}
.sgdays i.part{background:var(--gold-d);opacity:.55}
.sgdays i.ok{background:var(--good)}
.sgdays span{margin-inline-start:6px}
.lvlup{width:120px;height:120px;margin:0 auto;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--soft,rgba(212,172,91,.14));border:3px solid var(--good);color:var(--good);font-size:34px;font-weight:800;direction:ltr}
#mswaps summary{list-style:none;display:flex;justify-content:space-between;align-items:center;cursor:pointer}
#mswaps summary::-webkit-details-marker{display:none}
#mswaps summary .sub{font-size:12.5px}
.swl{display:flex;flex-direction:column;gap:8px}
.swr{background:var(--panel2);border-radius:12px;padding:9px 12px;font-size:14px;display:flex;flex-direction:column;gap:3px}
.swr b{font-size:14.5px}
.swr span{color:var(--mute);padding-inline-start:10px;position:relative}
.swr span:before{content:"↔";position:absolute;right:0;color:var(--gold)}
.swa{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:right;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-weight:600;font-size:14px}
.swa small{color:var(--mute);font-weight:600;white-space:nowrap}
.swa:disabled{opacity:.6;cursor:not-allowed;color:var(--mute);background-color:var(--panel2)}
.lvltag{display:inline-block;margin-inline-start:4px;padding:1px 8px;border-radius:99px;background:#23703f;color:#fff;font-size:11px;font-weight:800;letter-spacing:0}
.kdelta{display:block;font-size:11.5px;font-weight:700;color:var(--mute);margin:-2px 0 2px}
.kdelta.up{color:var(--good)}
.kdelta.dn{color:var(--bad)}
.toast{width:max-content;max-width:min(360px,calc(100% - 32px));text-align:center;line-height:1.45}
.goalbox{display:flex;gap:6px;align-items:center}
.goalbox input{width:96px;font-size:16px;padding:6px 8px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--text)}
.goalbox button{min-height:0;padding:6px 12px}
.news.monthly p{margin:6px 0 4px;font-size:14px}
.moform{display:flex;flex-direction:column;gap:10px;margin-top:10px}
.moform label{display:flex;flex-direction:column;gap:4px;font-size:13.5px;font-weight:600}
.moform textarea{width:100%;font:inherit;font-size:16px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--text)}
.shoplist{display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow:auto;margin-top:6px}
.shopit{display:flex;align-items:center;gap:10px;background:var(--panel2);border-radius:10px;padding:8px 10px;font-size:14.5px}
.shopit input{width:20px;height:20px;flex:none}
.shopit input:checked+span{text-decoration:line-through;color:var(--mute)}
.news.supp p{margin:6px 0 8px;font-size:14px;line-height:1.5}
.splist{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.sprow{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;background:var(--panel2);border-radius:12px;padding:8px 10px}
.sprow b{font-size:14px}
.sprow small{grid-column:1;font-size:12.5px;color:var(--mute);line-height:1.4}
.sprow .btn-link{grid-row:1/3;grid-column:2;border:1px solid var(--gold-d);color:var(--gold);border-radius:999px;padding:6px 12px;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap}
.news.blood p{margin:6px 0 8px;font-size:14px;line-height:1.55}
.news.blood .kv{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.bflag{display:inline-block;font-size:12px;border-radius:999px;padding:2px 8px;background:var(--panel2);margin:2px 0}
.bflag.low,.bflag.high{background:rgba(181,71,58,.12);color:var(--bad)}
.bflag.border{background:rgba(217,123,43,.14);color:#b8651f}
.bform{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.bform label{display:flex;flex-direction:column;gap:3px;font-size:12.5px;color:var(--mute)}
.bform input{width:100%;font-size:16px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--text)}
.bform button{grid-column:1/-1;min-height:44px}
.bform small{grid-column:1/-1;font-size:12px;color:var(--mute)}
.news.report{display:block;text-decoration:none;color:inherit}
.news.report p{margin:6px 0 0;font-size:14px;color:var(--mute)}
.news .row b,.recap .row b,.board .row b{font-size:15px}
.news ul{margin:8px 0 0;padding-right:18px;font-size:14px;line-height:1.55}
.news li{margin-bottom:4px}
.recap .row small,.board .row small{color:var(--mute);font-size:12px}
.rgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px}
.rgrid>div{background:var(--panel2);border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;gap:2px}
.rgrid b{font-size:20px}
.rgrid small{font-size:12px;color:var(--mute)}
.goals{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.goal .row{font-size:14px}
.goal .row b{font-size:14px}
.goal.ok .row span{color:var(--good)}
.goal.ok .tdbar i{background:var(--good)}
.grow{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--good);margin-top:6px}
.grow svg{width:16px;height:16px;flex:none}
.grow b{font-weight:800}
.rbest{margin-top:10px;font-size:14px;color:var(--good)}
.brow{display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line);font-size:14.5px}
.brow:last-of-type{border:0}
.brow.me{color:var(--gold)}
.bn{width:26px;height:26px;border-radius:50%;background:var(--panel2);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
.brow:first-of-type .bn{background:var(--gold);color:var(--ink)}
.streak{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--mute);margin:2px 0 8px}
.streak svg{width:20px;height:20px;color:#d97b2b;flex:none}
.streak b{color:var(--text);font-size:16px}
.habits{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
.hb{display:flex;align-items:center;gap:8px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:9px 10px;font-size:13.5px;font-weight:600;min-height:0;text-align:right}
.hb .tdc{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none}
.hb.on{border-color:var(--good);background:rgba(46,133,81,.1)}
.hb.on .tdc{background:var(--good);border-color:var(--good);color:#fff}
.hb.on .tdc svg{width:12px;height:12px}
.inbox{border:1px solid var(--gold-d);background:var(--soft);border-radius:14px;padding:10px 12px;margin:4px 0 10px}
.inbox .row b{font-size:14px}
.inbox .row small{color:var(--mute);font-size:12px}
.inbox p{margin:6px 0 8px;font-size:14.5px;line-height:1.5}
.vplay{display:inline-flex;align-items:center;gap:6px;background:var(--cta);color:var(--cta-t);border:0;border-radius:999px;padding:8px 14px;font-weight:700;font-size:14px;min-height:0;margin-left:10px}
.vplay svg{width:18px;height:18px}
.nmrow{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.exbtns{display:flex;gap:6px;flex:none}
/* טלפון צר: שם התרגיל מקבל את כל השורה, הכפתורים יורדים מתחת (לא נמעך ל-3 שורות) */
@media (max-width:440px){.nmrow{flex-wrap:wrap}.nmrow .nm{flex:1 1 calc(100% - 80px);min-width:0}.nmrow .exbtns{flex:1 1 100%;margin-inline-start:68px}}
.swapbtn.tech{color:var(--mute);border-color:var(--line)}
.swapbtn{display:inline-flex;align-items:center;gap:5px;background:transparent;color:var(--gold);border:1px solid var(--gold-d);border-radius:999px;padding:5px 10px;font-size:12.5px;font-weight:700;flex:none;min-height:0}
.swapbtn svg{width:15px;height:15px}
.swapped{font-size:12.5px;color:var(--mute)}
.linkbtn{background:none;border:0;padding:0;color:var(--gold);font-weight:700;font-size:12.5px;text-decoration:underline;min-height:0}
.swapbox{border:1px solid var(--line);border-radius:14px;padding:10px;background:var(--panel2)}
.swnav{display:grid;grid-template-columns:40px 1fr 40px;align-items:center;gap:6px}
.swarr{width:40px;height:40px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;background:var(--panel);color:var(--text);border:1px solid var(--line);min-height:0}
.swarr svg{width:18px;height:18px}
.swarr svg{transform:scaleX(-1)}
.swarr.prev svg{transform:none} /* 2.11.26: חצים מצביעים החוצה, ימין = הקודם, שמאל = הבא */
.swcur{text-align:center;display:flex;flex-direction:column;gap:2px}
.swcur b{font-size:15px}
.swcur small{font-size:12px;color:var(--mute)}
.swact{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.swact button{min-height:40px;padding:8px}
@keyframes shf{from{background:rgba(20,15,8,0)}}
@keyframes shu{from{transform:translateY(24px);opacity:.4}}
@media (prefers-reduced-motion:reduce){.sheet,.sheet-in{animation:none}}
.sheet-in{position:relative;max-height:88vh;overflow-y:auto}.sheet .sheet-in button.shx{position:absolute!important;top:14px!important;left:14px!important;right:auto!important;width:36px!important;height:36px!important;min-height:0!important;padding:0!important;margin:0!important;border-radius:50%!important;border:1px solid var(--line)!important;background:var(--panel2)!important;color:var(--text)!important;font-size:18px!important;line-height:1!important;box-shadow:none!important}button{transition:none}
/* ===== שכבת נגישות וצבעים נקיים (25.10.26) ===== */
:root[data-theme="light"]{--ink:#eef0f3;--panel:#ffffff;--panel2:#f4f6f8;--line:#dde2e8;--text:#14161a;--mute:#525a64;--gold:#82601f;--gold-d:#c9a560;--soft:#f5eddc;--cta:#14161a;--cta-t:#ffffff;--sh:0 1px 2px rgba(20,24,30,.05),0 12px 30px -18px rgba(20,24,30,.22)}
html{zoom:var(--zoom,1)}
:focus-visible{outline:3px solid var(--gold);outline-offset:2px;border-radius:8px}
.sub{font-size:14px;line-height:1.5}
nav.tabs button{font-size:13px}
nav.tabs button svg{width:24px;height:24px}
.thbtn{width:42px;height:42px}
.txtbtn span{font-weight:800;font-size:16px;line-height:1;display:flex;align-items:baseline;gap:1px}
.txtbtn small{font-size:11px}
.bigtxt .txtbtn{background:var(--soft);border-color:var(--gold-d)}
.mac{grid-template-columns:repeat(3,1fr);gap:12px;font-size:14px}
.mac .bar{margin-top:6px}
.tdh{font-size:24px}
input,select,textarea{font-size:16px}
.exthumb{flex:none;width:58px;height:58px;border-radius:12px;overflow:hidden;border:1px solid var(--line);padding:0;background:#fff;margin-inline-end:10px;min-height:0}
.exthumb img{width:100%;height:100%;object-fit:cover;display:block}
.exanim{position:relative;aspect-ratio:4/3;border-radius:14px;overflow:hidden;background:#fff;margin:6px 0 10px;border:1px solid var(--line)}
.exanim img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.exanim img:nth-child(2){animation:exflip 1.6s steps(1) infinite}
@keyframes exflip{0%{opacity:0}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.exanim img:nth-child(2){animation:none;opacity:0}}
@media (prefers-contrast:more){:root{--mute:var(--text)}.card,.news{border-width:2px}}

"""
HELP_ICON = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6"/><path d="M12 17.2h.01"/></svg>'
HELP_JS = """<script>
/* הסבר קצר לכל מסך (עד 5 שורות) + מסך פתיחה חד-פעמי */
var HELP={
 intro:{t:'ככה זה עובד',l:['כל בוקר נשקלים פעם אחת. זה לוקח 10 שניות.','באימון רושמים משקל וחזרות בכל סט, והאפליקציה אומרת מתי לעלות במשקל.','באוכל מסמנים מה אכלת מהתפריט, או רושמים ביומן.','פעם בשבועיים, בסוף השבוע, ממלאים צ׳ק-אין קצר ואני מכוון אותך הלאה.','משהו לא ברור? לוחצים על סימן השאלה למעלה, או כותבים לי.']},
 home:{t:'המסך הראשי',l:['כאן רואים את היום והשבוע שלך במבט אחד.','נשקלים בבוקר, אחרי שירותים ולפני אוכל ושתייה.','מסמנים את ההרגלים היומיים ושומרים על הרצף.','הודעות ממני מופיעות כאן למעלה, כולל הודעות קוליות.','פעם בשבועיים ממלאים צ׳ק-אין, ואני מקבל אותו ישר.']},
 menu:{t:'התפריט',l:['בכל ארוחה בוחרים אפשרות אחת מהרשימה.','עוברים בין האפשרויות עם החצים, ומה שבחרת עולה ראשון בפעם הבאה.','לחיצה על אפשרות מסמנת אותה, ו״אכלתי״ סוגר את הארוחה.','הסדר גמיש. העיקר שהכל נאכל עד סוף היום.']},
 train:{t:'האימון',l:['בוחרים את האימון של היום למעלה.','בכל סט רושמים משקל וחזרות ולוחצים על הסימון.','"עוד כמה יכולת?": כמה חזרות עוד היית מצליח לעשות בסוף הסט (0 = לא הייתה עוד חזרה). ככה האפליקציה יודעת מתי להעלות משקל.','הגעת לחזרות המקסימליות בכל הסטים? בפעם הבאה עולים במשקל.','"חלופה" מחליפה תרגיל כשהמכשיר תפוס, ו"טכניקה" שולחת לי סרטון קצר ואני עונה בקולית.','מתחת לכל תרגיל יש סרטון שמראה איך עושים אותו.']},
 food:{t:'יומן האוכל',l:['מחפשים מאכל או סורקים ברקוד, בוחרים כמות ולאיזו ארוחה.','הטבעת מראה כמה נשאר להיום מול היעד שלך.','"אחרונים" מוסיף בלחיצה אחת, ו"העתקת אתמול" חוסכת יום שלם של הקלדה.','מוצר שלא נמצא? מצלמים את התווית ואני מוסיף אותו למאגר.']},
 prog:{t:'ההתקדמות',l:['הגרף מחליק את התנודות היומיות ומראה את הכיוון האמיתי.','תמונות והיקפים מעדכנים פעם בחודש, באותו מקום ובאותה תאורה.','הכוח שלך מתעדכן לבד מכל אימון שרשמת.']}
};
function curTab(){ var b=document.querySelector('#tabs button[aria-selected="true"]'); return b?b.dataset.tab:'home'; }
function openHelp(k,done){ var H=HELP[k]||HELP.home, s=document.createElement('div'); s.className='sheet'; s.setAttribute('role','dialog'); s.setAttribute('aria-modal','true'); s.setAttribute('aria-labelledby','shT');
  s.innerHTML='<div class="sheet-in"><button type="button" class="shx" aria-label="סגירה">×</button><h2 id="shT">'+esc(H.t)+'</h2><ol>'+H.l.slice(0,5).map(function(x){ return '<li><span>'+esc(x)+'</span></li>'; }).join('')+'</ol><button type="button">'+(k==='intro'?'יאללה, מתחילים':'הבנתי')+'</button></div>';
  var close=function(){ s.remove(); document.removeEventListener('keydown',onk); if(done) done(); }, onk=function(e){ if(e.key==='Escape') close(); };
  s.addEventListener('click',function(e){ if(e.target===s) close(); }); s.querySelectorAll('button').forEach(function(b){ b.onclick=close; }); document.addEventListener('keydown',onk);
  document.body.appendChild(s); s.querySelector('.sheet-in>button:last-child').focus(); }
(function(){ var hb=document.getElementById('helpBtn'); if(hb) hb.onclick=function(){ openHelp(curTab()); }; })();
var _renderIntro=render; render=function(){ _renderIntro.apply(this,arguments); var seen=0; try{ seen=localStorage.getItem('aviel_intro_v1'); }catch(e){} if(!seen&&!document.querySelector('.sheet')) openHelp('intro',function(){ try{ localStorage.setItem('aviel_intro_v1','1'); }catch(e){} }); };
</script>"""
THEME_HEAD = "<script>(function(){var t=null;try{t=localStorage.getItem('aviel_theme');}catch(e){}if(t!=='light'&&t!=='dark')t=(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name=theme-color]');if(m)m.content=t==='light'?'#f7f3ec':'#0d0d0f';})();</script>"
THEME_JS = """<script>
(function(){ var b=document.getElementById('thBtn'); if(!b) return;
  var SUN='__SUN__', MOON='__MOON__';
  function cur(){ return document.documentElement.getAttribute('data-theme')||'light'; }
  function paint(){ var l=cur()==='light'; b.innerHTML=l?MOON:SUN; b.setAttribute('aria-label',l?'מעבר לעיצוב כהה':'מעבר לעיצוב בהיר'); var m=document.querySelector('meta[name=theme-color]'); if(m) m.content=l?'#f7f3ec':'#0d0d0f'; }
  b.onclick=function(){ var n=cur()==='light'?'dark':'light'; document.documentElement.setAttribute('data-theme',n); try{ localStorage.setItem('aviel_theme',n); }catch(e){} paint(); try{ if(typeof drawChart==='function') drawChart(); }catch(e){} };
  /* בלי בחירה שמורה: עוקבים אחרי הטלפון (בהיר/כהה), גם כשהוא מתחלף בערב */
  try{ var mq=matchMedia('(prefers-color-scheme: dark)'), on=function(){ var s=null; try{ s=localStorage.getItem('aviel_theme'); }catch(e){} if(s==='light'||s==='dark') return; document.documentElement.setAttribute('data-theme',mq.matches?'dark':'light'); paint(); try{ if(typeof drawChart==='function') drawChart(); }catch(e){} }; if(mq.addEventListener) mq.addEventListener('change',on); else if(mq.addListener) mq.addListener(on); }catch(e){}
  paint(); })();
</script>"""
h = html
h = h.replace('<title>AVIEL · ליווי אישי</title>', '<title>AVIEL · בטא</title>', 1)
h = h.replace('</head>', '<script src="https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js" defer></script></head>', 1)
h = h.replace('</style>', CSS + '</style>', 1)
h = h.replace('family=Secular+One&', 'family=Secular+One&family=Frank+Ruhl+Libre:wght@500;700&', 1)
h = h.replace('</style>', LUX_CSS + '</style>', 1)
h = h.replace('<div class="brand">AVIEL · ליווי אישי</div>', '<div class="brand">AVIEL · ליווי אישי <span class="beta">בטא</span></div>', 1)
h = h.replace('<div class="avatar" id="av" aria-hidden="true"></div>', '<div class="topr"><button type="button" class="thbtn" id="helpBtn" aria-label="הסבר על המסך הזה">'+HELP_ICON+'</button><button type="button" class="thbtn" id="thBtn" aria-label="החלפת עיצוב"></button><div class="avatar" id="av" aria-hidden="true"></div></div>', 1)
h = h.replace('</head>', THEME_HEAD + '</head>', 1)
# 31.10.26 אביאל: "כמו אפליקציה" — בלי זום (לחיצה כפולה / צביטה) ובלי סיבוב לרוחב
h = h.replace('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">', '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">', 1)

RESTYLE = """<style id="restyle">
/* Hallmark · redesign: restyle v2 · direction: Apple-native (by request: "like Apple") · face: the system font (SF Pro / SF Hebrew on iPhone), Assistant as fallback · 30.10.26 */
/* critique: v1 still read as generated, the serif and the cards. Now: no borders, grouped surfaces in system greys, one face in heavy weights with tight tracking, gold as the single tint, translucent tab bar */
:root{--ink:#000;--panel:#1c1c1e;--panel2:#2c2c2e;--line:rgba(84,84,88,.6);--line2:rgba(84,84,88,.9);--text:#fff;--mute:rgba(235,235,245,.62);--gold:#d9b46e;--gold-d:#8a7043;--cta:#d9b46e;--cta-t:#1a1408;--soft:rgba(217,180,110,.14);--sh:none;--good:#30d158;--warn:#ffb340;--bad:#ff6961;--f-display:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Hebrew','Assistant',system-ui,sans-serif;--f-body:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Hebrew','Assistant',system-ui,sans-serif;--r-card:22px;--r-ctl:14px;--nav-bg:rgba(10,10,12,.72);--nav-solid:#0a0a0c;--gold-hi:#e8cc8f;--gold-lo:#c39d55;--gold-edge:rgba(255,240,205,.45);--edge:rgba(255,255,255,.06);--seg-on:#48484a;--seg-sh:none}
:root[data-theme="light"]{--ink:#f2f2f7;--panel:#fff;--panel2:#f2f2f7;--line:rgba(60,60,67,.18);--line2:rgba(60,60,67,.3);--text:#000;--mute:rgba(60,60,67,.66);--gold:#8a6420;--gold-d:#b39253;--cta:#000;--cta-t:#fff;--soft:rgba(138,100,32,.10);--good:#248a3d;--warn:#b25000;--bad:#d70015;--nav-bg:rgba(249,249,251,.78);--nav-solid:#f9f9fb;--seg-on:#fff;--seg-sh:0 1px 3px rgba(0,0,0,.12)}
body{overflow-x:clip}
body{font-family:var(--f-body);background:var(--ink);color:var(--text);-webkit-font-smoothing:antialiased;letter-spacing:-.005em}
h1,h2,h3{font-family:var(--f-display);font-weight:800;letter-spacing:-.025em;text-wrap:balance;overflow-wrap:break-word;min-width:0}
h1{font-size:36px;line-height:1.06;margin:14px 0 6px}
#hello{font-size:38px}
h2{font-size:22px}
.today h2{font-size:28px}
.card,.kpi{background:var(--panel);border:0;border-radius:var(--r-card);box-shadow:none}
#pushCard{border:0!important;background:var(--panel)}
.today{outline:0;border:0}
.news{border:0;background:var(--panel)}
.today .inbox{background:var(--panel2);border:0;border-radius:16px;padding:14px 16px;margin:6px 0 12px}
.today .inbox b{font-family:var(--f-display);font-weight:700;font-size:16px}
.card h2,.card>.row>b:first-child{font-family:var(--f-display);font-weight:800;letter-spacing:-.02em}
.label{font-size:13px;letter-spacing:0;color:var(--mute);font-weight:600;text-transform:none}
.sub,.exnote{color:var(--mute)}
.brand{font-family:var(--f-body);font-weight:700;font-size:15px;letter-spacing:-.01em;color:var(--text)}
.kpi b,.fbig,.sgn,.vtime,.big{font-family:var(--f-display);font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
button.installbtn,label.installbtn{background:var(--cta);color:var(--cta-t);border:0;border-radius:999px;min-height:50px;font-weight:600;font-size:17px;letter-spacing:-.01em;box-shadow:none}
a.installbtn{color:var(--gold);font-weight:600;font-size:15px}
.ghost,button.installbtn.ghost{background:var(--panel2);color:var(--text);border:0;border-radius:999px}
.ghost.sm{border-radius:999px}
.linkbtn{color:var(--gold);text-decoration:none;font-weight:600}
.chip{background:var(--panel2);border:0;color:var(--text);border-radius:999px}
.chip[aria-pressed="true"]{background:var(--text);color:var(--ink)}
.thbtn{background:var(--panel);border:0;color:var(--text)}
nav.tabs{background:var(--nav-solid);border-top:.5px solid var(--line)} /* בלי backdrop-filter: באייפון הוא גרם לסרגל להיתקע באמצע הדף אחרי מקלדת */
nav.tabs button{color:var(--mute);font-weight:500}
nav.tabs button[aria-selected="true"]{color:var(--gold)}
input,select,textarea{border-radius:12px;border-color:var(--line)!important;background:var(--panel2)}
.setrow input,.setrow select{background:var(--panel2)}
.spec span{background:var(--panel2);border:0}
.ghost,.swarr,.thbtn,.fsearch button,.fcopy,.ghost.sm{border:0!important}
.swarr,.fsearch button,.fcopy{background:var(--panel2)}
.swarr[disabled]{opacity:.35}
/* מסך הבית: טבעת מובילה, רשימה בסגנון הגדרות של אייפון, שורה עליונה שקטה */
.thbtn{width:36px;height:36px;background:transparent}
#coachGo{font-size:14px;margin:0 0 4px!important}
#hello{font-size:40px;margin-top:6px}
#helloSub{font-size:15px;margin-bottom:18px}
.today{padding:20px 20px 6px}
.today>.row,.today>.tdbar{display:none}
#tRing{display:flex;align-items:center;gap:16px;margin:2px 0 14px}
#tRing svg{flex:none}
#tRing .trt{display:flex;flex-direction:column;gap:2px;min-width:0}
#tRing .trt b{font-family:var(--f-display);font-weight:800;font-size:28px;letter-spacing:-.025em}
#tRing .trt span{color:var(--mute);font-size:15px}
#tRing .trt em{font-style:normal;color:var(--text);font-weight:700;font-variant-numeric:tabular-nums}
.tdi{min-height:58px;padding:10px 0;border-top:.5px solid var(--line)}
.tdi .tdt b{font-weight:600;font-size:17px;letter-spacing:-.01em}
.tdi .tdt small{color:var(--mute);font-size:13px}
.tdi .tdc{width:26px;height:26px;border:2px solid var(--line2);background:transparent}
.tdi.ok .tdc{background:var(--gold);border-color:var(--gold);color:var(--cta-t)}
.tdi .tdg{color:var(--mute)}
#pushCard{padding:16px 18px}
#pushCard .label{color:var(--text);font-weight:700;font-size:15px}
/* אימון: שקט ומלא, בלי קווי מתאר */
#progBox>.sub:not(.wk1){font-size:17px;font-weight:700;color:var(--text);letter-spacing:-.01em;margin:6px 0 10px}
#progName{font-size:13px;color:var(--mute)}
.wk1 button{background:var(--panel2);border:0;color:var(--gold);padding:7px 14px;font-size:13px}
#progBox .card.ex .nm{font-weight:700;letter-spacing:-.015em}
#progBox .card.ex .swapbtn{background:var(--panel2);border:0;color:var(--gold)}
#progBox .card.ex .swapbtn.tech{color:var(--text)}
.setrow input{border:0!important;background:var(--panel2);font-weight:700}
.setrow select{border:0!important;background:var(--panel2)}
.setrow button{background:var(--panel2);border:0;color:var(--gold);border-radius:12px}
.setrow.ok input,.setrow.ok select{background:rgba(48,209,88,.12);color:var(--good)}
.setrow.ok button{background:var(--good);color:var(--cta-t)}
/* התקדמות: המספרים בלי מסגרת, בשורה אחת; מקטעים בסגנון אפל */
.phero .phg{background:transparent;border:0;border-radius:0;padding:4px 0 0;max-width:none;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;text-align:center}
.phero .phg b{font-size:28px;font-weight:800;letter-spacing:-.03em}
.phv{background:var(--panel2)}
.pseg,.tseg{background:var(--panel2);border:0;border-radius:12px;padding:3px;gap:2px}
.pseg button,.tseg button{color:var(--text);font-weight:600;border-radius:9px;min-height:34px;padding:7px 4px}
.pseg button[aria-selected="true"],.tseg button.on{background:var(--seg-on);color:var(--text);box-shadow:var(--seg-sh)}
#progSeg.pseg{border:0!important;background:var(--panel2)!important}
#progSeg.pseg button[aria-selected="true"]{background:var(--seg-on)!important;color:var(--text)!important;box-shadow:var(--seg-sh)}
.tmets{background:var(--panel2);border-radius:12px;padding:3px;gap:2px}
.tmets .tmet{border:0!important;background:transparent;color:var(--text);border-radius:9px;font-weight:600}
.tmets .tmet.on,.tmets .tmet[aria-pressed="true"]{background:var(--seg-on)!important;color:var(--text)!important;box-shadow:var(--seg-sh)}
.tstats>div{background:var(--panel2);border-radius:16px}
.tstats b{font-size:24px;letter-spacing:-.03em}
.tstats b.cur{color:var(--text)}
/* יומן: שדה חיפוש בסגנון אפל */
.fsearch input,#fQ{border:0!important;background:var(--panel2);border-radius:12px}
/* יוקרה: זהב מתכתי עדין על הכפתור הראשי (רק במצב כהה), קו אור דק בראש הכרטיסים */
:root:not([data-theme="light"]) button.installbtn,:root:not([data-theme="light"]) label.installbtn{background:linear-gradient(180deg,var(--gold-hi),var(--gold) 55%,var(--gold-lo));box-shadow:inset 0 1px 0 var(--gold-edge)}
:root:not([data-theme="light"]) .card,:root:not([data-theme="light"]) .kpi{box-shadow:inset 0 1px 0 var(--edge)}
#tRing svg circle:last-child{stroke:var(--gold)}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
</style>"""
h = h.replace('</head>', RESTYLE + '</head>', 1)
THEME_JS = THEME_JS.replace('__SUN__', SUN).replace('__MOON__', MOON)
h = h.replace('<div class="card" id="noteCard" hidden>', PUSH_CARD + '<div class="card" id="noteCard" hidden>', 1)
h = h.replace('<section data-view="prog" hidden>', FOOD_VIEW + '  <section data-view="prog" hidden>', 1)
h = h.replace('<div class="card"><div class="label">כוח: מאיפה התחלת ולאן הגעת</div>', PHOTO_CARD + '<div class="card"><div class="label">כוח: מאיפה התחלת ולאן הגעת</div>', 1)
h = h.replace('<button role="tab" aria-selected="false" data-tab="prog">', NAV_FOOD + '\n  <button role="tab" aria-selected="false" data-tab="prog">', 1)
# לשונית מדריכים (28.10.26, אביאל: "סקשן לבד בסרגל, שלאט לאט יתרחב")
NAV_GUIDES = '<button role="tab" aria-selected="false" data-tab="guides"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h6"/></svg>מדריכים</button>'
h = h.replace('</div></nav>', '  ' + NAV_GUIDES + '\n</div></nav>', 1)
GUIDES_VIEW = '''  <section data-view="guides" hidden>
    <h1>המדריכים</h1>
    <div class="sub">כל מה שכתבתי בשבילכם במקום אחד. מתעדכן כל הזמן.</div>
    <div class="stack" id="gdBox"><div class="skel"></div><div class="skel"></div></div>
  </section>
'''
h = h.replace('<section data-view="prog" hidden>', GUIDES_VIEW + '  <section data-view="prog" hidden>', 1)
h = h.replace("try{ if(T) localStorage.setItem('aviel_t',T); else T=localStorage.getItem('aviel_t')||''; }catch(e){}", "try{ var tbS=localStorage.getItem('aviel_tb')||''; if(T&&T===localStorage.getItem('aviel_tbad')&&tbS&&tbS!==T) T=tbS; /* האייקון במסך הבית נשמר עם קישור ישן */ if(T) localStorage.setItem('aviel_tb',T); else T=tbS; }catch(e){}", 1)
h = h.replace("if(d.status){ $('#kStat').textContent=d.status.icon||'—';", "if(d.status){ var _si=d.status.icon||'', _sc=/🟢|✅/.test(_si)?'good':/🟡|🟠/.test(_si)?'warn':/🔴/.test(_si)?'bad':''; if(_si){ $('#kStat').innerHTML='<i class=\"sdot'+(_sc?' s-'+_sc:'')+'\"></i>'; } else $('#kStat').textContent='—';", 1)
# כניסה בלי קישור: טלפון + שם פרטי → השרת מחזיר את הקוד האישי (api=login)
LOGIN_JS = """function showLogin(){ $('#boot').hidden=true; $('#tabs').hidden=true; var f=$('#fatal'); f.hidden=false; f.style.borderColor='var(--line)';
  f.innerHTML='<b style="font-size:20px">כניסה לאפליקציה</b><div class="sub" style="margin:6px 0 14px">מספר הטלפון והשם הפרטי, כמו שמסרת לאביאל</div><form id="lg" class="stack" style="gap:10px"><input id="lgPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="מספר טלפון" aria-label="מספר טלפון" style="font-size:18px"><input id="lgName" autocomplete="given-name" placeholder="שם פרטי" aria-label="שם פרטי" style="font-size:18px"><button type="submit" class="installbtn">כניסה</button></form><div class="sub" style="margin-top:12px">נכנסים פעם אחת, ומאז האפליקציה זוכרת אותך</div>';
  $('#lg').onsubmit=function(ev){ ev.preventDefault(); var b=this.querySelector('button'); b.disabled=true; b.textContent='בודק...';
    fetch(API+'?api=login&p='+encodeURIComponent(JSON.stringify({phone:$('#lgPhone').value,name:$('#lgName').value}))+'&_='+Date.now()).then(function(r){ return r.json(); })
      .then(function(j){ if(!j.ok) throw new Error(j.error||'לא הצלחנו להיכנס'); try{ localStorage.setItem('aviel_tb',j.r.t); }catch(e){} location.replace(location.pathname+'?t='+j.r.t); })
      .catch(function(e){ toast((e&&e.name==='TypeError')||/fetch|network|load failed|unexpected/i.test(e.message)?'אין חיבור לאינטרנט':e.message,1); b.disabled=false; b.textContent='כניסה'; }); }; }
"""
old_if = "if(!T){ fatal('צריך לפתוח את האפליקציה מהקישור האישי שאביאל שלח בוואטסאפ.'); }"
assert h.count(old_if)==1 if False else True
h = h.replace(old_if, LOGIN_JS + "if(!T){ showLogin(); }", 1)
OLD_BOOT_CATCH = "    .catch(function(er){ if(BOOTED) toast('אין חיבור כרגע. מוצג המידע האחרון ששמור בטלפון',1); else fatal(er.message); });"
assert h.count(OLD_BOOT_CATCH) == 1, 'boot catch moved — update the login fallback'
h = h.replace(OLD_BOOT_CATCH, "    .catch(function(er){ if(/הקישור לא בתוקף/.test(er&&er.message||'')){ try{ localStorage.setItem('aviel_tbad',T); localStorage.removeItem('aviel_tb'); localStorage.removeItem(CK); }catch(e){} document.querySelectorAll('section[data-view]').forEach(function(s){ s.hidden=true; }); showLogin(); } else if(LOCKED){} else if(BOOTED) toast(/אין חיבור/.test(er&&er.message||'')?'אין חיבור כרגע. מוצג המידע האחרון ששמור בטלפון':er.message,1); else fatal(er.message); });", 1)
h = h.replace("toast('יאללה, לסט הבא 💪')", "toast('יאללה, לסט הבא')", 1)
h = h.replace("הושלם 🔥')", "הושלם')")
h = h.replace('aria-label="סגירה">✕</button>', 'aria-label="סגירה"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\"><path d=\"M6 6l12 12M18 6 6 18\"/></svg></button>')
(ROOT / 'beta' / 'report.html').write_text((ROOT / 'report-src.html').read_text(encoding='utf8'), encoding='utf8')
(ROOT / 'beta' / 'rec.html').write_text((ROOT / 'rec-src.html').read_text(encoding='utf8'), encoding='utf8')
h = h.replace('</body></html>', JS.replace('__FOODS__', foods) + '<script>' + (ROOT / 'beta-extra.js').read_text(encoding='utf8') + '</script>\n' + THEME_JS + HELP_JS + '\n</body></html>', 1)
for k in ['id="thBtn"', 'data-theme', 'id="pushCard"', 'data-view="food"', 'id="phIn"', 'data-tab="food"', "aviel_tb", 'class="beta"']:
    assert k in h, k
(OUT / 'index.html').write_text(h, encoding='utf8')

man = json.loads((ROOT / 'manifest.webmanifest').read_text(encoding='utf8'))
man.update({'name': 'AVIEL בטא', 'short_name': 'AVIEL β'})
(OUT / 'manifest.webmanifest').write_text(json.dumps(man, ensure_ascii=False, indent=2), encoding='utf8')
for f in ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'hero.jpg', 'wk-push.jpg', 'wk-back.jpg', 'wk-legs.jpg', 'wk-glutes.jpg', 'wk-full.jpg']:
    if (ROOT / f).exists(): shutil.copy(ROOT / f, OUT / f)
(OUT / 'sw.js').write_text("""// בטא: מטמון + התראות פוש (הודעה נמשכת מהשרת)
const C = 'aviel-beta-v273-""" + __import__('hashlib').md5(h.encode('utf8')).hexdigest()[:8] + """', API = '""" + API + """';
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'index.html', 'manifest.webmanifest', 'icon-192.png']))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C && k.indexOf(C.replace(/\d.*$/, '')) === 0).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const req = e.request.mode === 'navigate' ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' }) : e.request; // redirect manual: כתובת בלי / בסוף לא נשברת // פתיחת האפליקציה: תמיד בודקים מול השרת (304 אם לא השתנה), כדי שעדכון יגיע מיד ולא אחרי 10 דקות מטמון
  /* 28.10.26: פתיחה מיידית — מה שיש בטלפון מוצג מיד, והגרסה מהרשת מתעדכנת ברקע לפתיחה הבאה (גרסה חדשה = באנר "לרענון") */
  const root = new URL('./', self.registration.scope).pathname; if (e.request.mode === 'navigate' && !(u.pathname === root || u.pathname === root + 'index.html')) return; /* קישור קצר (/shani-2535) ודפים אחרים — תמיד מהרשת */
  const net = fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request.mode === 'navigate' ? './' : e.request, cp)); } return r; });
  e.respondWith(caches.match(e.request.mode === 'navigate' ? './' : e.request, { ignoreSearch: true }).then(hit => { if (hit) { e.waitUntil(net.catch(() => {})); return hit; } return net.catch(() => caches.match(e.request, { ignoreSearch: true })); }));
});
const token = () => caches.open('aviel-beta-t').then(c => c.match('token')).then(r => r ? r.text() : '');
self.addEventListener('push', e => {
  e.waitUntil(token().then(t => fetch(API + '?api=inbox&t=' + encodeURIComponent(t) + '&p=%7B%22sw%22%3A1%7D&_=' + Date.now()).then(r => r.json()))
    .then(j => (j && j.ok) ? j.r : { title: 'AVIEL', body: 'יש לך עדכון באפליקציה' })
    .catch(() => ({ title: 'AVIEL', body: 'יש לך עדכון באפליקציה' }))
    .then(m => self.registration.showNotification(m.title, { body: m.body, icon: 'icon-192.png', badge: 'icon-192.png', lang: 'he', dir: 'rtl', tag: m.tag || 'aviel', renotify: true, vibrate: [250, 120, 250] })));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(token().then(t => clients.matchAll({ type: 'window' }).then(ws => ws.length ? ws[0].focus() : clients.openWindow('./?t=' + t))));
});
""", encoding='utf8')
print('beta built', len(h))

# ---------- הבטא היא הגרסה הרגילה (אביאל אישר 22.10.26): live/ = עותק של beta/ שמוגש מהשורש ----------
LIVE = ROOT / 'live'
LIVE.mkdir(exist_ok=True)
_b = (ROOT / 'beta' / 'index.html').read_text(encoding='utf8')
_b = _b.replace('../data/', 'data/').replace('<title>AVIEL · בטא</title>', '<title>AVIEL · ליווי אישי</title>').replace('<span class="beta">בטא</span>', '')
(LIVE / 'index.html').write_text(_b, encoding='utf8')
_sw = (ROOT / 'beta' / 'sw.js').read_text(encoding='utf8')
import re as _re
_sw = _re.sub(r"aviel-beta-v\d+", lambda m: 'aviel-live-' + m.group(0).split('-v')[-1], _sw).replace('// בטא: מטמון', '// מטמון')
(LIVE / 'sw.js').write_text(_sw, encoding='utf8')
for _f in ('report.html', 'rec.html'):
    (LIVE / _f).write_text((ROOT / 'beta' / _f).read_text(encoding='utf8'), encoding='utf8')
