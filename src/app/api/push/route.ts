import { NextResponse } from 'next/server';
import webpush from 'web-push';

export async function POST(request: Request) {
    try {
        const { subscription, notification } = await request.json();
        console.log('푸시 알림 요청 수신:', { subscription, notification });

        // VAPID 키 설정
        webpush.setVapidDetails(
            'mailto:your-email@example.com',
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
            process.env.VAPID_PRIVATE_KEY!
        );

        // 알림 전송
        console.log('알림 전송 시도...');
        await webpush.sendNotification(
            subscription,
            JSON.stringify(notification)
        );
        console.log('알림 전송 성공');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('푸시 알림 전송 실패:', error);
        return NextResponse.json(
            { error: '푸시 알림 전송 실패' },
            { status: 500 }
        );
    }
} 