const APP_CACHE_NAME = 'loopa-app-v1';
const DYNAMIC_CACHE_NAME = 'loopa-dynamic-v1';

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

// 서비스 워커 활성화 시 이전 캐시 정리
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
    event.respondWith(
        caches.match(event.request).then(response => {
            // 캐시에 있으면 캐시된 응답 반환
            if (response) {
                // 백그라운드에서 새로운 버전 확인
                fetch(event.request).then(fetchResponse => {
                    // 응답이 다르면 캐시 업데이트
                    if (fetchResponse && fetchResponse.status === 200) {
                        caches.open(DYNAMIC_CACHE_NAME).then(cache => {
                            cache.put(event.request, fetchResponse);
                        });
                    }
                });
                return response;
            }

            // 캐시에 없으면 네트워크 요청
            return fetch(event.request).then(fetchResponse => {
                // 유효한 응답이 아니면 그대로 반환
                if (!fetchResponse || fetchResponse.status !== 200) {
                    return fetchResponse;
                }

                // 응답을 복제해서 캐시에 저장
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