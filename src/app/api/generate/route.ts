import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/utils/supabase/server'

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
        let contentId
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

            // 백그라운드 파이프라인 트리거 (Fire-and-forget)
            // /api/process/pipeline 엔드포인트를 호출합니다.
            fetch(new URL('/api/process/pipeline', req.url).toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // 필요 시 인증 정보 전달
                },
                body: JSON.stringify({ contentId, text, additionalMemory }),
            }).catch(err => {
                // 호출 자체에서 오류가 발생할 경우 로깅
                console.error('[Generate API] Failed to trigger processing pipeline:', err);
                // 추가적인 오류 처리 (예: 콘텐츠 상태 업데이트)
            });

            console.log(`[Generate API] Triggered processing pipeline for contentId: ${contentId}`)

        } catch (error) {
            console.error('Content database error:', error)
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
            return NextResponse.json(
                { error: `콘텐츠 저장 중 오류: ${errorMessage}` },
                { status: 500 }
            )
        }

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