'use client'

export default function PushTest() {
    const testNotification = async () => {
        if (!('serviceWorker' in navigator)) {
            alert('Service Worker가 지원되지 않습니다.');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.showNotification('LOOPA 테스트', {
                body: '테스트 알림입니다.',
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-192x192.png',
                data: {
                    contentId: 'test',
                    chunkIndex: 0
                }
            });
        } catch (error) {
            console.error('알림 테스트 실패:', error);
            alert('알림 테스트 실패');
        }
    };

    return process.env.NODE_ENV === 'development' ? (
        <button
            onClick={testNotification}
            className="fixed top-4 right-4 bg-purple-600 text-white px-4 py-2 rounded-lg"
        >
            알림 테스트
        </button>
    ) : null;
} 