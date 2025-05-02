import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { sendSlackNotification } from '@/utils/slack';

export async function POST(request: Request) {
    try {
        console.log('Slack 알림 API 호출됨');

        const supabase = createRouteHandlerClient({ cookies });

        // 요청 본문 로깅
        const requestBody = await request.json();
        console.log('Slack 알림 요청 데이터:', JSON.stringify(requestBody));

        const { type, data } = requestBody;

        if (!type || !data) {
            console.error('유효하지 않은 요청 형식:', { type, data });
            return NextResponse.json(
                { error: '유효하지 않은 요청 형식입니다.' },
                { status: 400 }
            );
        }

        // 인증 확인 (선택적)
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                console.log('인증된 사용자:', session.user.id);
            } else {
                console.log('인증되지 않은 요청이지만 계속 진행합니다.');
            }
        } catch (authError) {
            console.error('인증 확인 중 오류:', authError);
            // 인증 오류가 있어도 알림은 계속 진행
        }

        let success = false;

        switch (type) {
            case 'new_content':
                console.log('새 콘텐츠 알림 전송 시도');
                success = await sendSlackNotification({
                    text: `새 콘텐츠가 생성되었습니다! (사용자: ${data.userId}, 제목: ${data.title})`,
                });
                break;

            case 'new_user':
                console.log('새 사용자 알림 전송 시도');
                success = await sendSlackNotification({
                    text: `새 사용자가 가입했습니다! (ID: ${data.userId}, 이메일: ${data.email})`,
                });
                break;

            case 'review_access':
                console.log('리뷰 페이지 접속 알림 전송 시도:', data);
                success = await sendSlackNotification({
                    text: `사용자가 리뷰 페이지에 접속했습니다! (사용자: ${data.userId}, 카드 수: ${data.cardCount})`,
                });
                break;

            case 'feedback':
                console.log('피드백 전송 시도:', data.feedback);
                success = await sendSlackNotification({
                    text: `📢 새로운 피드백이 도착했습니다!\n${data.feedback}`,
                });
                break;

            default:
                console.error('알 수 없는 알림 유형:', type);
                return NextResponse.json(
                    { error: '알 수 없는 알림 유형입니다.' },
                    { status: 400 }
                );
        }

        if (success) {
            console.log('Slack 알림 전송 성공:', type);
            return NextResponse.json({ success: true });
        } else {
            console.error('Slack 알림 전송 실패:', type);
            return NextResponse.json(
                { error: 'Slack 알림 전송에 실패했습니다.' },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('Slack 알림 처리 중 오류 발생:', error);
        return NextResponse.json(
            { error: '서버 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}