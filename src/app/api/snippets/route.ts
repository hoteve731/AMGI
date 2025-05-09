import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://api.openai.com/v1"
})

// 스니펫 생성 프롬프트 템플릿
const getSnippetPrompt = (headerText: string, snippetType: string, customQuery?: string) => {
    const basePrompt = `다음 헤더 텍스트에 대한 스니펫을 생성해주세요: "${headerText}"\n\n`;

    switch (snippetType) {
        case 'summary':
            return basePrompt + '이 개념의 정의와 핵심 내용을 간결하게 요약해주세요. 마크다운 형식으로 작성하고, 중요한 용어는 **굵은 글씨**로 표시해주세요.';
        case 'question':
            return basePrompt + '이 개념에 대한 질문과 답변을 생성해주세요. 마크다운 형식으로 작성하고, 질문은 ## 헤더로, 답변은 일반 텍스트로 작성해주세요.';
        case 'explanation':
            return basePrompt + '이 개념에 대해 더 자세히 설명해주세요. 예시와 함께 설명하고, 마크다운 형식으로 작성해주세요. 중요한 용어는 **굵은 글씨**로 표시하고, 필요한 경우 목록이나 표를 사용해주세요.';
        case 'custom':
            return basePrompt + `사용자의 질문: "${customQuery}"\n\n이 질문에 대한 답변을 마크다운 형식으로 작성해주세요.`;
        default:
            return basePrompt + '이 개념에 대한 간결한 설명을 마크다운 형식으로 작성해주세요.';
    }
};

