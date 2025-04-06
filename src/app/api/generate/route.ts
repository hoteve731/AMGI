import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/utils/supabase/server'

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

        const { text } = await req.json()

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
        processContentInBackground(contentId, text, session.user.id, supabase).catch(error => {
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
async function processContentInBackground(contentId: string, text: string, userId: string, supabase: any) {
    try {
        // 1. 그룹 생성 - 타임아웃 적용
        let groups = []
        try {
            console.log('Generating groups...')
            const groupsCompletion = await withTimeout(openai.chat.completions.create({
                model: "gpt-4o-mini-2024-07-18",
                messages: [
                    {
                        role: "system",
                        content: `당신은 텍스트를 의미 있는 그룹으로 분류하는 전문가입니다. 다음 지침을 따라주세요:
                    
                        1. 텍스트를 핵심 아이디어나 목적에 따라 3-5개의 그룹으로 분류하세요(최대 7개)
                        2. 각 그룹의 제목은 '{핵심키워드}를 기억하기' 형식으로 작성하세요. '를' 또는 '을' 조사는 한국 문법에 맞게 사용하세요.
                        3. 각 그룹의 내용은 원문에서 직접 발췌하고, 중복 없이 분배하세요
                        4. 출력 형식을 정확히 따라주세요:
                           
                           그룹 1: {핵심키워드}를 기억하기
                           {그룹에 해당하는 원문 텍스트}
                           
                           그룹 2: {핵심키워드}를 기억하기
                           {그룹에 해당하는 원문 텍스트}
                           
                           ...
                           
                        5. 중요: 그룹 번호와 제목 사이에 콜론(:)을 반드시 넣어주세요.
                        6. 중요: 제목과 내용 사이에 반드시 줄바꿈을 넣어주세요.`
                    },
                    { role: "user", content: text }
                ],
                temperature: 0.1,
                max_tokens: 1000
            }), TIMEOUT);

            const groupsText = groupsCompletion.choices[0].message.content || ''
            console.log('Groups generated:', groupsText)

            // 그룹 텍스트 파싱
            const groupRegex = /그룹 (\d+): (.*?)\n([\s\S]*?)(?=\n\n그룹 \d+:|$)/g
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

                    const chunksCompletion = await withTimeout(openai.chat.completions.create({
                        model: "gpt-4o-mini-2024-07-18",
                        messages: [
                            {
                                role: "system",
                                content: `당신은 텍스트를 기억하기 쉬운 카드로 변환하는 전문가입니다. 다음 지침을 따라주세요:
                            
                                1. 주어진 텍스트를 3-5개의 '기억 카드'로 분할하세요
                                2. 각 카드는 원문에서 직접 발췌하되, 이해하기 쉽게 다듬으세요
                                3. 각 카드에서 가장 중요한 단어나 개념 1개(필요시 최대 2개)를 **로 감싸세요
                                   예: "**인공지능**은 미래 기술의 핵심입니다"
                                4. 출력 형식을 정확히 따라주세요:
                                   
                                   청크 1:
                                   요약: [5-10자 내외의 핵심 요약]
                                   원문: [중요 단어가 **로 감싸진 문단]
                                   
                                   청크 2:
                                   요약: [5-10자 내외의 핵심 요약]
                                   원문: [중요 단어가 **로 감싸진 문단]
                                   
                                   ...
                                   
                                5. 중요: 청크 번호와 콜론(:) 사이에 공백을 넣어주세요.
                                6. 중요: '요약:' 다음에 실제 요약 내용이 와야 합니다.
                                7. 중요: '원문:' 다음에 실제 원문 내용이 와야 합니다.`
                            },
                            { role: "user", content: group.original_text }
                        ],
                        temperature: 0.1,
                        max_tokens: 1000
                    }), TIMEOUT);

                    const chunksText = chunksCompletion.choices[0].message.content || ''
                    console.log(`Chunks generated for group ${group.title}:`, chunksText)

                    // 청크 텍스트 파싱
                    const chunkRegex = /청크 (\d+):\s*\n요약:\s*(.*?)\s*\n원문:\s*([\s\S]*?)(?=\n\n청크 \d+:|$)/g
                    let chunkMatch
                    let chunkPosition = 0
                    const chunks = []

                    while ((chunkMatch = chunkRegex.exec(chunksText)) !== null) {
                        chunkPosition++
                        // chunkMatch[1]은 청크 번호, chunkMatch[2]는 요약, chunkMatch[3]은 마스킹된 원문
                        const summary = chunkMatch[2].trim()
                        const maskedText = chunkMatch[3].trim()

                        // 요약과 마스킹된 텍스트가 올바르게 추출되었는지 로그로 확인
                        console.log(`Parsed chunk ${chunkPosition} for group ${group.title}:`,
                            { summary, maskedTextPreview: maskedText.substring(0, 50) + '...' })

                        chunks.push({
                            group_id: groupId,
                            summary,
                            masked_text: maskedText,
                            position: chunkPosition
                        })
                    }

                    console.log(`Parsed chunks for group ${group.title}:`, chunks)

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