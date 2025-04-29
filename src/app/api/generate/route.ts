import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/utils/supabase/server'

import { notifyNewContent } from '@/utils/slack';


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://api.openai.com/v1"
})

// 타임아웃 시간을 설정 (ms)
const TIMEOUT = 9000; // 9초 (Vercel 무료 플랜 제한 10초보다 약간 짧게 설정)

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

        const { text, additionalMemory } = await req.json()

        if (!text || typeof text !== 'string') {
            return NextResponse.json(
                { error: '유효하지 않은 입력입니다.' },
                { status: 400 }
            )
        }

        // 1. 제목 생성 - 타임아웃 적용
        let title
        try {
            console.log('Attempting to generate title...')
            const titleCompletion = await withTimeout(openai.chat.completions.create({
                model: "gpt-4.1-nano-2025-04-14",
                messages: [
                    {
                        role: "system",
                        content: "당신은 텍스트의 핵심을 정확히 파악하여 간결하고 명확한 제목을 생성하는 전문가입니다. 주어진 텍스트를 분석하고 30자 이내의 핵심적인 제목만 출력하세요. 따옴표나 기타 부가 설명 없이 제목 텍스트만 반환해야 합니다."
                    },
                    { role: "user", content: text }
                ],
                temperature: 0,
                max_tokens: 100
            }), TIMEOUT);

            title = titleCompletion.choices[0].message.content || ''
            console.log('Title generated:', title)
        } catch (error) {
            console.error('Title generation error:', error)
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
            return NextResponse.json(
                { error: `제목 생성 중 오류: ${errorMessage}` },
                { status: 500 }
            )
        }

        // 2. 콘텐츠 저장
        let contentId: string | undefined; // 타입을 명시적으로 지정
        try {
            const { data: contentData, error: contentError } = await supabase
                .from('contents')
                .insert([{
                    user_id: session.user.id,
                    title,
                    original_text: text,
                    additional_memory: additionalMemory || '',
                    chunks: [],
                    masked_chunks: [],
                    processing_status: 'pending' // 상태 초기값 설정
                }])
                .select('id')

            if (contentError) throw contentError
            contentId = contentData[0].id

            // --- 백그라운드 파이프라인 트리거 (Fire-and-forget) ---
            // 기존 로컬 API 호출은 주석 처리 또는 삭제
            /*
            fetch(new URL('/api/process/pipeline', req.url).toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // 필요 시 인증 정보 전달
                },
                body: JSON.stringify({ contentId, text, additionalMemory }),
            }).catch(err => {
                console.error('[Generate API] Failed to trigger local processing pipeline:', err);
            });
            */

            // 새로 배포한 Google Cloud Function 호출
            const gcfUrl = 'https://asia-northeast3-amgi-454605.cloudfunctions.net/processPipeline';
            console.log(`[Generate API] Calling GCF for contentId: ${contentId} with userId: ${session.user.id}`);

            // 요청 데이터 준비 및 로깅
            const requestData = { contentId, text, additionalMemory, userId: session.user.id, title };
            console.log(`[Generate API] Request data summary: contentId=${contentId}, textLength=${text.length}, userId=${session.user.id}, title=${title}`);

            fetch(gcfUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // 중요: GCF가 --allow-unauthenticated 상태이므로 별도 인증 헤더 불필요
                    // 만약 GCF에 인증을 추가한다면 여기에 해당 인증 정보 추가 필요 (예: Authorization 헤더)
                },
                body: JSON.stringify(requestData),
            }).then(async response => {
                // GCF 응답 상태 확인 (선택 사항, fire-and-forget이므로 깊게 처리 안 함)
                if (!response.ok) {
                    console.warn(`[Generate API] GCF trigger request for ${contentId} returned status: ${response.status}`);

                    // 응답 본문 확인 (오류 진단용)
                    try {
                        const responseText = await response.text();
                        console.warn(`[Generate API] GCF error response body: ${responseText}`);

                        // 오류 상태에 따라 콘텐츠 상태 업데이트 (선택적)
                        const { error: updateError } = await supabase
                            .from('contents')
                            .update({ processing_status: 'trigger_failed' })
                            .eq('id', contentId);

                        if (updateError) {
                            console.error(`[Generate API] Failed to update content status to trigger_failed: ${updateError.message}`);
                        }
                    } catch (readError) {
                        console.error(`[Generate API] Failed to read GCF error response: ${readError}`);
                    }
                } else {
                    // 성공 응답 로깅
                    try {
                        const responseData = await response.json();
                        console.log(`[Generate API] GCF trigger successful for ${contentId}. Response: ${JSON.stringify(responseData)}`);
                    } catch (parseError) {
                        console.log(`[Generate API] GCF trigger successful for ${contentId}, but failed to parse response: ${parseError}`);
                    }
                }
            }).catch(err => {
                // 네트워크 오류 등 fetch 호출 자체의 오류 로깅
                console.error(`[Generate API] Failed to trigger GCF processing pipeline for ${contentId}:`, err);

                // 네트워크 오류 시 콘텐츠 상태 업데이트 (선택적)
                supabase
                    .from('contents')
                    .update({ processing_status: 'network_error' })
                    .eq('id', contentId)
                    .then(({ error }) => {
                        if (error) {
                            console.error(`[Generate API] Failed to update content status to network_error: ${error.message}`);
                        }
                    });
            });

            console.log(`[Generate API] Triggered GCF processing pipeline for contentId: ${contentId}`);

        } catch (error) {
            console.error('Content database error:', error)
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
            return NextResponse.json(
                { error: `콘텐츠 저장 중 오류: ${errorMessage}` },
                { status: 500 }
            )
        }

        // Slack 알림 전송
        await notifyNewContent(session.user.id, contentId as string, title, session.user.email);

        // 즉시 응답 반환
        return NextResponse.json({
            content_id: contentId,
            title,
        })

    } catch (error) {
        console.error('General error:', error)
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
        return NextResponse.json(
            { error: `서버 처리 중 오류: ${errorMessage}` },
            { status: 500 }
        )
    }
}