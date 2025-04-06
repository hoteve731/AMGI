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
        // 사용자 인증 정보 확인 (세션이 없을 때 오류 방지)
        let userId = null;

        try {
            const { data, error } = await supabase.auth.getUser();

            if (!error && data.user && data.user.id) {
                userId = data.user.id;
                console.log('인증된 사용자 ID:', userId);
            } else {
                console.log('인증된 사용자 정보가 없습니다.');
            }
        } catch (authError) {
            console.log('인증 세션 오류 (무시됨):', authError);
        }

        // 인증된 사용자가 없으면 로컬 스토리지에만 저장
        if (!userId) {
            console.log('인증되지 않은 상태로 FCM 토큰 로컬 저장:', token);
            localStorage.setItem('fcm_token', token);
            return true;
        }

        console.log('FCM 토큰 저장 시도:', { userId, token });

        // 먼저 프로필이 존재하는지 확인
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError) {
            console.log('프로필 조회 실패, 새 프로필 생성 시도');

            // 프로필이 없으면 생성
            const { error: insertError } = await supabase
                .from('profiles')
                .insert({
                    id: userId,
                    fcm_token: token
                });

            if (insertError) {
                console.error('프로필 생성 오류:', insertError);
                // 실패해도 로컬에는 저장
                localStorage.setItem('fcm_token', token);
                return true;
            }
        } else {
            // 프로필이 있으면 업데이트
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ fcm_token: token })
                .eq('id', userId);

            if (updateError) {
                console.error('FCM 토큰 업데이트 오류:', updateError);
                // 실패해도 로컬에는 저장
                localStorage.setItem('fcm_token', token);
                return true;
            }
        }

        console.log('FCM 토큰이 성공적으로 저장되었습니다');
        // 성공 시 로컬에도 저장
        localStorage.setItem('fcm_token', token);
        return true;
    } catch (error) {
        console.error('FCM 토큰 저장 오류:', error);
        // 오류 발생 시 로컬에라도 저장
        localStorage.setItem('fcm_token', token);
        return true; // 오류가 발생해도 true 반환
    }
}

// FCM 권한 요청 및 토큰 획득
export async function requestFCMPermission() {
    if (!messaging) {
        console.error('Firebase Messaging이 초기화되지 않았습니다');
        return null;
    }

    try {
        // 알림 권한 요청
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('알림 권한이 거부되었습니다');
            return null;
        }

        // 서비스 워커 등록 확인
        if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
            try {
                // 서비스 워커 등록
                await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                console.log('Firebase 서비스 워커가 등록되었습니다');
            } catch (error) {
                console.error('서비스 워커 등록 실패:', error);
            }
        }

        // FCM 토큰 획득
        const currentToken = await getToken(messaging, {
            vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        });

        if (!currentToken) {
            console.log('FCM 토큰을 획득할 수 없습니다');
            return null;
        }

        // 토큰을 Supabase에 저장
        await saveFCMToken(currentToken);

        return currentToken;
    } catch (error) {
        console.error('FCM 권한 요청 오류:', error);
        return null;
    }
}

// 알림 스케줄링 함수
export async function scheduleNotification(
    contentId: string,
    chunkId: string | number,
    title: string,
    body: string,
    scheduledTime: Date
) {
    const supabase = createClientComponentClient();

    try {
        // 사용자 인증 정보 확인
        const { data, error } = await supabase.auth.getUser();

        if (error) {
            console.error('인증 정보 가져오기 오류:', error);
            return null;
        }

        if (!data.user || !data.user.id) {
            console.log('알림 예약 실패: 사용자 정보 없음', data);
            return null;
        }

        const userId = data.user.id;
        console.log('인증된 사용자 ID:', userId);

        // 지연 시간 계산
        const delay = scheduledTime.getTime() - Date.now();

        // 알림 정보를 Supabase에 저장
        const { data: notificationData, error: insertError } = await supabase
            .from('notifications')
            .insert({
                user_id: userId,
                content_id: contentId,
                chunk_index: chunkId,
                title,
                body,
                scheduled_for: scheduledTime.toISOString(),
                status: 'pending'
            })
            .select()
            .single();

        if (insertError) {
            console.error('알림 스케줄링 오류:', insertError);
            return null;
        }

        console.log('알림이 예약되었습니다:', {
            id: notificationData.id,
            scheduledTime: scheduledTime.toISOString(),
            delay: `${Math.floor(delay / 1000)}초 후`
        });

        return notificationData;
    } catch (error) {
        console.error('알림 예약 실패:', error);
        return null;
    }
}

// 포그라운드 메시지 리스너 설정
export function setupFCMListener() {
    if (!messaging) {
        console.error('Firebase Messaging이 초기화되지 않았습니다');
        return;
    }

    // 포그라운드 메시지 수신 처리
    onMessage(messaging, (payload) => {
        console.log('포그라운드 메시지 수신:', payload);

        // 알림 표시
        const notificationTitle = payload.notification?.title || '알림';
        const notificationOptions = {
            body: payload.notification?.body,
            icon: '/icons/icon-192x192.png',
            data: payload.data,
            // 클릭 시 이동할 URL
            ...(payload.data?.url && { click_action: payload.data.url })
        };

        // 브라우저 알림 표시
        if (Notification.permission === 'granted') {
            new Notification(notificationTitle, notificationOptions);
        }
    });
}

// 초기화 함수 - 앱 시작 시 호출
export function initializeFirebase() {
    if (typeof window === 'undefined') return;

    try {
        // FCM 리스너 설정
        setupFCMListener();
        console.log('Firebase가 초기화되었습니다.');
    } catch (error) {
        console.error('Firebase 초기화 오류:', error);
    }
}