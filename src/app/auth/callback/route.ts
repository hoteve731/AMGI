import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { notifyNewUser } from '@/utils/slack'

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')

    // 테스트 모드 확인 (URL에 test=true가 있는 경우)
    const isTestMode = requestUrl.searchParams.get('test') === 'true';
    const testEmail = requestUrl.searchParams.get('email') || 'test@example.com';

    if (isTestMode) {
        console.log('🧪 신규 사용자 알림 테스트 모드');

        // 테스트용 가짜 사용자 ID 생성
        const testUserId = `test_${Date.now()}`;

        try {
            // 테스트 알림 전송
            const success = await notifyNewUser(testUserId, testEmail);
            console.log(`🧪 테스트 알림 전송 ${success ? '성공' : '실패'}: ${testUserId}, ${testEmail}`);

            // 로컬호스트에서 테스트할 때는 리디렉션 대신 JSON 응답 반환
            return NextResponse.json({
                success,
                message: '테스트 알림이 전송되었습니다.',
                testUser: { id: testUserId, email: testEmail }
            });
        } catch (error) {
            console.error('🧪 테스트 알림 전송 오류:', error);
            return NextResponse.json({
                success: false,
                error: '테스트 알림 전송 중 오류가 발생했습니다.'
            }, { status: 500 });
        }
    }

    if (code) {
        const supabase = await createClient()
        const { data: authData, error } = await supabase.auth.exchangeCodeForSession(code)

        if (authData?.user?.email) {
            // 이 이메일로 이미 가입된 사용자가 있는지 확인
            const { count, error: countError } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('email', authData.user.email)

            console.log('사용자 확인 결과:', {
                email: authData.user.email,
                count,
                error: countError?.message,
                isNewUser: count === 1
            });

            // count가 1이면 방금 가입한 신규 사용자
            if (count === 1 && !countError) {
                console.log('새 사용자 가입 감지:', authData.user.id, authData.user.email);

                // 새 사용자인 경우 Slack 알림 전송
                try {
                    const success = await notifyNewUser(authData.user.id, authData.user.email);
                    console.log('새 사용자 알림 전송 ' + (success ? '성공' : '실패'));
                } catch (notifyError) {
                    console.error('새 사용자 알림 전송 오류:', notifyError);
                }
            } else {
                console.log('기존 사용자 로그인:', authData.user.id, authData.user.email);
            }
        }
    }

    // 테스트 모드가 아닌 경우에만 리디렉션
    return NextResponse.redirect(`${requestUrl.origin}/`)
}