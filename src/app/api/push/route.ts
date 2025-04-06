import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { initializeApp, cert, ServiceAccount, App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

// Firebase Admin SDK 초기화
let firebaseAdmin: App;
try {
    // 이미 초기화되었는지 확인
    firebaseAdmin = initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        } as ServiceAccount)
    }, 'fcm-app');
} catch (error: any) {
    // 이미 초기화된 경우 기존 앱 사용
    if (error.code === 'app/duplicate-app') {
        firebaseAdmin = initializeApp(undefined, 'fcm-app');
    } else {
        console.error('Firebase Admin 초기화 오류:', error);
        throw error;
    }
}

// Supabase 클라이언트 초기화
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const { notification } = await request.json();
        console.log('FCM 알림 요청 수신:', notification);

        // 사용자 ID에 해당하는 FCM 토큰 가져오기
        const { data: profileData, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('fcm_token')
            .eq('id', notification.user_id)
            .single();

        if (profileError || !profileData?.fcm_token) {
            throw new Error(`FCM 토큰을 찾을 수 없습니다: ${profileError?.message}`);
        }

        // 알림 메시지 구성
        const message = {
            token: profileData.fcm_token,
            notification: {
                title: notification.title || '기억을 꺼낼 시간이에요 🧠',
                body: notification.body
            },
            data: {
                contentId: notification.content_id,
                chunkIndex: notification.chunk_index.toString(),
                url: `/content/${notification.content_id}/learning?chunk=${notification.chunk_index}`
            },
            webpush: {
                fcm_options: {
                    link: `/content/${notification.content_id}/learning?chunk=${notification.chunk_index}`
                },
                notification: {
                    icon: '/icons/icon-192x192.png',
                    click_action: `/content/${notification.content_id}/learning?chunk=${notification.chunk_index}`
                }
            }
        };

        // FCM 메시지 전송
        const messaging = getMessaging(firebaseAdmin);
        const response = await messaging.send(message);
        console.log('FCM 알림 전송 성공:', response);

        // 알림 상태 업데이트
        if (notification.id) {
            await supabaseAdmin
                .from('notifications')
                .update({ status: 'sent' })
                .eq('id', notification.id);
        }

        return NextResponse.json({ success: true, messageId: response });
    } catch (error: any) {
        console.error('FCM 알림 전송 실패:', error);
        return NextResponse.json(
            { error: error.message || 'FCM 알림 전송 실패' },
            { status: 500 }
        );
    }
}

// 예약된 알림 처리
export async function GET() {
    try {
        const now = new Date();

        // 전송 예정인 알림 가져오기
        const { data: notifications, error } = await supabaseAdmin
            .from('notifications')
            .select('*')
            .eq('status', 'pending')
            .lte('scheduled_for', now.toISOString());

        if (error) throw error;

        console.log(`${notifications.length}개의 예약된 알림을 처리합니다.`);

        // 각 알림 처리
        const results = await Promise.all(
            notifications.map(async (notification) => {
                try {
                    // 사용자 FCM 토큰 가져오기
                    const { data: profileData, error: profileError } = await supabaseAdmin
                        .from('profiles')
                        .select('fcm_token')
                        .eq('id', notification.user_id)
                        .single();

                    if (profileError || !profileData?.fcm_token) {
                        throw new Error(`FCM 토큰을 찾을 수 없습니다: ${profileError?.message}`);
                    }

                    // 알림 메시지 구성
                    const message = {
                        token: profileData.fcm_token,
                        notification: {
                            title: '기억을 꺼낼 시간이에요 🧠',
                            body: notification.body
                        },
                        data: {
                            contentId: notification.content_id,
                            chunkIndex: notification.chunk_index.toString(),
                            url: `/content/${notification.content_id}/learning?chunk=${notification.chunk_index}`
                        },
                        webpush: {
                            fcm_options: {
                                link: `/content/${notification.content_id}/learning?chunk=${notification.chunk_index}`
                            },
                            notification: {
                                icon: '/icons/icon-192x192.png',
                                click_action: `/content/${notification.content_id}/learning?chunk=${notification.chunk_index}`
                            }
                        }
                    };

                    // FCM 메시지 전송
                    const messaging = getMessaging(firebaseAdmin);
                    const response = await messaging.send(message);

                    // 알림 상태 업데이트
                    await supabaseAdmin
                        .from('notifications')
                        .update({ status: 'sent' })
                        .eq('id', notification.id);

                    return { id: notification.id, success: true, messageId: response };
                } catch (error: any) {
                    console.error(`알림 ID ${notification.id} 전송 실패:`, error);

                    // 실패한 알림 상태 업데이트
                    await supabaseAdmin
                        .from('notifications')
                        .update({ status: 'failed', error_message: error.message })
                        .eq('id', notification.id);

                    return { id: notification.id, success: false, error: error.message };
                }
            })
        );

        return NextResponse.json({ success: true, results });
    } catch (error: any) {
        console.error('예약된 알림 처리 실패:', error);
        return NextResponse.json(
            { error: error.message || '예약된 알림 처리 실패' },
            { status: 500 }
        );
    }
}