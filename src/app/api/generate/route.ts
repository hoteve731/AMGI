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
                temperature: 0.7,
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
                        content: `주어진 텍스트를 핵심적인 의미 단위로 3개의 청크로 나누고 각각을 요약해주세요. 한 청크당 150~200 글자 정도가 좋습니다. 원본의 말투를 유지하세요. 
              다음 JSON 형식으로 출력해주세요:
              {
                "chunks": [
                  {"summary": "첫 번째 청크 요약"},
                  {"summary": "두 번째 청크 요약"},
                  {"summary": "세 번째 청크 요약"}
                ]
              }`
                    },
                    { role: "user", content: text }
                ],
                temperature: 0.7,
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
                        content: `각 청크에서 핵심 단어를 찾아 마스킹 처리해주세요. 
              다음 JSON 형식으로 출력해주세요:
              {
                "masked_chunks": [
                  {"masked_text": "첫 번째 청크 마스킹된 텍스트"},
                  {"masked_text": "두 번째 청크 마스킹된 텍스트"},
                  {"masked_text": "세 번째 청크 마스킹된 텍스트"}
                ]
              }`
                    },
                    { role: "user", content: JSON.stringify(chunks) }
                ],
                temperature: 0.7,
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