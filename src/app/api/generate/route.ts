import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/utils/supabase/server'
import { generateGroupsPrompt } from '@/prompt_generator'

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
                model: "gpt-4o-mini-2024-07-18",
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

        // 2. 콘텐츠 저장 (청크와 그룹은 아직 생성하지 않음)
        let contentId
        try {
            const { data: contentData, error: contentError } = await supabase
                .from('contents')
                .insert([
                    {
                        user_id: session.user.id,
                        title,
                        original_text: text,
                        additional_memory: additionalMemory || '',
                        status: 'paused',
                        chunks: [],
                        masked_chunks: []
                    }
                ])
                .select('id')

            if (contentError) throw contentError
            contentId = contentData[0].id
        } catch (error) {
            console.error('Content database error:', error)
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
            return NextResponse.json(
                { error: `콘텐츠 저장 중 오류: ${errorMessage}` },
                { status: 500 }
            )
        }

        // 그룹 생성 처리 (청크 생성은 별도 API로 분리)
        try {
            // 1. 그룹 생성 - 타임아웃 적용
            let groups = []
            try {
                console.log('Generating groups...')

                // 프롬프트 생성기를 사용하여 시스템 프롬프트 생성
                const systemPrompt = generateGroupsPrompt(additionalMemory || '');

                const groupsCompletion = await withTimeout(openai.chat.completions.create({
                    model: "gpt-4o-mini-2024-07-18",
                    messages: [
                        {
                            role: "system",
                            content: systemPrompt
                        },
                        { role: "user", content: text }
                    ],
                    temperature: 0.1,
                    max_tokens: 1000
                }), TIMEOUT);

                const groupsText = groupsCompletion.choices[0].message.content || ''
                console.log('Groups generated:', groupsText)

                // 그룹 텍스트 파싱 - 새로운 형식에 맞게 정규식 수정
                const groupRegex = /<그룹 (\d+)>\s*\n제목:\s*(.*?)\s*\n오리지널 소스:\s*([\s\S]*?)(?=\n\n<그룹 \d+>|$)/g
                let match
                let position = 0
                while ((match = groupRegex.exec(groupsText)) !== null) {
                    position++
                    // match[1]은 그룹 번호, match[2]는 제목, match[3]은 내용
                    const title = match[2].trim()
                    const groupText = match[3].trim()

                    // 제목과 내용이 올바르게 추출되었는지 로그로 확인
                    console.log(`Parsed group ${position}:`, { title, contentPreview: groupText.substring(0, 50) + '...' })

                    groups.push({ title, original_text: groupText, position })
                }

                console.log('Parsed groups:', groups)
            } catch (error) {
                console.error('Groups generation error:', error)
                // 그룹 생성 실패 시 기본 그룹 하나 생성
                groups = [{ title: "전체 내용 기억하기", original_text: text, position: 1 }]
            }

            // 그룹 저장
            const groupIds = [];
            for (const group of groups) {
                try {
                    const { data: groupData, error: groupError } = await supabase
                        .from('content_groups')
                        .insert([{
                            content_id: contentId,
                            title: group.title,
                            original_text: group.original_text,
                            position: group.position
                        }])
                        .select('id')

                    if (groupError) throw groupError
                    groupIds.push(groupData[0].id);
                } catch (error) {
                    console.error(`Error creating group ${group.title}:`, error)
                }
            }

            // 즉시 응답 반환 (청크 생성은 별도 API 호출로 처리)
            return NextResponse.json({
                content_id: contentId,
                title,
                status: 'paused',
                group_ids: groupIds
            })

        } catch (error) {
            console.error('Group generation error:', error)
            // 그룹 생성 실패해도 콘텐츠는 이미 생성되었으므로 콘텐츠 ID 반환
            return NextResponse.json({
                content_id: contentId,
                title,
                status: 'paused',
                error: '그룹 생성 중 오류가 발생했습니다.'
            })
        }

    } catch (error) {
        console.error('General error:', error)
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
        return NextResponse.json(
            { error: `서버 처리 중 오류: ${errorMessage}` },
            { status: 500 }
        )
    }
}