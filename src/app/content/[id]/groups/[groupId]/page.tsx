// src/app/content/[id]/groups/[groupId]/page.tsx

import { PostgrestError } from '@supabase/supabase-js'
import GroupDetail from '@/components/GroupDetail'
import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

// Define proper types for the props
type PageProps = {
  params: Promise<{ id: string; groupId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ params, searchParams }: PageProps) {
  // Ensure params and searchParams are properly awaited
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  
  // 타입 안전성 보장을 위해 타입 가드 추가
  if (!resolvedParams || !('id' in resolvedParams) || !('groupId' in resolvedParams)) {
    console.error('Invalid params structure:', resolvedParams);
    notFound();
  }

  const contentId = resolvedParams.id;
  const groupId = resolvedParams.groupId;

  if (!contentId || !groupId) {
    console.error('Invalid ID params:', params)
    notFound()
  }

  const supabase = await createClient()

  // 콘텐츠 기본 정보 가져오기 (original_text 필드 추가)
  const { data: contentData, error: contentError } = await supabase
    .from('contents')
    .select('id, title, created_at, user_id, original_text')
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