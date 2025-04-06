// src/app/content/[id]/groups/[groupId]/page.tsx
'use server'

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

type PageProps = {
  params: {
    id: string
    groupId: string
  }
}

export default async function Page({ params }: PageProps) {
  const { id: contentId, groupId } = params

  if (!contentId || !groupId) {
    console.error('Invalid ID params:', params)
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