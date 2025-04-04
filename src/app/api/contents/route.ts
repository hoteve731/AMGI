import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('id');
    const groupId = searchParams.get('groupId');

    const supabase = await createClient()

    // Check authentication
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 특정 콘텐츠 상세 정보 요청인 경우
    if (contentId) {
      // 특정 그룹의 상세 정보를 요청한 경우
      if (groupId) {
        // 1. 콘텐츠 기본 정보 가져오기
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

        // 2. 그룹 정보 가져오기
        const { data: groupData, error: groupError } = await supabase
          .from('content_groups')
          .select('id, title, original_text')
          .eq('id', groupId)
          .eq('content_id', contentId)
          .single();

        if (groupError) {
          console.error('Error fetching group:', groupError);
          return NextResponse.json({ error: groupError.message }, { status: 500 });
        }

        // 3. 그룹에 속한 청크 가져오기
        const { data: chunksData, error: chunksError } = await supabase
          .from('content_chunks')
          .select('id, summary, masked_text')
          .eq('group_id', groupId)
          .order('order', { ascending: true });

        if (chunksError) {
          console.error('Error fetching chunks:', chunksError);
          return NextResponse.json({ error: chunksError.message }, { status: 500 });
        }

        // 결과 조합
        return NextResponse.json({
          content: contentData,
          group: {
            ...groupData,
            chunks: chunksData || []
          }
        });
      }
      // 콘텐츠와 그 안의 모든 그룹 정보를 요청한 경우
      else {
        // 1. 콘텐츠 기본 정보 가져오기
        const { data: contentData, error: contentError } = await supabase
          .from('contents')
          .select('id, title, created_at, status')
          .eq('id', contentId)
          .eq('user_id', session.user.id)
          .single();

        if (contentError) {
          console.error('Error fetching content:', contentError);
          return NextResponse.json({ error: contentError.message }, { status: 500 });
        }

        // 2. 콘텐츠에 속한 그룹 가져오기
        const { data: groupsData, error: groupsError } = await supabase
          .from('content_groups')
          .select('id, title')
          .eq('content_id', contentId);

        if (groupsError) {
          console.error('Error fetching groups:', groupsError);
          return NextResponse.json({ error: groupsError.message }, { status: 500 });
        }

        // 3. 각 그룹별 청크 개수 가져오기
        const groupsWithChunkCount = await Promise.all(
          (groupsData || []).map(async (group) => {
            const { count, error: countError } = await supabase
              .from('content_chunks')
              .select('id', { count: 'exact', head: true })
              .eq('group_id', group.id);

            if (countError) {
              console.error('Error counting chunks:', countError);
              return { ...group, chunks_count: 0 };
            }

            return { ...group, chunks_count: count || 0 };
          })
        );

        // 결과 조합
        return NextResponse.json({
          content: {
            ...contentData,
            groups: groupsWithChunkCount
          }
        });
      }
    }

    // 모든 콘텐츠 목록 요청인 경우
    const { data, error } = await supabase
      .from('contents')
      .select('id, title, created_at, status')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching contents:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 각 콘텐츠에 대한 그룹 수 가져오기
    const contentsWithGroupsCount = await Promise.all(
      (data || []).map(async (content) => {
        const { count, error: countError } = await supabase
          .from('content_groups')
          .select('id', { count: 'exact', head: true })
          .eq('content_id', content.id);

        if (countError) {
          console.error('Error counting groups:', countError);
          return { ...content, groups_count: 0 };
        }

        return { ...content, groups_count: count || 0 };
      })
    );

    return NextResponse.json({ contents: contentsWithGroupsCount || [] });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { id, status } = await request.json();

    if (!id || !status) {
      return NextResponse.json({ error: 'Content ID and status are required' }, { status: 400 });
    }

    // Validate status value
    if (!['studying', 'completed', 'paused'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    const supabase = await createClient();

    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Update content status for the authenticated user
    const { data, error } = await supabase
      .from('contents')
      .update({ status })
      .match({
        id: id,
        user_id: session.user.id
      })
      .select();

    if (error) {
      console.error('Error updating content status:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, content: data?.[0] || null });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: '콘텐츠 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // 인증 확인
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json(
        { error: '인증되지 않은 사용자입니다.' },
        { status: 401 }
      )
    }

    // 콘텐츠 소유자 확인
    const { data: contentData, error: contentCheckError } = await supabase
      .from('contents')
      .select('user_id')
      .eq('id', id)
      .single()

    if (contentCheckError) {
      console.error('콘텐츠 확인 중 오류:', contentCheckError)
      return NextResponse.json(
        { error: '콘텐츠를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (contentData.user_id !== session.user.id) {
      return NextResponse.json(
        { error: '이 콘텐츠를 삭제할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    // 1. 먼저 콘텐츠에 속한 모든 그룹을 찾습니다
    const { data: groups, error: groupsFetchError } = await supabase
      .from('content_groups')
      .select('id')
      .eq('content_id', id)

    if (groupsFetchError) {
      console.error('그룹 조회 중 오류:', groupsFetchError)
      throw groupsFetchError
    }

    // 2. 각 그룹에 속한 청크들을 삭제합니다
    if (groups && groups.length > 0) {
      for (const group of groups) {
        const { error: chunksError } = await supabase
          .from('content_chunks')
          .delete()
          .eq('group_id', group.id)

        if (chunksError) {
          console.error(`그룹 ${group.id}의 청크 삭제 중 오류:`, chunksError)
          throw chunksError
        }
      }
    }

    // 3. 그룹을 삭제합니다
    const { error: groupsError } = await supabase
      .from('content_groups')
      .delete()
      .eq('content_id', id)

    if (groupsError) {
      console.error('그룹 삭제 중 오류:', groupsError)
      throw groupsError
    }

    // 4. 마지막으로 콘텐츠를 삭제합니다
    const { error: contentError } = await supabase
      .from('contents')
      .delete()
      .eq('id', id)

    if (contentError) {
      console.error('콘텐츠 삭제 중 오류:', contentError)
      throw contentError
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('콘텐츠 삭제 중 오류:', error)
    return NextResponse.json(
      { error: '콘텐츠 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}