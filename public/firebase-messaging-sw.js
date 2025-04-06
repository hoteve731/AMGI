// Firebase 라이브러리 가져오기
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Firebase 설정
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'FIREBASE_CONFIG') {
        const firebaseConfig = event.data.config;
        firebase.initializeApp(firebaseConfig);
        const messaging = firebase.messaging();

        // 백그라운드 메시지 처리
        messaging.onBackgroundMessage((payload) => {
            console.log('백그라운드 메시지 수신:', payload);

            const notificationTitle = payload.notification.title || '알림';
            const notificationOptions = {
                body: payload.notification.body,
                icon: '/icons/icon-192x192.png',
                data: payload.data,
            };

            self.registration.showNotification(notificationTitle, notificationOptions);
        });
    }
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
    console.log('알림 클릭:', event);

    event.notification.close();

    // 알림 데이터에서 콘텐츠 ID와 청크 인덱스 가져오기
    const contentId = event.notification.data?.contentId;
    const chunkIndex = event.notification.data?.chunkIndex;

    // 학습 페이지 URL 생성
    let url = '/';
    if (contentId && chunkIndex !== undefined) {
        url = `/content/${contentId}/learning?chunk=${chunkIndex}`;
    }

    // URL 열기
    event.waitUntil(
        clients.openWindow(url)
            .then(() => console.log('새 창 열기 성공'))
            .catch(error => console.error('새 창 열기 실패:', error))
    );
});