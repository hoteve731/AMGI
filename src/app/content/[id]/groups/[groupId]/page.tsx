// src/app/content/[id]/groups/[groupId]/page.tsx

import { PostgrestError } from '@supabase/supabase-js'
import GroupDetail from '@/components/GroupDetail'
import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

type Chunk = {
  id: string
  summary: string
  masked_text: string
}

type ContentGroup = {
  id: string
  title: string
  original_text: string
  chunks: Chunk[]
}

type Content = {
  id: string
  title: string
  user_id: string
  original_text: string
  created_at: string
  status: string
}

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string; groupId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // params를 비동기적으로 처리
  const resolvedParams = await Promise.resolve(params);
  const contentId = resolvedParams.id;
  const groupId = resolvedParams.groupId;

  if (!contentId || !groupId) {
    console.error('Invalid ID params:', resolvedParams)
    notFound()
  }

  const supabase = await createClient()

  // 콘텐츠 기본 정보 가져오기
  const { data: contentData, error: contentError } = await supabase
    .from('contents')
    .select('*')
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