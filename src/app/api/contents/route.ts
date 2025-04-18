import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('id');
    const groupId = searchParams.get('groupId');

    const supabase = await createClient()

    // Check authentication using getUser for better security
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('Authentication error:', userError?.message)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 특정 콘텐츠 상세 정보 요청인 경우
    if (contentId) {
      // 특정 그룹의 상세 정보를 요청한 경우
      if (groupId) {
        // 1. 콘텐츠 기본 정보 가져오기
        const { data: contentData, error: contentError } = await supabase
          .from('contents')
          .select('id, title')
          .eq('id', contentId)
          .eq('user_id', user.id) // Use user.id from getUser()
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
          .select('id, title, created_at')
          .eq('id', contentId)
          .eq('user_id', user.id) // Use user.id from getUser()
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
      .select('id, title, created_at')
      .eq('user_id', user.id) // Use user.id from getUser()
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching contents:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 각 콘텐츠에 대한 그룹 수 가져오기
    const contentsWithGroupsCount = await Promise.all(
      (data || []).map(async (content) => {
        // 그룹 수 가져오기
        const { count: groupsCount, error: groupsCountError } = await supabase
          .from('content_groups')
          .select('id', { count: 'exact', head: true })
          .eq('content_id', content.id);

        if (groupsCountError) {
          console.error('Error counting groups:', groupsCountError);
          return { ...content, groups_count: 0, chunks_count: 0, group_names: [] };
        }

        // 그룹이 없으면 청크도 없음
        if (groupsCount === 0) {
          return { ...content, groups_count: 0, chunks_count: 0, group_names: [] };
        }

        // 콘텐츠에 속한 그룹 ID와 제목 가져오기
        const { data: groupsData, error: groupsError } = await supabase
          .from('content_groups')
          .select('id, title')
          .eq('content_id', content.id);

        if (groupsError || !groupsData) {
          console.error('Error fetching group IDs:', groupsError);
          return { ...content, groups_count: groupsCount || 0, chunks_count: 0, group_names: [] };
        }

        // 그룹 ID 배열 생성
        const groupIds = groupsData.map(group => group.id);

        // 그룹 이름 배열 생성
        const groupNames = groupsData.map(group => group.title);

        // 모든 그룹에 속한 총 청크 수 가져오기
        const { count: chunksCount, error: chunksCountError } = await supabase
          .from('content_chunks')
          .select('id', { count: 'exact', head: true })
          .in('group_id', groupIds);

        if (chunksCountError) {
          console.error('Error counting chunks:', chunksCountError);
          return { ...content, groups_count: groupsCount || 0, chunks_count: 0, group_names: groupNames };
        }

        return {
          ...content,
          groups_count: groupsCount || 0,
          chunks_count: chunksCount || 0,
          group_names: groupNames
        };
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

    // 사용자 인증 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json(
        { error: '인증되지 않은 사용자입니다.' },
        { status: 401 }
      )
    }

    // 삭제할 콘텐츠가 현재 사용자의 것인지 확인
    const { data: contentData, error: contentError } = await supabase
      .from('contents')
      .select('user_id')
      .eq('id', id)
      .single()

    if (contentError) {
      console.error('콘텐츠 조회 중 오류:', contentError)
      return NextResponse.json(
        { error: '콘텐츠를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (contentData.user_id !== user.id) {
      return NextResponse.json(
        { error: '이 콘텐츠를 삭제할 권한이 없습니다.' },
        { status: 403 }
      )
    }

    // 1. 콘텐츠에 속한 그룹 ID 가져오기
    const { data: groupsData, error: groupsError } = await supabase
      .from('content_groups')
      .select('id')
      .eq('content_id', id)

    if (groupsError) {
      console.error('그룹 조회 중 오류:', groupsError)
      // 그룹 조회 실패해도 계속 진행 (그룹이 없을 수 있음)
    }

    // 그룹 ID 배열 생성
    const groupIds = (groupsData || []).map(group => group.id)

    // 2. 그룹에 속한 청크 삭제
    if (groupIds.length > 0) {
      const { error: chunksDeleteError } = await supabase
        .from('content_chunks')
        .delete()
        .in('group_id', groupIds)

      if (chunksDeleteError) {
        console.error('청크 삭제 중 오류:', chunksDeleteError)
        // 청크 삭제 실패해도 계속 진행
      }
    }

    // 3. 그룹 삭제
    if (groupIds.length > 0) {
      const { error: groupsDeleteError } = await supabase
        .from('content_groups')
        .delete()
        .in('id', groupIds)

      if (groupsDeleteError) {
        console.error('그룹 삭제 중 오류:', groupsDeleteError)
        // 그룹 삭제 실패해도 계속 진행
      }
    }

    // 4. 콘텐츠 삭제
    const { error: contentDeleteError } = await supabase
      .from('contents')
      .delete()
      .eq('id', id)

    if (contentDeleteError) {
      console.error('콘텐츠 삭제 중 오류:', contentDeleteError)
      return NextResponse.json(
        { error: '콘텐츠 삭제 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('예상치 못한 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}