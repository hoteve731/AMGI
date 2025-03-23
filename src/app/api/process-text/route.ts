import { NextResponse } from 'next/server'
import { generateTitle, splitIntoChunks, maskKeyTerms } from '@/lib/llm/openai'
import { supabase } from '@/lib/supabase/client'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
    try {
        const { text } = await request.json()

        // Supabase 클라이언트 생성
        const supabase = createRouteHandlerClient({ cookies })

        // 사용자 인증 확인
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 텍스트 처리
        const [title, chunks] = await Promise.all([
            generateTitle(text),
            splitIntoChunks(text)
        ])

        // 각 청크에 대해 마스킹 처리
        const maskedChunksPromises = chunks.map(chunk => maskKeyTerms(chunk))
        const maskedChunks = await Promise.all(maskedChunksPromises)

        // Supabase에 저장
        const { data, error } = await supabase
            .from('contents')
            .insert({
                user_id: user.id,
                title,
                original_text: text,
                chunks,
                masked_chunks: maskedChunks,
                ease_factor: 2.5,
                interval: 0,
                review_count: 0
            })
            .select()
            .single()

        if (error) {
            throw error
        }

        return NextResponse.json(data)
    } catch (error) {
        console.error('Error processing text:', error)
        return NextResponse.json(
            { error: 'Failed to process text' },
            { status: 500 }
        )
    }
} 