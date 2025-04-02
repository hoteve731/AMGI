const APP_CACHE_NAME = 'loopa-app-v1';
const DYNAMIC_CACHE_NAME = 'loopa-dynamic-v1';

// 서비스 워커 설치
self.addEventListener('install', event => {
    self.skipWaiting(); // 즉시 활성화
    event.waitUntil(
        caches.open(APP_CACHE_NAME).then(cache => {
            return cache.addAll([
                '/manifest.json',
                '/icons/icon-192x192.png',
                '/icons/icon-512x512.png',
                '/splash/apple-splash-2048-2732.png',
                '/splash/apple-splash-1290-2796.png',
                '/splash/apple-splash-1080-1920.png'
            ]);
        })
    );
});

// 서비스 워커 활성화
self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => cacheName !== APP_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME)
                        .map(cacheName => caches.delete(cacheName))
                );
            })
        ])
    );
});

// 네트워크 요청 처리
self.addEventListener('fetch', event => {
    // 동적 페이지는 네트워크 우선
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match('/'))
        );
        return;
    }

    // 정적 자원은 캐시 우선
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

// 푸시 알림 처리
self.addEventListener('push', event => {
    const options = {
        body: event.data.text(),
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png'
    };

    event.waitUntil(
        self.registration.showNotification('LOOPA', options)
    );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
}); 