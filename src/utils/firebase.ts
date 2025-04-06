import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Firebase 설정
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Firebase 초기화 - 클라이언트 사이드에서만 실행
let app;
let messaging: Messaging | undefined;

if (typeof window !== 'undefined') {
    try {
        app = initializeApp(firebaseConfig);
        messaging = getMessaging(app);
    } catch (error) {
        console.error('Firebase 초기화 오류:', error);
    }
}

// FCM 토큰을 Supabase에 저장
export async function saveFCMToken(token: string) {
    const supabase = createClientComponentClient();

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('로그인이 필요합니다.');

        // profiles 테이블에 토큰 저장
        const { error } = await supabase
            .from('profiles')
            .upsert({
                id: user.id,
                fcm_token: token,
            }, {
                onConflict: 'id'
            });

        if (error) throw error;
        console.log('FCM 토큰이 저장되었습니다.');

    } catch (error) {
        console.error('FCM 토큰 저장 실패:', error);
    }
}

// 알림 권한 요청 및 FCM 토큰 얻기
export async function requestFCMPermission() {
    if (!messaging) return null;

    try {
        console.log('FCM 권한 요청 중...');

        // 권한 요청
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('알림 권한이 거부되었습니다.');
            return null;
        }

        // 토큰 얻기
        const token = await getToken(messaging, {
            vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        });

        console.log('FCM 토큰:', token);

        // Supabase에 토큰 저장
        await saveFCMToken(token);

        return token;
    } catch (error) {
        console.error('FCM 토큰 얻기 실패:', error);
        return null;
    }
}

// 특정 청크에 대한 알림 예약
export async function scheduleNotification(
    contentId: string,
    chunkIndex: number,
    title: string,
    body: string,
    scheduledTime: Date
) {
    const supabase = createClientComponentClient();

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('로그인이 필요합니다.');

        // 지연 시간 계산
        const delay = scheduledTime.getTime() - Date.now();

        // 알림 데이터 생성
        const notificationData = {
            user_id: user.id,
            body,
            content_id: contentId,
            chunk_index: chunkIndex,
            scheduled_for: scheduledTime.toISOString(),
            status: 'pending'
        };

        // 알림 데이터를 DB에 저장
        const { data, error } = await supabase
            .from('notifications')
            .insert(notificationData)
            .select();

        if (error) throw error;

        console.log('알림이 예약되었습니다:', {
            id: data?.[0]?.id,
            scheduledTime: scheduledTime.toISOString(),
            delay: `${Math.floor(delay / 1000)}초 후`
        });

        return data?.[0]?.id;
    } catch (error) {
        console.error('알림 예약 실패:', error);
        return null;
    }
}

// 포그라운드 메시지 처리
export function setupFCMListener() {
    if (!messaging) return;

    onMessage(messaging, (payload) => {
        console.log('앱 사용 중 메시지 수신:', payload);

        // Notification API를 사용하여 알림 표시
        if (payload.notification) {
            new Notification(payload.notification.title || '알림', {
                body: payload.notification.body,
                icon: '/icons/icon-192x192.png'
            });
        }
    });
}

// 초기화 함수 - 앱 시작 시 호출
export function initializeFirebase() {
    if (typeof window === 'undefined') return;

    // 서비스 워커가 등록되어 있는지 확인
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/firebase-messaging-sw.js')
            .then(registration => {
                console.log('서비스 워커 등록 성공:', registration.scope);
            })
            .catch(error => {
                console.error('서비스 워커 등록 실패:', error);
            });
    }

    // FCM 리스너 설정
    setupFCMListener();
}