// 태그 추출 프롬프트
const getTagsPrompt = (headerText: string, snippetContent: string) => {
    return `다음은 "${headerText}"에 대한 스니펫 내용입니다:\n\n${snippetContent}\n\n이 내용에서 중요한 키워드나 태그를 5개 이내로 추출해주세요. 각 태그는 한 단어 또는 짧은 구문으로, 쉼표로 구분하여 작성해주세요. 태그만 반환해주세요.`;
};

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()

        // 사용자 인증 확인
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
        }

        const userId = session.user.id

        // URL 쿼리 파라미터 가져오기
        const searchParams = request.nextUrl.searchParams
        const snippetId = searchParams.get('id')
        const tagId = searchParams.get('tagId')

        // 특정 스니펫 조회
        if (snippetId) {
            const { data: snippet, error } = await supabase
                .from('snippets')
                .select(`
                    *,
                    snippet_tag_relations(
                        snippet_tags(id, name)
                    )
                `)
                .eq('id', snippetId)
                .eq('user_id', userId)
                .single()

            if (error) {
                return NextResponse.json({ error: '스니펫을 찾을 수 없습니다.' }, { status: 404 })
            }

            return NextResponse.json({ snippet })
        }

        // 태그로 스니펫 필터링
        if (tagId) {
            const { data: snippets, error } = await supabase
                .from('snippets')
                .select(`
                    *,
                    snippet_tag_relations!inner(
                        snippet_tags!inner(id, name)
                    )
                `)
                .eq('snippet_tag_relations.snippet_tags.id', tagId)
                .eq('user_id', userId)

            if (error) {
                return NextResponse.json({ error: '스니펫을 조회하는 중 오류가 발생했습니다.' }, { status: 500 })
            }

            return NextResponse.json({ snippets })
        }

        // 모든 스니펫 조회
        const { data: snippets, error } = await supabase
            .from('snippets')
            .select(`
                *,
                snippet_tag_relations(
                    snippet_tags(id, name)
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (error) {
            return NextResponse.json({ error: '스니펫을 조회하는 중 오류가 발생했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ snippets })
    } catch (error) {
        console.error('스니펫 조회 중 오류:', error)
        return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()

        // 사용자 인증 확인
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
        }

        const userId = session.user.id

        // 요청 본문 파싱
        const body = await request.json()
        const { header_text, content_id, snippet_type, custom_query } = body

        // 필수 필드 검증
        if (!header_text || !snippet_type) {
            return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 })
        }

        // 커스텀 타입인 경우 쿼리 필수
        if (snippet_type === 'custom' && !custom_query) {
            return NextResponse.json({ error: '커스텀 스니펫에는 쿼리가 필요합니다.' }, { status: 400 });
        }

        // Google Cloud Function URL
        const gcfUrl = process.env.NODE_ENV === 'production'
            ? 'https://us-central1-amgi-app.cloudfunctions.net/process-pipeline'
            : process.env.GCF_URL || 'http://localhost:8080';

        console.log('스니펫 생성 GCF 호출:', gcfUrl);
        console.log('요청 데이터:', { userId, header_text, content_id, snippet_type, custom_query });

        // GCF 호출
        const response = await fetch(gcfUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                processType: 'snippet',
                userId,
                header_text,
                content_id: content_id || null,
                snippet_type,
                custom_query: custom_query || null
            }),
        });

        // 응답 확인
        if (!response.ok) {
            console.error('GCF 오류 응답:', response.status, response.statusText);

            // 응답 본문 확인 시도
            try {
                const errorData = await response.text();
                console.error('GCF 오류 응답 본문:', errorData);

                // JSON 파싱 시도
                try {
                    const errorJson = JSON.parse(errorData);
                    return NextResponse.json({
                        error: errorJson.error || '스니펫 생성 중 오류가 발생했습니다.'
                    }, { status: response.status });
                } catch (e) {
                    // JSON 파싱 실패 시 텍스트 응답 그대로 반환
                    return NextResponse.json({
                        error: '스니펫 생성 중 오류가 발생했습니다.',
                        details: errorData
                    }, { status: response.status });
                }
            } catch (e) {
                // 응답 본문 읽기 실패
                return NextResponse.json({
                    error: '스니펫 생성 중 오류가 발생했습니다.'
                }, { status: response.status });
            }
        }

        // 성공 응답 파싱
        const result = await response.json();
        return NextResponse.json(result);
    } catch (error) {
        console.error('스니펫 생성 오류:', error);
        return NextResponse.json({ error: '스니펫 생성 중 오류가 발생했습니다.' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient()

        // 사용자 인증 확인
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
        }

        const userId = session.user.id

        // 요청 본문 파싱
        const body = await request.json()
        const { id, header_text, markdown_content, snippet_type, custom_query, tags } = body

        // 필수 필드 검증
        if (!id || !header_text || !markdown_content) {
            return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 })
        }

        // 스니펫 존재 및 소유권 확인
        const { data: existingSnippet, error: checkError } = await supabase
            .from('snippets')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single()

        if (checkError) {
            return NextResponse.json({ error: '스니펫을 찾을 수 없거나 접근 권한이 없습니다.' }, { status: 404 })
        }

        // 스니펫 업데이트
        const { data: updatedSnippet, error: updateError } = await supabase
            .from('snippets')
            .update({
                header_text,
                markdown_content,
                snippet_type,
                custom_query: custom_query || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single()

        if (updateError) {
            return NextResponse.json({ error: '스니펫 업데이트 중 오류가 발생했습니다.' }, { status: 500 })
        }

        // 태그 처리 (있는 경우)
        if (tags && Array.isArray(tags)) {
            // 기존 태그 관계 삭제
            const { error: deleteRelationsError } = await supabase
                .from('snippet_tag_relations')
                .delete()
                .eq('snippet_id', id)

            if (deleteRelationsError) {
                console.error('태그 관계 삭제 중 오류:', deleteRelationsError)
                return NextResponse.json({ error: '태그 관계 업데이트 중 오류가 발생했습니다.' }, { status: 500 })
            }

            // 새 태그 관계 생성
            for (const tagName of tags) {
                // 기존 태그 확인 또는 새 태그 생성
                const { data: existingTag, error: tagError } = await supabase
                    .from('snippet_tags')
                    .select('*')
                    .eq('name', tagName)
                    .eq('user_id', userId)
                    .maybeSingle()

                if (tagError) {
                    console.error('태그 조회 중 오류:', tagError)
                    continue
                }

                let tagId
                if (existingTag) {
                    tagId = existingTag.id
                } else {
                    const { data: newTag, error: createTagError } = await supabase
                        .from('snippet_tags')
                        .insert({
                            name: tagName,
                            user_id: userId
                        })
                        .select()
                        .single()

                    if (createTagError) {
                        console.error('태그 생성 중 오류:', createTagError)
                        continue
                    }
                    tagId = newTag.id
                }

                // 스니펫-태그 관계 생성
                const { error: relationError } = await supabase
                    .from('snippet_tag_relations')
                    .insert({
                        snippet_id: id,
                        tag_id: tagId
                    })

                if (relationError) {
                    console.error('스니펫-태그 관계 생성 중 오류:', relationError)
                }
            }
        }

        return NextResponse.json({ success: true, snippet: updatedSnippet })
    } catch (error) {
        console.error('스니펫 업데이트 중 오류:', error)
        return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient()

        // 사용자 인증 확인
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
        }

        const userId = session.user.id

        // URL에서 스니펫 ID 가져오기
        const url = new URL(request.url)
        const id = url.searchParams.get('id')

        if (!id) {
            return NextResponse.json({ error: '스니펫 ID가 필요합니다.' }, { status: 400 })
        }

        // 스니펫 존재 및 소유권 확인
        const { data: existingSnippet, error: checkError } = await supabase
            .from('snippets')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single()

        if (checkError) {
            return NextResponse.json({ error: '스니펫을 찾을 수 없거나 접근 권한이 없습니다.' }, { status: 404 })
        }

        // 태그 관계 삭제
        const { error: deleteRelationsError } = await supabase
            .from('snippet_tag_relations')
            .delete()
            .eq('snippet_id', id)

        if (deleteRelationsError) {
            console.error('태그 관계 삭제 중 오류:', deleteRelationsError)
            // 계속 진행 (태그 관계 삭제 실패가 스니펫 삭제를 막지 않음)
        }

        // 스니펫 삭제
        const { error: deleteError } = await supabase
            .from('snippets')
            .delete()
            .eq('id', id)

        if (deleteError) {
            return NextResponse.json({ error: '스니펫 삭제 중 오류가 발생했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('스니펫 삭제 중 오류:', error)
        return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}
