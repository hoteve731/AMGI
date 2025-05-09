import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

// 스니펫 생성 프롬프트 템플릿
const getSnippetPrompt = (headerText: string, snippetType: string, customQuery?: string) => {
    const basePrompt = `다음 헤더 텍스트에 대한 스니펫을 생성해주세요: "${headerText}"\n\n`;

    switch (snippetType) {
        case 'definition':
            return basePrompt + '이 개념의 정의와 핵심 내용을 간결하게 설명해주세요. 마크다운 형식으로 작성하고, 중요한 용어는 **굵은 글씨**로 표시해주세요.';
        case 'explain_more':
            return basePrompt + '이 개념에 대해 더 자세히 설명해주세요. 예시와 함께 설명하고, 마크다운 형식으로 작성해주세요. 중요한 용어는 **굵은 글씨**로 표시하고, 필요한 경우 목록이나 표를 사용해주세요.';
        case 'related_concept':
            return basePrompt + '이 개념과 관련된 다른 개념들을 설명해주세요. 각 관련 개념의 간략한 설명과 원래 개념과의 관계를 마크다운 형식으로 작성해주세요.';
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
        const supabase = createServerClient(cookies())

        // 사용자 인증 확인
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 })
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
        const supabase = createServerClient(cookies())

        // 사용자 인증 확인
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 })
        }

        const userId = session.user.id

        // 요청 본문 파싱
        const { headerText, snippetType, customQuery, contentId } = await request.json()

        // 필수 필드 검증
        if (!headerText || !snippetType) {
            return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 })
        }

        // 스니펫 내용 생성 (OpenAI API 사용)
        const prompt = getSnippetPrompt(headerText, snippetType, customQuery)

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: '당신은 교육 콘텐츠 스니펫을 생성하는 AI 어시스턴트입니다. 사용자가 요청한 내용에 대해 명확하고 간결하게 마크다운 형식으로 응답해주세요.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
        })

        const snippetContent = completion.choices[0].message.content || '스니펫 내용을 생성할 수 없습니다.'

        // 태그 추출
        const tagsPrompt = getTagsPrompt(headerText, snippetContent)

        const tagsCompletion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: '당신은 텍스트에서 중요한 키워드나 태그를 추출하는 AI 어시스턴트입니다. 태그만 간결하게 반환해주세요.' },
                { role: 'user', content: tagsPrompt }
            ],
            temperature: 0.3,
        })

        const tagsText = tagsCompletion.choices[0].message.content || ''
        const tags = tagsText.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)

        // 스니펫 저장
        const { data: snippet, error: snippetError } = await supabase
            .from('snippets')
            .insert({
                user_id: userId,
                content_id: contentId || null,
                header_text: headerText,
                snippet_type: snippetType,
                custom_query: customQuery || null,
                markdown_content: snippetContent,
            })
            .select()
            .single()

        if (snippetError) {
            return NextResponse.json({ error: '스니펫 저장 중 오류가 발생했습니다.' }, { status: 500 })
        }

        // 태그 처리
        const snippetId = snippet.id
        const tagPromises = tags.map(async (tagName) => {
            // 기존 태그 확인 또는 새 태그 생성
            const { data: existingTag, error: tagError } = await supabase
                .from('snippet_tags')
                .select('*')
                .eq('name', tagName)
                .eq('user_id', userId)
                .maybeSingle()

            if (tagError) {
                console.error('태그 조회 중 오류:', tagError)
                return null
            }

            let tagId

            if (existingTag) {
                tagId = existingTag.id
            } else {
                // 새 태그 생성
                const { data: newTag, error: newTagError } = await supabase
                    .from('snippet_tags')
                    .insert({
                        name: tagName,
                        user_id: userId,
                    })
                    .select()
                    .single()

                if (newTagError) {
                    console.error('태그 생성 중 오류:', newTagError)
                    return null
                }

                tagId = newTag.id
            }

            // 스니펫-태그 관계 생성
            const { error: relationError } = await supabase
                .from('snippet_tag_relations')
                .insert({
                    snippet_id: snippetId,
                    tag_id: tagId,
                })

            if (relationError) {
                console.error('스니펫-태그 관계 생성 중 오류:', relationError)
            }

            return tagId
        })

        await Promise.all(tagPromises)

        // 태그 정보를 포함한 스니펫 조회
        const { data: snippetWithTags, error: fetchError } = await supabase
            .from('snippets')
            .select(`
        *,
        snippet_tag_relations(
          snippet_tags(id, name)
        )
      `)
            .eq('id', snippetId)
            .single()

        if (fetchError) {
            return NextResponse.json({ error: '스니펫 조회 중 오류가 발생했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ snippet: snippetWithTags })
    } catch (error) {
        console.error('스니펫 생성 중 오류:', error)
        return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}

export async function PUT(request: NextRequest) {
    try {
        const supabase = createServerClient(cookies())

        // 사용자 인증 확인
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 })
        }

        const userId = session.user.id

        // 요청 본문 파싱
        const { id, headerText, markdown_content, tags } = await request.json()

        // 필수 필드 검증
        if (!id) {
            return NextResponse.json({ error: '스니펫 ID가 필요합니다.' }, { status: 400 })
        }

        // 스니펫 업데이트
        const updateData: any = {}
        if (headerText) updateData.header_text = headerText
        if (markdown_content) updateData.markdown_content = markdown_content

        const { data: snippet, error: updateError } = await supabase
            .from('snippets')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single()

        if (updateError) {
            return NextResponse.json({ error: '스니펫 업데이트 중 오류가 발생했습니다.' }, { status: 500 })
        }

        // 태그 업데이트 (있는 경우)
        if (tags && Array.isArray(tags)) {
            // 기존 태그 관계 삭제
            await supabase
                .from('snippet_tag_relations')
                .delete()
                .eq('snippet_id', id)

            // 새 태그 관계 생성
            const tagPromises = tags.map(async (tagName: string) => {
                // 기존 태그 확인 또는 새 태그 생성
                const { data: existingTag, error: tagError } = await supabase
                    .from('snippet_tags')
                    .select('*')
                    .eq('name', tagName)
                    .eq('user_id', userId)
                    .maybeSingle()

                if (tagError) {
                    console.error('태그 조회 중 오류:', tagError)
                    return null
                }

                let tagId

                if (existingTag) {
                    tagId = existingTag.id
                } else {
                    // 새 태그 생성
                    const { data: newTag, error: newTagError } = await supabase
                        .from('snippet_tags')
                        .insert({
                            name: tagName,
                            user_id: userId,
                        })
                        .select()
                        .single()

                    if (newTagError) {
                        console.error('태그 생성 중 오류:', newTagError)
                        return null
                    }

                    tagId = newTag.id
                }

                // 스니펫-태그 관계 생성
                const { error: relationError } = await supabase
                    .from('snippet_tag_relations')
                    .insert({
                        snippet_id: id,
                        tag_id: tagId,
                    })

                if (relationError) {
                    console.error('스니펫-태그 관계 생성 중 오류:', relationError)
                }

                return tagId
            })

            await Promise.all(tagPromises)
        }

        // 태그 정보를 포함한 스니펫 조회
        const { data: snippetWithTags, error: fetchError } = await supabase
            .from('snippets')
            .select(`
        *,
        snippet_tag_relations(
          snippet_tags(id, name)
        )
      `)
            .eq('id', id)
            .single()

        if (fetchError) {
            return NextResponse.json({ error: '스니펫 조회 중 오류가 발생했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ snippet: snippetWithTags })
    } catch (error) {
        console.error('스니펫 업데이트 중 오류:', error)
        return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const supabase = createServerClient(cookies())

        // 사용자 인증 확인
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 })
        }

        const userId = session.user.id

        // URL 쿼리 파라미터 가져오기
        const searchParams = request.nextUrl.searchParams
        const snippetId = searchParams.get('id')

        if (!snippetId) {
            return NextResponse.json({ error: '스니펫 ID가 필요합니다.' }, { status: 400 })
        }

        // 스니펫 삭제 (관계 테이블은 ON DELETE CASCADE로 자동 삭제됨)
        const { error } = await supabase
            .from('snippets')
            .delete()
            .eq('id', snippetId)
            .eq('user_id', userId)

        if (error) {
            return NextResponse.json({ error: '스니펫 삭제 중 오류가 발생했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('스니펫 삭제 중 오류:', error)
        return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}
