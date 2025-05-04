import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/utils/supabase/server'
import { generateUnifiedChunksPrompt } from '@/prompt_generator'

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

        const { group_id, content_id, useMarkdownText } = await req.json()

        if (!group_id || !content_id) {
            return NextResponse.json(
                { error: '그룹 ID와 콘텐츠 ID가 필요합니다.' },
                { status: 400 }
            )
        }

        // 1. 그룹 정보 조회
        const { data: groupData, error: groupError } = await supabase
            .from('content_groups')
            .select('*')
            .eq('id', group_id)
            .single()

        if (groupError || !groupData) {
            return NextResponse.json(
                { error: '그룹을 찾을 수 없습니다.' },
                { status: 404 }
            )
        }

        // 2. 콘텐츠 정보 조회 (추가 메모리 가져오기 위함)
        const { data: contentData, error: contentError } = await supabase
            .from('contents')
            .select('additional_memory, markdown_text')
            .eq('id', content_id)
            .single()

        if (contentError) {
            console.error('Content fetch error:', contentError)
        }

        const additionalMemory = contentData?.additional_memory || '';

        // 마크다운 텍스트 사용 여부 확인
        const useMarkdownForChunks = useMarkdownText && contentData?.markdown_text && groupData.original_text;

        // 3. Cloze 청크 생성
        try {
            console.log(`Generating cloze chunks for group: ${groupData.title}`)

            // 프롬프트 생성기를 사용하여 Cloze 청크 시스템 프롬프트 생성
            const chunkSystemPrompt = generateUnifiedChunksPrompt(additionalMemory);

            const chunksCompletion = await withTimeout(openai.chat.completions.create({
                model: "gpt-4.1-nano-2025-04-14",
                messages: [
                    {
                        role: "system",
                        content: chunkSystemPrompt
                    },
                    { role: "user", content: useMarkdownForChunks ? contentData.markdown_text : groupData.original_text }
                ],
                temperature: 0.1,
                max_tokens: 10000
            }), TIMEOUT);

            const chunksText = chunksCompletion.choices[0].message.content || ''
            console.log(`Cloze chunks generated for group ${groupData.title}:`, chunksText)

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
                    console.log(`Parsed cloze chunk ${chunkPosition} for group ${groupData.title}:`,
                        { summary, maskedTextPreview: maskedText.substring(0, 50) + '...' });

                    chunks.push({
                        group_id,
                        summary,
                        masked_text: maskedText,
                        position: chunkPosition,
                        chunk_type: 'cloze' // cloze 타입 지정
                    });
                }
            }

            console.log(`Total cloze chunks parsed for group ${groupData.title}:`, chunks.length);

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
                        group_id,
                        summary: "전체 내용 (Cloze)",
                        masked_text: groupData.original_text,
                        position: 1,
                        chunk_type: 'cloze' // cloze 타입 지정
                    }])

                if (fallbackChunkError) throw fallbackChunkError

                return NextResponse.json({
                    success: true,
                    group_id,
                    chunks: [{
                        group_id,
                        summary: "전체 내용 (Cloze)",
                        masked_text: groupData.original_text,
                        position: 1,
                        chunk_type: 'cloze' // cloze 타입 지정
                    }]
                })
            }

            // 모든 그룹의 청크 생성이 완료되었는지 확인
            const { data: groupsData, error: groupsError } = await supabase
                .from('content_groups')
                .select('id')
                .eq('content_id', content_id)

            if (groupsError) {
                console.error('Groups fetch error:', groupsError)
            } else {
                // 모든 그룹에 대해 cloze 청크와 일반 청크가 있는지 확인
                const allGroupIds = groupsData.map(g => g.id);

                // cloze 청크 확인
                const { data: clozeChunksData, error: clozeChunksQueryError } = await supabase
                    .from('content_chunks')
                    .select('group_id')
                    .in('group_id', allGroupIds)
                    .eq('chunk_type', 'cloze')
                    .order('group_id')

                // 일반 청크 확인
                const { data: normalChunksData, error: normalChunksQueryError } = await supabase
                    .from('content_chunks')
                    .select('group_id')
                    .in('group_id', allGroupIds)
                    .eq('chunk_type', 'normal')
                    .order('group_id')

                if (clozeChunksQueryError) {
                    console.error('Cloze chunks query error:', clozeChunksQueryError)
                } else if (normalChunksQueryError) {
                    console.error('Normal chunks query error:', normalChunksQueryError)
                } else {
                    // cloze 청크가 있는 그룹 ID 목록
                    const groupsWithClozeChunks = [...new Set(clozeChunksData.map(c => c.group_id))];

                    // 일반 청크가 있는 그룹 ID 목록
                    const groupsWithNormalChunks = [...new Set(normalChunksData.map(c => c.group_id))];
                }
            }

            return NextResponse.json({
                success: true,
                group_id,
                chunks_count: chunks.length
            })
        } catch (error) {
            console.error(`Cloze chunks generation error for group ${groupData.title}:`, error)

            // 청크 생성 실패 시 기본 청크 하나 생성
            try {
                const { error: fallbackChunkError } = await supabase
                    .from('content_chunks')
                    .insert([{
                        group_id,
                        summary: "전체 내용 (Cloze)",
                        masked_text: groupData.original_text,
                        position: 1,
                        chunk_type: 'cloze' // cloze 타입 지정
                    }])

                if (fallbackChunkError) throw fallbackChunkError

                return NextResponse.json({
                    success: true,
                    group_id,
                    chunks: [{
                        group_id,
                        summary: "전체 내용 (Cloze)",
                        masked_text: groupData.original_text,
                        position: 1,
                        chunk_type: 'cloze' // cloze 타입 지정
                    }]
                })
            } catch (error) {
                console.error('Fallback chunk creation error:', error)
                return NextResponse.json({
                    success: false,
                    error: 'Fallback chunk creation failed'
                })
            }
        }
    } catch (error) {
        console.error('Error:', error)
        return NextResponse.json({
            success: false,
            error: 'Internal Server Error'
        })
    }
}