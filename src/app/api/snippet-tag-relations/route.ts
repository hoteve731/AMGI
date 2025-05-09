import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()

        // 사용자 인증 확인
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 })
        }

        const userId = session.user.id

        // URL 쿼리 파라미터 가져오기
        const searchParams = request.nextUrl.searchParams
        const snippetId = searchParams.get('snippet_id')

        if (!snippetId) {
            return NextResponse.json({ error: '스니펫 ID가 필요합니다.' }, { status: 400 })
        }

        // 스니펫 소유권 확인
        const { data: snippet, error: snippetError } = await supabase
            .from('snippets')
            .select('id')
            .eq('id', snippetId)
            .eq('user_id', userId)
            .single()

        if (snippetError || !snippet) {
            return NextResponse.json({ error: '스니펫을 찾을 수 없거나 접근 권한이 없습니다.' }, { status: 404 })
        }

        // 스니펫에 연결된 모든 태그 조회
        const { data: tagRelations, error } = await supabase
            .from('snippet_tag_relations')
            .select(`
        id,
        snippet_tags (
          id,
          name
        )
      `)
            .eq('snippet_id', snippetId)

        if (error) {
            return NextResponse.json({ error: '태그 관계를 조회하는 중 오류가 발생했습니다.' }, { status: 500 })
        }

        // 태그 데이터 형식 정리
        const tags = tagRelations.map(relation => ({
            relation_id: relation.id,
            ...relation.snippet_tags
        }))

        return NextResponse.json({ tags })
    } catch (error) {
        console.error('태그 관계 조회 중 오류:', error)
        return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()

        // 사용자 인증 확인
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 })
        }

        const userId = session.user.id

        // 요청 본문 파싱
        const { snippet_id, tag_id } = await request.json()

        // 필수 필드 검증
        if (!snippet_id || !tag_id) {
            return NextResponse.json({ error: '스니펫 ID와 태그 ID가 필요합니다.' }, { status: 400 })
        }

        // 스니펫 소유권 확인
        const { data: snippet, error: snippetError } = await supabase
            .from('snippets')
            .select('id')
            .eq('id', snippet_id)
            .eq('user_id', userId)
            .single()

        if (snippetError || !snippet) {
            return NextResponse.json({ error: '스니펫을 찾을 수 없거나 접근 권한이 없습니다.' }, { status: 404 })
        }

        // 태그 소유권 확인
        const { data: tag, error: tagError } = await supabase
            .from('snippet_tags')
            .select('id')
            .eq('id', tag_id)
            .eq('user_id', userId)
            .single()

        if (tagError || !tag) {
            return NextResponse.json({ error: '태그를 찾을 수 없거나 접근 권한이 없습니다.' }, { status: 404 })
        }

        // 중복 관계 확인
        const { data: existingRelation } = await supabase
            .from('snippet_tag_relations')
            .select('id')
            .eq('snippet_id', snippet_id)
            .eq('tag_id', tag_id)
            .maybeSingle()

        if (existingRelation) {
            return NextResponse.json({ error: '이미 연결된 태그입니다.', relation: existingRelation }, { status: 409 })
        }

        // 태그 관계 생성
        const { data: relation, error } = await supabase
            .from('snippet_tag_relations')
            .insert({
                snippet_id,
                tag_id,
            })
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: '태그 관계 생성 중 오류가 발생했습니다.' }, { status: 500 })
        }

        // 생성된 관계와 함께 태그 정보 반환
        const { data: tagData } = await supabase
            .from('snippet_tags')
            .select('id, name')
            .eq('id', tag_id)
            .single()

        return NextResponse.json({
            relation_id: relation.id,
            ...tagData
        })
    } catch (error) {
        console.error('태그 관계 생성 중 오류:', error)
        return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient()

        // 사용자 인증 확인
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 })
        }

        const userId = session.user.id

        // URL 쿼리 파라미터 가져오기
        const searchParams = request.nextUrl.searchParams
        const relationId = searchParams.get('id')
        const snippetId = searchParams.get('snippet_id')
        const tagId = searchParams.get('tag_id')

        // relation_id로 삭제하는 경우
        if (relationId) {
            // 관계 조회 및 소유권 확인
            const { data: relation, error: relationError } = await supabase
                .from('snippet_tag_relations')
                .select(`
          id,
          snippets!inner(user_id)
        `)
                .eq('id', relationId)
                .single()

            if (relationError || !relation) {
                return NextResponse.json({ error: '태그 관계를 찾을 수 없습니다.' }, { status: 404 })
            }

            // 스니펫 소유권 확인
            if (relation.snippets[0].user_id !== userId) {
                return NextResponse.json({ error: '이 태그 관계를 삭제할 권한이 없습니다.' }, { status: 403 })
            }

            // 관계 삭제
            const { error } = await supabase
                .from('snippet_tag_relations')
                .delete()
                .eq('id', relationId)

            if (error) {
                return NextResponse.json({ error: '태그 관계 삭제 중 오류가 발생했습니다.' }, { status: 500 })
            }
        }
        // snippet_id와 tag_id로 삭제하는 경우
        else if (snippetId && tagId) {
            // 스니펫 소유권 확인
            const { data: snippet, error: snippetError } = await supabase
                .from('snippets')
                .select('id')
                .eq('id', snippetId)
                .eq('user_id', userId)
                .single()

            if (snippetError || !snippet) {
                return NextResponse.json({ error: '스니펫을 찾을 수 없거나 접근 권한이 없습니다.' }, { status: 404 })
            }

            // 관계 삭제
            const { error } = await supabase
                .from('snippet_tag_relations')
                .delete()
                .eq('snippet_id', snippetId)
                .eq('tag_id', tagId)

            if (error) {
                return NextResponse.json({ error: '태그 관계 삭제 중 오류가 발생했습니다.' }, { status: 500 })
            }
        } else {
            return NextResponse.json({ error: '관계 ID 또는 스니펫 ID와 태그 ID가 필요합니다.' }, { status: 400 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('태그 관계 삭제 중 오류:', error)
        return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}
