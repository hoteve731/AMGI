import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(request: Request) {
    try {
        const { id } = await request.json()

        if (!id) {
            return NextResponse.json(
                { error: '그룹 ID가 필요합니다.' },
                { status: 400 }
            )
        }

        const supabase = await createClient()

        // 1. 먼저 그룹에 속한 청크들을 삭제
        const { error: chunksError } = await supabase
            .from('content_chunks')
            .delete()
            .eq('group_id', id)

        if (chunksError) {
            throw chunksError
        }

        // 2. 그룹 삭제
        const { error: groupError } = await supabase
            .from('content_groups')
            .delete()
            .eq('id', id)

        if (groupError) {
            throw groupError
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('그룹 삭제 중 오류:', error)
        return NextResponse.json(
            { error: '그룹 삭제 중 오류가 발생했습니다.' },
            { status: 500 }
        )
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const contentId = searchParams.get('contentId');

        if (!contentId) {
            return NextResponse.json({ error: 'Content ID is required' }, { status: 400 });
        }

        // 인증 확인
        const supabase = await createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            console.error('Authentication error:', userError?.message);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 특정 콘텐츠의 그룹 데이터 조회
        const { data: groups, error: groupsError } = await supabase
            .from('groups')
            .select('id, title, order')
            .eq('content_id', contentId)
            .order('order');

        if (groupsError) {
            console.error('Error fetching groups:', groupsError);
            return NextResponse.json({ error: groupsError.message }, { status: 500 });
        }

        return NextResponse.json({
            groups: groups || [],
            count: groups?.length || 0
        });
    } catch (error) {
        console.error('Unexpected error in groups API:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
} 