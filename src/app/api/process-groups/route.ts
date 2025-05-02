import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// 타임아웃 시간을 설정 (ms)
const TIMEOUT = 29000; // 29초 (Vercel 함수 실행 제한 30초보다 약간 짧게 설정)

// 타임아웃 프로미스 생성 함수
function timeoutPromise(ms: number) {
    return new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error('API 요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'));
        }, ms);
    });
}

// 타임아웃과 함께 프로미스 실행
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        timeoutPromise(ms)
    ]) as Promise<T>;
}

export async function POST(req: Request) {
    const supabase = await createClient()

    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            return NextResponse.json(
                { error: '인증되지 않은 사용자입니다.' },
                { status: 401 }
            )
        }

        const { contentId, useMarkdownText } = await req.json()

        if (!contentId) {
            return NextResponse.json(
                { error: '콘텐츠 ID가 필요합니다.' },
                { status: 400 }
            )
        }

        // 콘텐츠 정보 가져오기
        const { data: content, error: contentError } = await supabase
            .from('contents')
            .select('id, original_text, markdown_text, additional_memory, processing_status, title')
            .eq('id', contentId)
            .single()

        if (contentError || !content) {
            return NextResponse.json(
                { error: '콘텐츠를 찾을 수 없습니다.' },
                { status: 404 }
            )
        }

        // 항상 파이프라인 재시작: 상태를 'groups_generating'으로 강제 설정
        await supabase
            .from('contents')
            .update({ processing_status: 'groups_generating' })
            .eq('id', contentId);

        // GCF URL 설정
        const isProduction = process.env.NODE_ENV === 'development' ? false : true;
        const gcfUrl = isProduction
            ? 'https://us-central1-amgi-454605.cloudfunctions.net/process-pipeline'
            : process.env.GCF_PROCESS_PIPELINE_URL || 'http://localhost:8080';

        console.log(`[Process Groups API] Environment: ${isProduction ? 'production' : 'development'}`);
        console.log(`[Process Groups API] Using GCF URL: ${gcfUrl}`);

        if (!gcfUrl) {
            console.error(`[Process Groups API] GCF URL is not configured`);
            throw new Error('Server configuration error: GCF URL is not set');
        }

        // 클라우드 함수 호출
        try {
            const text = useMarkdownText && content.markdown_text ? content.markdown_text : content.original_text;
            const additionalMemory = content.additional_memory || '';

            // 그룹 ID 가져오기 (이미 존재하는 경우)
            const { data: existingGroups } = await supabase
                .from('content_groups')
                .select('id')
                .eq('content_id', contentId);

            // GCF 호출 (fire-and-forget 방식)
            fetch(gcfUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contentId,
                    text,
                    additionalMemory,
                    processType: 'groups',
                    userId: session.user.id,
                    title: content.title || 'Untitled Content'
                }),
            }).then(async response => {
                // GCF 응답 상태 확인 (선택 사항, fire-and-forget이므로 깊게 처리 안 함)
                if (!response.ok) {
                    console.warn(`[Process Groups API] GCF trigger request for ${contentId} returned status: ${response.status}`);

                    try {
                        const responseText = await response.text();
                        console.warn(`[Process Groups API] GCF error response body: ${responseText}`);

                        // 오류 상태에 따라 콘텐츠 상태 업데이트 (선택적)
                        const { error: updateError } = await supabase
                            .from('contents')
                            .update({ processing_status: 'error' })
                            .eq('id', contentId);

                        if (updateError) {
                            console.error(`[Process Groups API] Failed to update content status to error: ${updateError.message}`);
                        }
                    } catch (readError) {
                        console.error(`[Process Groups API] Failed to read GCF error response: ${readError}`);
                    }
                } else {
                    // 성공 응답 로깅
                    try {
                        const responseData = await response.json();
                        console.log(`[Process Groups API] GCF trigger successful for ${contentId}. Response: ${JSON.stringify(responseData)}`);
                    } catch (parseError) {
                        console.log(`[Process Groups API] GCF trigger successful for ${contentId}, but failed to parse response: ${parseError}`);
                    }
                }
            }).catch(err => {
                // 네트워크 오류 등 fetch 호출 자체의 오류 로깅
                console.error(`[Process Groups API] Failed to trigger GCF for ${contentId}:`, err);

                // 네트워크 오류 시 콘텐츠 상태 업데이트 (선택적)
                supabase
                    .from('contents')
                    .update({ processing_status: 'error' })
                    .eq('id', contentId)
                    .then(({ error }) => {
                        if (error) {
                            console.error(`[Process Groups API] Failed to update content status to error: ${error.message}`);
                        }
                    });
            });

            console.log(`[Process Groups API] Triggered GCF for contentId: ${contentId}`);

            // 즉시 응답 반환
            return NextResponse.json({
                success: true,
                content_id: contentId,
                group_ids: existingGroups?.map(g => g.id) || [],
                message: '그룹 생성 요청이 시작되었습니다. 처리 상태를 확인하려면 상태 API를 사용하세요.'
            });
        } catch (error) {
            console.error('Cloud function call error:', error);

            // 상태 업데이트: 오류 발생
            await supabase
                .from('contents')
                .update({ processing_status: 'error' })
                .eq('id', contentId);

            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
            return NextResponse.json({
                error: `그룹 생성 중 오류: ${errorMessage}`,
                content_id: contentId
            }, { status: 500 });
        }
    } catch (error) {
        console.error('General error:', error);
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
        return NextResponse.json(
            { error: `서버 처리 중 오류: ${errorMessage}` },
            { status: 500 }
        );
    }
}