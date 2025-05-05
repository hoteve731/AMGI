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

                // 새 사용자에게 기본 콘텐츠 생성
                try {
                    await createDefaultContent(supabase, authData.user.id);
                    console.log('기본 콘텐츠 생성 완료:', authData.user.id);
                } catch (contentError) {
                    console.error('기본 콘텐츠 생성 오류:', contentError);
                }
            } else {
                console.log('기존 사용자 로그인:', authData.user.id, authData.user.email);
            }
        }
    }

    // 테스트 모드가 아닌 경우에만 리디렉션
    return NextResponse.redirect(`${requestUrl.origin}/`)
}

// 기본 콘텐츠 생성 함수
async function createDefaultContent(supabase: any, userId: string) {
    // 스티브 잡스 인용문
    const defaultText = `There's lots of ways to be, as a person. And some people express their deep appreciation in different ways. But one of the ways that I believe people express their appreciation to the rest of humanity is to make something wonderful and put it out there.

And you never meet the people. You never shake their hands. You never hear their story or tell yours. But somehow, in the act of making something with a great deal of care and love, something's transmitted there. And it's a way of expressing to the rest of our species our deep appreciation. So we need to be true to who we are and remember what's really important to us.

—Steve, 2007`;

    // 마크다운 형식의 콘텐츠
    const markdownText = `# 📚 Expressing Appreciation Through Creation

## Summary
- People have various ways of expressing their identity and appreciation.
- Creating something meaningful is a profound way to show gratitude to humanity.
- This act of creation is often anonymous and intangible but deeply impactful.
- It serves as a silent message of love and appreciation to others.
- Authenticity and staying true to oneself are essential in this process.

## Key Concepts

### 1. Diverse Ways of Being
- Individuals express themselves uniquely.
- Appreciation can be conveyed in many forms.

### 2. The Power of Creating
- Making something wonderful is a form of giving.
- The act involves care and love, transmitting emotion.

### 3. Anonymity and Connection
- No direct contact or interaction is necessary.
- The creator and receiver may never meet or communicate.
- The message is conveyed through the work itself.

### 4. The Unspoken Message
- The creation acts as a silent expression of gratitude.
- It reflects our appreciation for the rest of humanity.

### 5. Staying True to Our Values
- Authenticity is vital.
- Remembering what truly matters guides meaningful creation.

## Key Takeaways
| Aspect | Details |
|---------|---------|
| **Expression** | Through creating with love and care |
| **Connection** | No need for direct interaction |
| **Impact** | Transmits appreciation silently |
| **Authenticity** | Be true to oneself and values |

## Final Thought
> "We need to be true to who we are and remember what's really important to us." — Steve, 2007`;

    // 현재 시간 타임스탬프 (사용자의 첫 로그인 시간)
    const now = new Date().toISOString();

    // 1. 콘텐츠 기본 정보 생성
    const { data: contentData, error: contentError } = await supabase
        .from('contents')
        .insert([{
            user_id: userId,
            title: "Expressing Appreciation Through Creation",
            icon: "🎨",
            original_text: defaultText,
            additional_memory: "Remember the importance of creating with care and love",
            chunks: [],
            masked_chunks: [],
            processing_status: 'completed', // 이미 처리 완료 상태로 설정
            markdown_text: markdownText, // 마크다운 형식의 텍스트
            created_at: now // 현재 시간으로 설정
        }])
        .select('id');

    if (contentError) throw contentError;

    return contentData[0].id;
}