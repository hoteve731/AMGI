import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const contentId = searchParams.get('id');

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

        // 콘텐츠 데이터 조회
        const { data: content, error: contentError } = await supabase
            .from('contents')
            .select('id, title')
            .eq('id', contentId)
            .single();

        if (contentError) {
            console.error('Error fetching content:', contentError);
            return NextResponse.json({ isReady: false, error: contentError.message }, { status: 404 });
        }

        // 그룹 데이터 조회
        const { data: groups, error: groupsError } = await supabase
            .from('groups')
            .select('id')
            .eq('content_id', contentId);

        if (groupsError) {
            console.error('Error fetching groups:', groupsError);
            return NextResponse.json({ isReady: false, error: groupsError.message }, { status: 404 });
        }

        // 청크 데이터 조회 (간단한 샘플만 확인)
        let chunksReady = false;
        if (groups && groups.length > 0) {
            const { count, error: chunksError } = await supabase
                .from('chunks')
                .select('id', { count: 'exact', head: true })
                .eq('group_id', groups[0].id)
                .limit(1);

            if (chunksError) {
                console.error('Error checking chunks:', chunksError);
            } else {
                chunksReady = count > 0;
            }
        }

        // 준비 상태 확인: 콘텐츠가 있고, 그룹이 최소 1개 이상 있는 경우
        const isReady = !!content && groups && groups.length > 0 && chunksReady;

        return NextResponse.json({
            isReady,
            contentExists: !!content,
            groupsCount: groups?.length || 0,
            chunksExist: chunksReady
        });
    } catch (error) {
        console.error('Unexpected error in check-content API:', error);
        return NextResponse.json({ isReady: false, error: 'Internal server error' }, { status: 500 });
    }
} 