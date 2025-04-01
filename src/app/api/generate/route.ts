import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://api.openai.com/v1"
})

export async function POST(req: Request) {
    const supabase = createRouteHandlerClient({ cookies })

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

        // 1. 제목 생성
        let title
        try {
            console.log('Attempting to generate title...')
            const titleCompletion = await openai.chat.completions.create({
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
            })
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

        // 2. 텍스트 청크 분할 및 요약
        let chunks
        try {
            console.log('Attempting to generate chunks...')
            const chunkCompletion = await openai.chat.completions.create({
                model: "gpt-4o-mini-2024-07-18",
                messages: [
                    {
                        role: "system",
                        content: `주어진 텍스트를 읽고, 그 안에 담긴 아이디어/주장/통찰이 각각 한 문장씩 담길 수 있도록 청크로 나눠주세요.

각 청크는 서로 다른 아이디어를 담고 있어야 하며, 하나의 청크에는 하나의 핵심 메시지만 들어 있어야 합니다.

청크 개수는 고정되어 있지 않으며, 텍스트가 가진 실제 의미 단위 수에 따라 달라질 수 있습니다. (예: 1~6개)

각 청크는 원문 스타일과 톤을 유지하며, 150~200자 내외로 작성해주세요.

다음 JSON 형식으로 출력해주세요:
{
  "chunks": [
    {"summary": "첫 번째 청크 요약"},
    {"summary": "두 번째 청크 요약"},
    ...
  ]
}
`
                    },
                    { role: "user", content: text }
                ],
                temperature: 0,
                max_tokens: 1000
            })
            const content = chunkCompletion.choices[0].message.content
            if (!content) {
                throw new Error('No content generated')
            }
            chunks = JSON.parse(content)
            console.log('Chunks generated:', chunks)
        } catch (error) {
            console.error('Chunk generation error:', error)
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
            return NextResponse.json(
                { error: `청크 생성 중 오류: ${errorMessage}` },
                { status: 500 }
            )
        }

        // 3. 핵심 단어 마스킹
        let maskedChunks
        try {
            console.log('Attempting to generate masked chunks...')
            const maskingCompletion = await openai.chat.completions.create({
                model: "gpt-4o-mini-2024-07-18",
                messages: [
                    {
                        role: "system",
                        content: `다음은 여러 개의 문장 청크입니다. 각 청크에서 핵심 단어 하나 또는 두 개를 마스킹 처리해주세요. 
중요한 키워드를 자연스럽게 빈칸으로 바꾸되, 문장의 리듬이나 문맥이 어색하지 않도록 해주세요. 핵심단어는 **로 감싸서 출력하세요. 예시: **핵심단어**

다음 JSON 형식으로 출력하세요:
{
  "masked_chunks": [
    {"masked_text": "첫 번째 청크 마스킹된 텍스트"},
    {"masked_text": "두 번째 청크 마스킹된 텍스트"},
    ...
  ]
}
`
                    },
                    { role: "user", content: JSON.stringify(chunks) }
                ],
                temperature: 0,
                max_tokens: 1000
            })
            const maskedContent = maskingCompletion.choices[0].message.content
            if (!maskedContent) {
                throw new Error('No masked content generated')
            }
            maskedChunks = JSON.parse(maskedContent)
            console.log('Masked chunks generated:', maskedChunks)
        } catch (error) {
            console.error('Masking error:', error)
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
            return NextResponse.json(
                { error: `마스킹 처리 중 오류: ${errorMessage}` },
                { status: 500 }
            )
        }

        // 4. DB 저장
        try {
            const { data, error: dbError } = await supabase
                .from('contents')
                .insert([
                    {
                        user_id: session.user.id,
                        title,
                        original_text: text,
                        chunks: chunks.chunks,
                        masked_chunks: maskedChunks.masked_chunks
                    }
                ])
                .select()

            if (dbError) throw dbError

            return NextResponse.json({ content: data[0] })
        } catch (error) {
            console.error('Database error:', error)
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
            return NextResponse.json(
                { error: `데이터베이스 저장 중 오류: ${errorMessage}` },
                { status: 500 }
            )
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