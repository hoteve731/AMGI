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
                        content: "주어진 텍스트를 읽고 핵심적이고 명확한 제목을 생성해주세요. \"등으로 감싸지 말고 오직 텍스트 제목만 출력하세요."
                    },
                    { role: "user", content: text }
                ],
                temperature: 0,
                max_tokens: 50
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
                        content: `주어진 텍스트를 읽고 핵심 아이디어나 목적에 따라 여러개의 그룹으로 분류해주세요. 핵심 아이디어가 하나라면 1개의 그룹이여도 괜찮습니다. 3~5개가 이상적이며, 되도록이면 7개의 그룹을 넘기지 마세요.
                        각 그룹은 다음 형식으로 출력해주세요. 첫번째 줄인 그룹의 제목은 ['핵심키워드'(을/를) 기억하기] 형식으로 정해주세요.:
                        
                        그룹 1: OOO을 기억하기
                        [그룹에 해당하는 원문 텍스트]
                        
                        그룹 2: OOO을 기억하기
                        [그룹에 해당하는 원문 텍스트]
                        
                        ...
                        
                        각 그룹의 원문 텍스트는 원문을 직접 중복 없이 나눠서 그대로 발췌해야 합니다.`
                    },
                    { role: "user", content: text }
                ],
                temperature: 0,
                max_tokens: 1000
            }), TIMEOUT);

            const groupsText = groupsCompletion.choices[0].message.content || ''
            console.log('Groups generated:', groupsText)

            // 그룹 텍스트 파싱
            const groupRegex = /그룹 \d+: (.*?)\n([\s\S]*?)(?=\n그룹 \d+:|$)/g
            let match
            let position = 0
            while ((match = groupRegex.exec(groupsText)) !== null) {
                position++
                const title = match[1].trim()
                const groupText = match[2].trim()
                groups.push({ title, original_text: groupText, position })
            }

            console.log('Parsed groups:', groups)
        } catch (error) {
            console.error('Groups generation error:', error)
            // 그룹 생성 실패 시 기본 그룹 하나 생성
            groups = [{ title: "전체 내용 기억하기", original_text: text, position: 1 }]
        }

        // 2. 그룹 저장 및 청크 생성
        for (const group of groups) {
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

                    // 각 그룹의 청크 생성을 Promise로 감싸서 처리
                    await new Promise(async (resolve, reject) => {
                        try {
                            const chunksCompletion = await withTimeout(openai.chat.completions.create({
                                model: "gpt-4o-mini-2024-07-18",
                                messages: [
                                    {
                                        role: "system",
                                        content: `주어진 텍스트를 읽고 기억하기 좋은 문장, 구절 단위로 나눠진 n개의 '기억 카드'를 만들어주세요. 
                                        각 '기억 카드'는 원문에서 직접 발췌해야 합니다.
                                        각 '기억 카드'에 대해 간략한 요약도 함께 제공해주세요.
                                        
                                        또한, 각 '기억 카드'에서 중요한 단어나 개념을 식별하여 해당 단어를 **로 감싸주세요.
                                        예를 들어, "인공지능은 미래 기술의 핵심입니다"라는 문장에서 "인공지능"과 "미래 기술"이 중요하다면
                                        "**인공지능**은 **미래 기술**의 핵심입니다"와 같이 표시해주세요. 되도록이면 마스킹 되는 단어는 가장 중요한 1개로 제한하고, 꼭 필요한 경우 최대 2개까지만 마스킹 처리 하세요.
                                        
                                        다음 형식으로 출력해주세요:
                                        
                                        청크 1:
                                        요약: [간략한 요약]
                                        원문: [중요 단어가 **로 감싸진 원문 문장이나 구절]
                                        
                                        청크 2:
                                        요약: [간략한 요약]
                                        원문: [중요 단어가 **로 감싸진 원문 문장이나 구절]
                                        
                                        ...`
                                    },
                                    { role: "user", content: group.original_text }
                                ],
                                temperature: 0,
                                max_tokens: 1000
                            }), TIMEOUT);

                            const chunksText = chunksCompletion.choices[0].message.content || ''
                            console.log(`Chunks generated for group ${group.title}:`, chunksText)

                            // 청크 텍스트 파싱
                            const chunkRegex = /청크 \d+:\s*\n요약: (.*?)\s*\n원문: ([\s\S]*?)(?=\n\n청크 \d+:|$)/g
                            let chunkMatch
                            let chunkPosition = 0
                            const chunks = []

                            while ((chunkMatch = chunkRegex.exec(chunksText)) !== null) {
                                chunkPosition++
                                const summary = chunkMatch[1].trim()
                                const originalText = chunkMatch[2].trim()

                                // 마스킹된 텍스트는 LLM이 이미 **로 감싸서 제공함
                                const maskedText = originalText

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
                            }
                            resolve(true);
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
                                resolve(true);
                            } catch (fallbackError) {
                                reject(fallbackError);
                            }
                        }
                    });
                } catch (error) {
                    console.error(`Error processing group ${group.title}:`, error)
                    // 개별 그룹 처리 실패는 다른 그룹 처리에 영향을 주지 않도록 함
                    continue
                }
            } catch (error) {
                console.error(`Error processing group ${group.title}:`, error)
                // 개별 그룹 처리 실패는 다른 그룹 처리에 영향을 주지 않도록 함
                continue
            }
        }

        console.log('Background processing completed successfully')

        // 모든 처리가 완료되면 콘텐츠 상태를 'completed'로 업데이트
        try {
            const { error: updateError } = await supabase
                .from('contents')
                .update({ status: 'completed' })
                .eq('id', contentId)
                .eq('user_id', userId)

            if (updateError) {
                console.error('Failed to update content status to completed:', updateError)
            }
        } catch (updateError) {
            console.error('Error updating content status to completed:', updateError)
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