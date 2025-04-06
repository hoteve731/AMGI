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
                        content: "당신은 텍스트의 핵심을 정확히 파악하여 간결하고 명확한 제목을 생성하는 전문가입니다. 주어진 텍스트를 분석하고 15자 이내의 핵심적인 제목만 출력하세요. 따옴표나 기타 부가 설명 없이 제목 텍스트만 반환해야 합니다."
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
                        content: `당신은 텍스트를 의미 있는 그룹으로 분류하는 전문가입니다. 다음 지침을 따라주세요:
                    
                        1. 텍스트를 핵심 아이디어나 목적에 따라 3-5개의 그룹으로 분류하세요(최대 7개)
                        2. 각 그룹의 제목은 해당 텍스트의 핵심을 고려해서 '{핵심키워드}를 기억하기' 형식으로 작성하세요. '를' 또는 '을' 조사는 한국 문법에 맞춰서 자연스럽게 넣으세요.
                        3. 각 그룹의 내용은 원문에서 직접 발췌하고, 중복 없이 분배하세요
                        4. 출력 형식:
                           
                           그룹 1: 핵심키워드를 기억하기 
                           [그룹에 해당하는 원문 텍스트]
                           
                           그룹 2: 핵심키워드를 기억하기
                           [그룹에 해당하는 원문 텍스트]
                           
                           ...`
                    },
                    { role: "user", content: text }
                ],
                temperature: 0.1,
                max_tokens: 1000
            }), TIMEOUT);

            const groupsText = groupsCompletion.choices[0].message.content || ''
            console.log('Groups generated:', groupsText)

            // 그룹 텍스트 파싱
            const groupRegex = /그룹 (\d+): (.*?)\n([\s\S]*?)(?=\n그룹 \d+:|$)/g
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
                                        content: `당신은 텍스트를 기억하기 쉬운 카드로 변환하는 전문가입니다. 다음 지침을 따라주세요:
                                    
                                        1. 주어진 텍스트를 3-5개의 '기억 카드'로 분할하세요
                                        2. 각 카드는 원문에서 직접 발췌하되, 이해하기 쉽게 다듬으세요
                                        3. 각 카드에서 가장 중요한 단어나 개념 1개(필요시 최대 2개)를 **로 감싸세요
                                           예: "**인공지능**은 미래 기술의 핵심입니다"
                                        4. 출력 형식:
                                           
                                           청크 1:
                                           요약: [5-10자 내외의 핵심 요약]
                                           원문: [중요 단어가 **로 감싸진 문단]
                                           
                                           청크 2:
                                           요약: [5-10자 내외의 핵심 요약]
                                           원문: [중요 단어가 **로 감싸진 문단]
                                           
                                           ...`
                                    },
                                    { role: "user", content: group.original_text }
                                ],
                                temperature: 0.1,
                                max_tokens: 1000
                            }), TIMEOUT);

                            const chunksText = chunksCompletion.choices[0].message.content || ''
                            console.log(`Chunks generated for group ${group.title}:`, chunksText)

                            // 청크 텍스트 파싱
                            const chunkRegex = /청크 (\d+):\s*\n요약: (.*?)\s*\n원문: ([\s\S]*?)(?=\n\n청크 \d+:|$)/g
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