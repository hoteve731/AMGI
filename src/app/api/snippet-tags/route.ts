import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

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
        const tagId = searchParams.get('id')

        // 특정 태그 조회
        if (tagId) {
            const { data: tag, error } = await supabase
                .from('snippet_tags')
                .select(`
          *,
          snippet_tag_relations(
            snippets(id, header_text)
          )
        `)
                .eq('id', tagId)
                .eq('user_id', userId)
                .single()

            if (error) {
                return NextResponse.json({ error: '태그를 찾을 수 없습니다.' }, { status: 404 })
            }

            return NextResponse.json({ tag })
        }

        // 모든 태그 조회 (스니펫 수와 함께)
        const { data: tags, error } = await supabase
            .from('snippet_tags')
            .select(`
        *,
        snippet_tag_relations:snippet_tag_relations(count)
      `)
            .eq('user_id', userId)
            .order('name')

        if (error) {
            return NextResponse.json({ error: '태그를 조회하는 중 오류가 발생했습니다.' }, { status: 500 })
        }

        // 각 태그의 스니펫 수 계산
        const tagsWithCount = tags.map(tag => ({
            ...tag,
            snippets_count: tag.snippet_tag_relations?.[0]?.count || 0
        }))

        return NextResponse.json({ tags: tagsWithCount })
    } catch (error) {
        console.error('태그 조회 중 오류:', error)
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
        const { name } = await request.json()

        // 필수 필드 검증
        if (!name) {
            return NextResponse.json({ error: '태그 이름이 필요합니다.' }, { status: 400 })
        }

        // 중복 태그 확인
        const { data: existingTag } = await supabase
            .from('snippet_tags')
            .select('*')
            .eq('name', name)
            .eq('user_id', userId)
            .maybeSingle()

        if (existingTag) {
            return NextResponse.json({ error: '이미 존재하는 태그입니다.', tag: existingTag }, { status: 409 })
        }

        // 태그 생성
        const { data: tag, error } = await supabase
            .from('snippet_tags')
            .insert({
                name,
                user_id: userId,
            })
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: '태그 생성 중 오류가 발생했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ tag })
    } catch (error) {
        console.error('태그 생성 중 오류:', error)
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
        const { id, name } = await request.json()

        // 필수 필드 검증
        if (!id || !name) {
            return NextResponse.json({ error: '태그 ID와 이름이 필요합니다.' }, { status: 400 })
        }

        // 중복 태그 확인 (자기 자신 제외)
        const { data: existingTag } = await supabase
            .from('snippet_tags')
            .select('*')
            .eq('name', name)
            .eq('user_id', userId)
            .neq('id', id)
            .maybeSingle()

        if (existingTag) {
            return NextResponse.json({ error: '이미 존재하는 태그 이름입니다.' }, { status: 409 })
        }

        // 태그 업데이트
        const { data: tag, error } = await supabase
            .from('snippet_tags')
            .update({ name })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: '태그 업데이트 중 오류가 발생했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ tag })
    } catch (error) {
        console.error('태그 업데이트 중 오류:', error)
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
        const tagId = searchParams.get('id')

        if (!tagId) {
            return NextResponse.json({ error: '태그 ID가 필요합니다.' }, { status: 400 })
        }

        // 태그 삭제 (관계 테이블은 ON DELETE CASCADE로 자동 삭제됨)
        const { error } = await supabase
            .from('snippet_tags')
            .delete()
            .eq('id', tagId)
            .eq('user_id', userId)

        if (error) {
            return NextResponse.json({ error: '태그 삭제 중 오류가 발생했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('태그 삭제 중 오류:', error)
        return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}
