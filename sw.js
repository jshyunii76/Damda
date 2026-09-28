/* 담다 — 오프라인에서도 열리게. 인터넷이 되면 항상 최신 버전을 먼저 받아온다. */
const CACHE='damda-v6';
const FILES=['./','index.html','manifest.webmanifest?v=6','icon-16.png?v=5','icon-32.png?v=5','icon-48.png?v=5','icon-64.png?v=5','icon-96.png?v=5','icon-128.png?v=5','icon-144.png?v=5','icon-192.png?v=5','icon-256.png?v=5','icon-384.png?v=5','icon-512.png?v=5','icon-maskable-192.png?v=5','icon-maskable-512.png?v=5','apple-touch-icon.png?v=5'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin) return;   /* Gemini 등 외부 호출은 건드리지 않음 */
  e.respondWith(
    fetch(e.request).then(r=>{
      const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return r;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html')))
  );
});
