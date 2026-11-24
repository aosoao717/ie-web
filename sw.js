// sw.js — 최소 서비스 워커 (PWA 설치용, 오프라인 캐시 없음)
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
