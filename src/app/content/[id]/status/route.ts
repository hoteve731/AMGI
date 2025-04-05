import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const contentId = params.id;
    
    const supabase = await createClient()

    // 인증 확인
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 콘텐츠 기본 정보 가져오기
    const { data: contentData, error: contentError } = await supabase
      .from('contents')
      .select('id, title, status')
      .eq('id', contentId)
      .eq('user_id', session.user.id)
      .single();

    if (contentError) {
      console.error('Error fetching content:', contentError);
      return NextResponse.json({ error: contentError.message }, { status: 500 });
    }

    // 그룹 정보 가져오기
    const { data: groupsData, error: groupsError } = await supabase
      .from('content_groups')
      .select('id, title')
      .eq('content_id', contentId);

    if (groupsError) {
      console.error('Error fetching groups:', groupsError);
      return NextResponse.json({ error: groupsError.message }, { status: 500 });
    }

    // 청크 정보 가져오기 (그룹이 있는 경우)
    let chunksCount = 0;
    if (groupsData && groupsData.length > 0) {
      const groupIds = groupsData.map(group => group.id);
      
      const { count, error: chunksError } = await supabase
        .from('content_chunks')
        .select('id', { count: 'exact' })
        .in('group_id', groupIds);

      if (chunksError) {
        console.error('Error fetching chunks:', chunksError);
      } else {
        chunksCount = count || 0;
      }
    }

    // 응답 데이터 구성
    const responseData = {
      ...contentData,
      groups: groupsData,
      chunksCount,
      processingComplete: contentData.status === 'completed' || contentData.status === 'studying'
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error in status API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    );
  }
}