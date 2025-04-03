export function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export async function subscribeUserToPush(swRegistration: ServiceWorkerRegistration) {
    try {
        const subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
                process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
            )
        });
        return subscription;
    } catch (err) {
        console.error('푸시 알림 구독 실패:', err);
        return null;
    }
}

export async function sendNotification(
    subscription: PushSubscription,
    contentId: string,
    chunkIndex: number,
    title: string,
    body: string
) {
    try {
        await fetch('/api/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                subscription,
                notification: {
                    title,
                    body,
                    contentId,
                    chunkIndex,
                }
            }),
        });
    } catch (err) {
        console.error('알림 전송 실패:', err);
    }
} 