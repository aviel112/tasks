// מטמון + התראות פוש (הודעה נמשכת מהשרת)
const C = 'aviel-live-328-5185d1a9', API = 'https://script.google.com/macros/s/AKfycbxSkxJJ1ODs067IOfDkuosXzKX-pVi2W7uTcWKAS-7YFuh8PW9mrjSS8bNC4SaiRTkP/exec';
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
    /* 5.11.26 (אביאל: "חופר"): התראת מנוחה מחליפה את הקודמות (נשארת רק אחת), ואם האפליקציה פתוחה מול העיניים — נסגרת מיד בלי צליל */
    .then(m => Promise.all([self.registration.getNotifications ? self.registration.getNotifications().catch(() => []) : [], clients.matchAll({ type: 'window', includeUncontrolled: true }).catch(() => [])]).then(x => {
      const rest = m.tag === 'rest', open = x[1].some(c => c.visibilityState === 'visible');
      /* 5.11.26: אותה מנוחה הגיעה פעמיים (הטלפון שלח את הבקשה שוב) — השנייה מחליפה את הראשונה בשקט: התראה אחת וצליל אחד */
      const dup = rest && x[0].some(n => n.tag === 'rest' && Date.now() - (n.timestamp || n.data && n.data.at || 0) < 45000);
      if (rest) x[0].forEach(n => { if (n.tag === 'rest') n.close(); });
      return self.registration.showNotification(m.title, { body: m.body, icon: 'icon-192.png', badge: 'icon-192.png', lang: 'he', dir: 'rtl', tag: m.tag || 'aviel', renotify: !dup, silent: rest && (open || dup), vibrate: [250, 120, 250], data: { at: Date.now() } })
        .then(() => { if (rest && open) return self.registration.getNotifications().then(ns => ns.forEach(n => { if (n.tag === 'rest') n.close(); })).catch(() => {}); });
    })));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(token().then(t => clients.matchAll({ type: 'window' }).then(ws => ws.length ? ws[0].focus() : clients.openWindow('./?t=' + t))));
});
