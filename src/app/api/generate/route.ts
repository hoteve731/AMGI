import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/utils/supabase/server'
import { generateGroupsPrompt, generateEnhancedChunksPrompt } from '@/prompt_generator'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://api.openai.com/v1"
})

// 타임아웃 시간을 설정 (ms)
const TIMEOUT = 25000; // 25초

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

        // 백그라운드에서 나머지 처리 진행
        processContentInBackground(contentId, text, additionalMemory, session.user.id, supabase).catch(error => {
            console.error('Background processing error:', error)
        })

        // 즉시 응답 반환
        return NextResponse.json({
            content_id: contentId,
            title,
            status: 'paused'
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

// 백그라운드에서 콘텐츠 처리를 계속하는 함수
async function processContentInBackground(contentId: string, text: string, additionalMemory: string, userId: string, supabase: any) {
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

        // 2. 모든 그룹을 병렬로 처리
        const groupPromises = groups.map(async (group) => {
            try {
                // 2.1 그룹 저장
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
                const groupId = groupData[0].id

                // 2.2 청크 생성 - 타임아웃 적용
                try {
                    console.log(`Generating chunks for group: ${group.title}`)

                    // 프롬프트 생성기를 사용하여 청크 시스템 프롬프트 생성
                    const chunkSystemPrompt = generateEnhancedChunksPrompt(additionalMemory || '');

                    const chunksCompletion = await withTimeout(openai.chat.completions.create({
                        model: "gpt-4o-mini-2024-07-18",
                        messages: [
                            {
                                role: "system",
                                content: chunkSystemPrompt
                            },
                            { role: "user", content: group.original_text }
                        ],
                        temperature: 0.1,
                        max_tokens: 1000
                    }), TIMEOUT);

                    const chunksText = chunksCompletion.choices[0].message.content || ''
                    console.log(`Chunks generated for group ${group.title}:`, chunksText)

                    // 청크 텍스트 파싱 - 개선된 접근 방식
                    // 카드 n: 패턴으로 시작하는 모든 텍스트를 찾아 분리
                    const cardRegex = /(카드 \d+:[\s\S]*?)(?=카드 \d+:|$)/g;
                    let chunkPosition = 0;
                    const chunks = [];

                    let cardMatch;
                    while ((cardMatch = cardRegex.exec(chunksText)) !== null) {
                        const cardText = cardMatch[1].trim();

                        // 각 카드에서 질문과 답변 추출
                        const cardContentMatch = cardText.match(/카드 \d+:\s*(.*?)\s*\/\s*([\s\S]*)/);
                        if (cardContentMatch) {
                            chunkPosition++;
                            const summary = cardContentMatch[1].trim();
                            const maskedText = cardContentMatch[2].trim();

                            // 요약과 마스킹된 텍스트가 올바르게 추출되었는지 로그로 확인
                            console.log(`Parsed chunk ${chunkPosition} for group ${group.title}:`,
                                { summary, maskedTextPreview: maskedText.substring(0, 50) + '...' });

                            chunks.push({
                                group_id: groupId,
                                summary,
                                masked_text: maskedText,
                                position: chunkPosition
                            });
                        }
                    }

                    console.log(`Total chunks parsed for group ${group.title}:`, chunks.length);

                    // 청크 저장
                    if (chunks.length > 0) {
                        const { error: chunksError } = await supabase
                            .from('content_chunks')
                            .insert(chunks)

                        if (chunksError) throw chunksError
                    } else {
                        // 청크가 생성되지 않았을 경우 기본 청크 생성
                        const { error: fallbackChunkError } = await supabase
                            .from('content_chunks')
                            .insert([{
                                group_id: groupId,
                                summary: "전체 내용",
                                masked_text: group.original_text,
                                position: 1
                            }])

                        if (fallbackChunkError) throw fallbackChunkError
                    }

                    return { success: true, groupId, title: group.title };
                } catch (error) {
                    console.error(`Chunks generation error for group ${group.title}:`, error)
                    // 청크 생성 실패 시 기본 청크 하나 생성
                    try {
                        const { error: fallbackChunkError } = await supabase
                            .from('content_chunks')
                            .insert([{
                                group_id: groupId,
                                summary: "전체 내용",
                                masked_text: group.original_text,
                                position: 1
                            }])

                        if (fallbackChunkError) throw fallbackChunkError
                        return { success: true, groupId, title: group.title, fallback: true };
                    } catch (fallbackError) {
                        console.error(`Fallback chunk creation error for group ${group.title}:`, fallbackError)
                        return { success: false, error: fallbackError, title: group.title };
                    }
                }
            } catch (error) {
                console.error(`Error processing group ${group.title}:`, error)
                return { success: false, error, title: group.title };
            }
        });

        // 모든 그룹 처리가 완료될 때까지 대기
        const results = await Promise.allSettled(groupPromises);

        // 결과 로깅
        console.log('Group processing results:', results.map(r =>
            r.status === 'fulfilled' ? r.value : { status: 'rejected', reason: r.reason }
        ));

        console.log('Background processing completed successfully')

        // 모든 처리가 완료되면 콘텐츠 상태를 'studying'으로 업데이트
        try {
            const { error: updateError } = await supabase
                .from('contents')
                .update({ status: 'studying' })
                .eq('id', contentId)
                .eq('user_id', userId)

            if (updateError) {
                console.error('Failed to update content status to studying:', updateError)
            }
        } catch (updateError) {
            console.error('Error updating content status to studying:', updateError)
        }
    } catch (error) {
        console.error('Background processing error:', error)
        // 백그라운드 처리 실패 시 상태 업데이트
        try {
            await supabase
                .from('contents')
                .update({ status: 'error' })
                .eq('id', contentId)
                .eq('user_id', userId)
        } catch (updateError) {
            console.error('Failed to update content status:', updateError)
        }
    }
}