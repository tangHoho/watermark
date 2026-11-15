// 浮水印印 service worker：離線可用 + 接收從相簿分享進來的檔案
const VER = 'wm-1.5.2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png', './favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER && k !== 'wm-share').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);

  // 從相簿「分享」到這個 App：先把檔案暫存，再打開編輯畫面
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const fd = await req.formData();
      const files = fd.getAll('media').filter(f => f && f.size);
      await caches.delete('wm-share');
      const c = await caches.open('wm-share');
      await Promise.all(files.map((f, i) => c.put(new Request(`./shared/${i}`), new Response(f, {
        headers: {'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || `shared-${i}`)}
      }))));
      return Response.redirect('./?shared=' + files.length, 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;

  // 頁面：先用網路拿最新版，沒網路時用快取
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VER).then(c => c.put('./index.html', cp)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // 自己的檔案和 Google 字型：先用快取，背景更新
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(VER).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
