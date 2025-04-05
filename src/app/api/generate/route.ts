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
                        content: "주어진 텍스트를 읽고 핵심적이고 명확한 제목을 생성해주세요. 제목만 출력하세요."
                    },
                    { role: "user", content: text }
                ],
                temperature: 0,
                max_tokens: 50
            }), TIMEOUT);

            title = titleCompletion.choices[0].message.content
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
                        status: 'processing', // 처리 중 상태로 변경
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

        // 3. 비동기 처리를 위한 백그라운드 작업 시작
        // 여기서는 응답을 먼저 반환하고, 나머지 작업은 백그라운드에서 계속 진행
        processContentInBackground(contentId, text, session.user.id, supabase);

        // 4. 즉시 응답 반환
        return NextResponse.json({
            content_id: contentId,
            title,
            status: 'processing'
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
        // 그룹 생성
        console.log('Attempting to divide text into groups...')
        const groupCompletion = await openai.chat.completions.create({
            model: "gpt-4o-mini-2024-07-18",
            messages: [
                {
                    role: "system",
                    content: `주어진 텍스트를 읽고, 핵심 아이디어/목적 단위로 논리적인 그룹으로 나눠주세요.
각 그룹은 하나의 핵심 주제나 목적을 담고 있어야 합니다.
각 그룹에는 원문 텍스트의 일부가 할당되어야 하며, 그룹의 제목은 "OOO을 기억하기" 형식이어야 합니다.

텍스트가 짧거나 단순한 경우 하나의 그룹만 생성해도 됩니다.
텍스트가 길거나 복잡한 경우 여러 그룹으로 나눠주세요.

다음 JSON 형식으로 출력해주세요:
{
  "groups": [
    {
      "title": "첫 번째 그룹 제목 (OOO을 기억하기)",
      "original_text": "이 그룹에 할당된 원문 텍스트 부분"
    },
    {
      "title": "두 번째 그룹 제목 (OOO을 기억하기)",
      "original_text": "이 그룹에 할당된 원문 텍스트 부분"
    },
    ...
  ]
}
`
                },
                { role: "user", content: text }
            ],
            temperature: 0,
            max_tokens: 2000
        });

        const groupContent = groupCompletion.choices[0].message.content;
        if (!groupContent) {
            throw new Error('No group content generated');
        }

        let groups;
        try {
            groups = JSON.parse(groupContent);
            console.log('Groups generated:', groups);
        } catch (error) {
            console.error('Group parsing error:', error);
            throw new Error('그룹 파싱 중 오류가 발생했습니다.');
        }

        // 각 그룹 처리
        for (let i = 0; i < groups.groups.length; i++) {
            const group = groups.groups[i];

            // 그룹 저장
            let groupId;
            const { data: groupData, error: groupError } = await supabase
                .from('content_groups')
                .insert([
                    {
                        content_id: contentId,
                        title: group.title,
                        original_text: group.original_text,
                        position: i
                    }
                ])
                .select();

            if (groupError) {
                console.error(`Group ${i} database error:`, groupError);
                continue;
            }

            groupId = groupData[0].id;

            // 청크 생성
            console.log(`Generating chunks for group ${i}...`);
            const chunkCompletion = await openai.chat.completions.create({
                model: "gpt-4o-mini-2024-07-18",
                messages: [
                    {
                        role: "system",
                        content: `주어진 텍스트를 읽고, 그 안에 담긴 아이디어/주장/통찰이 각각 한 문장씩 담길 수 있도록 청크로 나눠주세요.

각 청크는 서로 다른 아이디어를 담고 있어야 하며, 하나의 청크에는 하나의 핵심 메시지만 들어 있어야 합니다.

청크 개수는 고정되어 있지 않으며, 텍스트가 가진 실제 의미 단위 수에 따라 달라질 수 있습니다. (예: 1~6개)

각 청크는 원문 스타일과 톤을 유지하며, 150~200자 내외로 작성해주세요.

반드시 다음 JSON 형식으로만 출력하세요. 추가 설명이나 텍스트 없이 오직 JSON만 출력해야 합니다:
{
  "chunks": [
    {"summary": "첫 번째 청크 요약"},
    {"summary": "두 번째 청크 요약"},
    ...
  ]
}

어떤 추가 설명이나 마크다운 형식도 포함하지 마세요. 순수한 JSON 객체만 반환하세요.`
                    },
                    { role: "user", content: group.original_text }
                ],
                temperature: 0,
                max_tokens: 1000,
                response_format: { type: "json_object" }
            });

            const content = chunkCompletion.choices[0].message.content;
            if (!content) {
                console.error(`No content generated for group ${i}`);
                continue;
            }

            let chunks;
            try {
                chunks = JSON.parse(content);
            } catch (error) {
                console.error(`JSON parsing error for chunks in group ${i}:`, error);
                chunks = {
                    chunks: [{
                        summary: group.original_text.length > 200
                            ? group.original_text.substring(0, 200) + "..."
                            : group.original_text
                    }]
                };
            }

            // 마스킹 처리
            console.log(`Generating masked chunks for group ${i}...`);
            const maskingCompletion = await openai.chat.completions.create({
                model: "gpt-4o-mini-2024-07-18",
                messages: [
                    {
                        role: "system",
                        content: `다음은 여러 개의 문장 청크입니다. 각 청크에서 핵심 단어 하나 또는 두 개를 마스킹 처리해주세요. 
중요한 키워드를 자연스럽게 빈칸으로 바꾸되, 문장의 리듬이나 문맥이 어색하지 않도록 해주세요. 핵심단어는 **로 감싸서 출력하세요. 예시: **핵심단어**

반드시 다음 JSON 형식으로만 출력하세요. 추가 설명이나 텍스트 없이 오직 JSON만 출력해야 합니다:
{
  "masked_chunks": [
    {"masked_text": "첫 번째 청크 마스킹된 텍스트"},
    {"masked_text": "두 번째 청크 마스킹된 텍스트"}
  ]
}

어떤 추가 설명이나 마크다운 형식도 포함하지 마세요. 순수한 JSON 객체만 반환하세요.`
                    },
                    { role: "user", content: JSON.stringify(chunks) }
                ],
                temperature: 0,
                max_tokens: 1000,
                response_format: { type: "json_object" }
            });

            const maskedContent = maskingCompletion.choices[0].message.content;
            if (!maskedContent) {
                console.error(`No masked content generated for group ${i}`);
                continue;
            }

            let maskedChunks;
            try {
                maskedChunks = JSON.parse(maskedContent);
            } catch (error) {
                console.error(`JSON parsing error for masked chunks in group ${i}:`, error);
                maskedChunks = {
                    masked_chunks: chunks.chunks.map((chunk: { summary: string }) => ({
                        masked_text: chunk.summary
                    }))
                };
            }

            // 청크 저장
            for (let j = 0; j < chunks.chunks.length; j++) {
                const { error: chunkError } = await supabase
                    .from('content_chunks')
                    .insert([
                        {
                            group_id: groupId,
                            summary: chunks.chunks[j].summary,
                            masked_text: maskedChunks.masked_chunks[j]?.masked_text || chunks.chunks[j].summary,
                            position: j
                        }
                    ]);

                if (chunkError) {
                    console.error(`Chunk database error for group ${i}, chunk ${j}:`, chunkError);
                }
            }
        }

        // 처리 완료 후 상태 업데이트
        await supabase
            .from('contents')
            .update({ status: 'paused' })
            .eq('id', contentId);

        console.log(`Content ${contentId} processing completed successfully`);

    } catch (error) {
        console.error('Background processing error:', error);

        // 오류 발생 시 상태 업데이트
        await supabase
            .from('contents')
            .update({ status: 'error' })
            .eq('id', contentId);
    }
}