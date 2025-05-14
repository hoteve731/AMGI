import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
    try {
        // 클라이언트 요청에서 데이터 추출
        const { contentId } = await request.json();

        if (!contentId) {
            return NextResponse.json({ error: 'Content ID is required' }, { status: 400 });
        }

        // Supabase 클라이언트 초기화
        const supabase = await createClient();

        // 사용자 인증 확인
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 콘텐츠 데이터 가져오기
        const { data: contentData, error: contentError } = await supabase
            .from('contents')
            .select('*')
            .eq('id', contentId)
            .single();

        if (contentError || !contentData) {
            console.error('Error fetching content:', contentError);
            return NextResponse.json({ error: 'Content not found' }, { status: 404 });
        }

        // 사용자가 콘텐츠 소유자인지 확인
        if (contentData.user_id !== user.id) {
            return NextResponse.json({ error: 'You do not have permission to access this content' }, { status: 403 });
        }

        // 이미 생성된 퀴즈가 있는지 확인
        const { data: existingQuiz } = await supabase
            .from('content_quiz')
            .select('*')
            .eq('content_id', contentId)
            .maybeSingle();

        if (existingQuiz) {
            // 이미 퀴즈가 있으면 해당 데이터 반환
            return NextResponse.json({ quiz: existingQuiz.quiz_data });
        }

        // 콘텐츠 텍스트 체크
        const contentText = contentData.markdown_text || contentData.original_text;
        if (!contentText) {
            return NextResponse.json({ error: 'No content text available' }, { status: 400 });
        }

        // 상태 업데이트: 퀴즈 생성 시작
        await supabase
            .from('contents')
            .update({ processing_status: 'quiz_generating' })
            .eq('id', contentId);

        // 구글 클라우드 함수 호출을 위한 환경 변수 확인
        const gcfUrl = process.env.GCF_PROCESS_PIPELINE_URL;
        if (!gcfUrl) {
            console.error('GCF_PROCESS_PIPELINE_URL environment variable not set');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        // 구글 클라우드 함수 호출
        try {
            const gcfResponse = await fetch(gcfUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contentId,
                    userId: user.id,
                    text: contentText,
                    processType: 'quiz', // 퀴즈 생성 타입
                    title: contentData.title,
                    language: contentData.language || 'English',
                    additionalMemory: contentData.additional_memory,
                }),
            });

            if (!gcfResponse.ok) {
                const errorData = await gcfResponse.json();
                throw new Error(errorData.error || 'Failed to process quiz in cloud function');
            }

            const gcfData = await gcfResponse.json();

            // 퀴즈 생성 요청 성공 응답
            return NextResponse.json({
                success: true,
                message: 'Quiz generation started',
                contentId
            });
        } catch (gcfError) {
            console.error('Error calling Google Cloud Function:', gcfError);

            // 상태 업데이트: 실패
            await supabase
                .from('contents')
                .update({ processing_status: 'failed' })
                .eq('id', contentId);

            return NextResponse.json({
                error: 'Failed to process quiz in cloud function',
                details: gcfError instanceof Error ? gcfError.message : 'Unknown error'
            }, { status: 500 });
        }
    } catch (error) {
        console.error('Error processing quiz request:', error);
        return NextResponse.json({
            error: 'Failed to process quiz request',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
} 