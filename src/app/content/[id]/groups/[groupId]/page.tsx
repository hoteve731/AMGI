// src/app/content/[id]/groups/[groupId]/page.tsx

import { PostgrestError } from '@supabase/supabase-js'
import GroupDetail from '@/components/GroupDetail'
import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export default async function Page(props: any) {
  // props에서 params와 searchParams 추출
  const { params, searchParams } = props;

  // 타입 안전성 보장을 위해 타입 가드 추가
  if (!params || typeof params !== 'object' || !('id' in params) || !('groupId' in params)) {
    console.error('Invalid params structure:', params);
    notFound();
  }

  const contentId = params.id as string;
  const groupId = params.groupId as string;

  if (!contentId || !groupId) {
    console.error('Invalid ID params:', params)
    notFound()
  }

  const supabase = await createClient()

  // 콘텐츠 기본 정보 가져오기 (status 필드 제외)
  const { data: contentData, error: contentError } = await supabase
    .from('contents')
    .select('id, title, created_at, user_id')
    .eq('id', contentId)
    .single()

  if (contentError) {
    console.error('Error fetching content:', contentError)
    notFound()
  }

  // 그룹 정보 가져오기
  const { data: groupData, error: groupError } = await supabase
    .from('content_groups')
    .select('*, chunks:content_chunks(*)')
    .eq('id', groupId)
    .eq('content_id', contentId)
    .single()

  if (groupError) {
    console.error('Error fetching group:', groupError)
    notFound()
  }

  return <GroupDetail content={contentData} group={groupData} />
}