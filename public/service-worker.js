const APP_CACHE_NAME = 'loopa-app-v1';
const DYNAMIC_CACHE_NAME = 'loopa-dynamic-v1';

// 캐시하지 않을 URL 패턴들
const EXCLUDED_URLS = [
    '/auth',
    '/api/auth',
    'supabase.co'
];

// URL이 캐시 제외 대상인지 확인
function shouldHandleRequest(url) {
    return !EXCLUDED_URLS.some(excluded => url.includes(excluded));
}

// 서비스 워커 설치
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(APP_CACHE_NAME).then(cache => {
            return cache.addAll([
                '/',
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
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(cacheName => cacheName !== APP_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME)
                    .map(cacheName => caches.delete(cacheName))
            );
        })
    );
});

// 네트워크 요청 처리
self.addEventListener('fetch', event => {
    // 인증 관련 요청은 항상 네트워크로 처리
    if (!shouldHandleRequest(event.request.url)) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request).then(response => {
            if (response) {
                fetch(event.request).then(fetchResponse => {
                    if (fetchResponse && fetchResponse.status === 200) {
                        caches.open(DYNAMIC_CACHE_NAME).then(cache => {
                            cache.put(event.request, fetchResponse);
                        });
                    }
                });
                return response;
            }

            return fetch(event.request).then(fetchResponse => {
                if (!fetchResponse || fetchResponse.status !== 200) {
                    return fetchResponse;
                }

                const responseToCache = fetchResponse.clone();
                caches.open(DYNAMIC_CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return fetchResponse;
            });
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