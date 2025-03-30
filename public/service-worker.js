self.addEventListener('push', event => {
    console.log('[Service Worker] 푸시알림 수신:', event);

    let notificationData = {
        title: 'ANKI 복습의 시간이에요',
        body: '복습할 내용이 있습니다.',
        icon: '/icon.png',
        badge: '/badge.png'
    };

    if (event.data) {
        try {
            const dataJson = event.data.json();
            notificationData = { ...notificationData, ...dataJson };
        } catch (e) {
            notificationData.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            ...notificationData,
            data: notificationData.data,
            requireInteraction: true
        })
    );
});

self.addEventListener('notificationclick', event => {
    console.log('[Service Worker] 알림 클릭:', event);
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                for (const client of clientList) {
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                return clients.openWindow(urlToOpen);
            })
    );
}); 