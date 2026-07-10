// 최소 서비스 워커 — PWA 설치(standalone) 가능 조건 충족용.
// 오프라인 캐싱은 하지 않고 네트워크로 통과시킨다.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // no-op: 기본 네트워크 동작 사용
})
