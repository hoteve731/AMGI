// /src/app/api/content-groups/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const contentId = searchParams.get('contentId');
        const includeChunks = searchParams.get('includeChunks') === 'true';

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

        // 그룹 데이터 조회
        let query = supabase
            .from('content_groups')
            .select('id, title, original_text, position')
            .eq('content_id', contentId)
            .order('position');

        const { data: groups, error: groupsError } = await query;

        if (groupsError) {
            console.error('Error fetching groups:', groupsError);
            return NextResponse.json({ error: groupsError.message }, { status: 500 });
        }

        // 청크 포함 여부에 따라 추가 데이터 조회
        if (includeChunks && groups && groups.length > 0) {
            const groupsWithChunks = await Promise.all(groups.map(async (group) => {
                const { data: chunks, error: chunksError } = await supabase
                    .from('content_chunks')
                    .select('id, summary, masked_text, position')
                    .eq('group_id', group.id)
                    .order('position');

                if (chunksError) {
                    console.error(`Error fetching chunks for group ${group.id}:`, chunksError);
                    return { ...group, chunks: [] };
                }

                return { ...group, chunks };
            }));

            return NextResponse.json({ groups: groupsWithChunks });
        }

        return NextResponse.json({ groups });
    } catch (error) {
        console.error('Unexpected error in content-groups API:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}