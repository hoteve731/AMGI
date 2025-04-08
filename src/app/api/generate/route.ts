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

            // 추가 기억 정보가 있는 경우 프롬프트에 포함
            const systemPrompt = `당신은 긴 텍스트를 학습하기 쉬운 기억 단위로 나누는 전문가입니다. 다음 지침을 반드시 따라주세요:

1. 주어진 텍스트를 1~5개의 '그룹'으로 나누세요. 다음 기준을 따릅니다:
   - 텍스트가 **짧거나 핵심 주제가 1개인 경우**, 그룹은 **1개만** 생성합니다.
   - 텍스트가 길고 다양한 하위 주제를 포함한다면, **3~5개**의 그룹으로 나누되, **너무 작게 쪼개지 마세요**.

2. 각 그룹은 **서로 다른 핵심 주제**나 아이디어를 중심으로 구성해야 하며, **원문에서 문장 단위가 아니라 문단 또는 주제 단위로 직접 발췌**해야 합니다.

3. 각 그룹은 **기억카드 생성을 위한 정보 단위**로 적절해야 하며, 다음 조건을 만족해야 합니다:
   - 하나의 주제에 집중된 문단(2~5문장)
   - 정보의 초점이 명확하고 정리되어 있음 (Focused, Precise)
   - 너무 난해하거나 중복된 내용이 없어야 함

4. 각 그룹의 title은 반드시 다음 형식으로 작성합니다:
   - “{핵심 키워드}를 기억하기”
   - '를' 또는 '을' 조사는 한국어 문법에 맞게 사용하세요. 핵심 키워드란 original_text의 내용에 기반하여 결정하세요.

5. 출력 형식을 반드시 아래와 같이 따라주세요:

그룹 1: {핵심 키워드}를 기억하기  
{해당 그룹의 원문 문단}

그룹 2: {핵심 키워드}를 기억하기  
{해당 그룹의 원문 문단}

...

6. 각 그룹의 문장은 가능한 한 원문 흐름을 유지하도록 묶되, **설명이 끊기지 않도록 자연스럽게 연결된 문장들끼리 묶으세요**.
7. 텍스트 전체를 균등하게 분배할 필요는 없습니다. 중요한 부분에 더 집중해도 됩니다.

8. 그룹 수는 1개 이상, 5개 이하로 하세요. 
   - 핵심 주제가 하나뿐이라면 **과감하게 1개만 생성**하세요. 
   - 무의미하게 쪼개지 마세요.

${additionalMemory ? `
9. 사용자가 특별히 기억하고 싶어하는 내용: "${additionalMemory}"
   이 내용과 관련된 그룹을 우선적으로 생성하세요. 해당 문장이 들어간 그룹은 반드시 별도의 그룹으로 구분해 제목에 그 주제가 드러나야 합니다.
` : ''}
`


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
                    const chunkSystemPrompt = `당신은 텍스트를 기억하기 쉬운 '기억 카드'로 변환하는 전문가입니다. 다음 지침을 따라주세요:

1. 주어진 텍스트를 5개 이상의 '기억 카드'로 나누세요.
2. 각 카드는 다음 유형 중에서 골라 골고루 구성하세요:
   - Cloze: 문장 속 핵심 단어를 가려서 기억을 유도하는 형식
   - Explanation: '왜?', '어떻게?' 같은 질문을 통해 깊은 이해를 유도
   - Salience: 일상 속 행동/선택과 연결되도록 만드는 형식
   - Creative: 사용자가 새로운 예시나 아이디어를 떠올리도록 유도
   - Mnemonic: 기억에 남기기 위한 말장난, 이미지, 연결 비유 등을 활용

3. 각 카드는 "앞면"과 "뒷면" 구조로 만들어야 하며, 뒷면은 앞면의 질문이나 빈칸을 정확하게 보완해야 합니다.
4. Cloze 카드의 경우, 앞면에는 핵심 개념이 **로 감싸진 상태로 빈칸 처리되고, 뒷면에서는 해당 단어가 공개되어야 합니다.
   예:
   앞면: **인공지능**은 인간의 학습 능력을 모방하는 기술이다. (가려진 상태)
   뒷면: 인공지능은 인간의 학습 능력을 모방하는 기술이다. (공개된 상태)

5. 카드의 앞면은 반드시 Focused, Precise, Consistent, Tractable, Effortful의 원칙을 반영해야 합니다.
6. 가능한 한 카드별로 다른 형식을 사용하되, 내용이 허락하는 한도 내에서 적절한 다양성을 확보하세요.
7. 출력 형식을 반드시 아래와 같이 따라주세요:

카드 1:
앞면: [기억을 자극하는 질문 혹은 빈칸 문장]
뒷면: [기억할 수 있도록 정답 또는 해설 제공]

카드 2:
앞면: ...
뒷면: ...

...

8. 각 카드의 앞면은 ‘지식을 꺼내보게’ 만들 수 있어야 하며, 단순 정답 암기가 아닌 사고를 자극해야 합니다.
9. 각 카드는 해당 주제의 중요한 핵심을 담고 있어야 하며, 내용이 너무 광범위하거나 복잡해서는 안 됩니다.${additionalMemory ? `

10. 사용자가 특별히 기억하고 싶어하는 내용: "${additionalMemory}"
   이 내용과 관련된 기억 카드를 반드시 포함해야 하며, 가능한 한 우선적으로 배치하세요.
   해당 개념이나 단어는 앞면/뒷면 모두에서 명확히 드러나야 하며, 가능한 경우 질문 형식으로 다뤄주세요.` : ''}`



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

                    // 청크 텍스트 파싱
                    const chunkRegex = /카드 (\d+):\s*\n앞면:\s*(.*?)\s*\n뒷면:\s*([\s\S]*?)(?=\n\n카드 \d+:|$)/g
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