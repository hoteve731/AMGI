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
    console.log('푸시 이벤트 수신:', event);

    const data = event.data.json();
    console.log('푸시 데이터:', data);

    const options = {
        body: data.body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        data: {
            contentId: data.contentId,
            chunkIndex: data.chunkIndex,
            url: `/content/${data.contentId}/learning?chunk=${data.chunkIndex}`
        },
        requireInteraction: true
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
            .then(() => console.log('알림 표시 성공'))
            .catch(error => console.error('알림 표시 실패:', error))
    );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
    console.log('알림 클릭:', event);
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
            .then(() => console.log('새 창 열기 성공'))
            .catch(error => console.error('새 창 열기 실패:', error))
    );
}); 