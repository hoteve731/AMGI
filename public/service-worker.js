const APP_CACHE_NAME = 'loopa-app-v1';
const DYNAMIC_CACHE_NAME = 'loopa-dynamic-v1';
let currentVersion = null;

// 버전 체크
async function checkVersion() {
    try {
        const response = await fetch('/api/version');
        const { version } = await response.json();

        if (currentVersion && currentVersion !== version) {
            self.clients.matchAll().then(clients => {
                clients.forEach(client => client.postMessage({ type: 'UPDATE_AVAILABLE' }));
            });
        }
        currentVersion = version;
    } catch (error) {
        console.error('Version check failed:', error);
    }
}

// 주기적으로 버전 체크 (1시간마다)
setInterval(checkVersion, 60 * 60 * 1000);

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

// 네트워크 요청 처리
self.addEventListener('fetch', event => {
    if (event.request.url.includes('/api/version')) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request).then(fetchResponse => {
                return caches.open(DYNAMIC_CACHE_NAME).then(cache => {
                    cache.put(event.request, fetchResponse.clone());
                    return fetchResponse;
                });
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