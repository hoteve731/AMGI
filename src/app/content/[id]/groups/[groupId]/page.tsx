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

type Group = {
  id: string
  title: string
  original_text: string
  chunks: Chunk[]
}

type Content = {
  id: string
  title: string
}

type GroupDetailData = {
  content: Content
  group: Group
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function Page(props: any) {
  const params = props?.params as { id?: string; groupId?: string }
  const contentId = typeof params?.id === 'string' ? params.id : ''
  const groupId = typeof params?.groupId === 'string' ? params.groupId : ''

  if (!contentId || !groupId) {
    console.error('Invalid ID params:', params)
    notFound()
  }

  const supabase = await createClient()

  let data: GroupDetailData | null = null
  let fetchError: PostgrestError | null = null

  try {
    // 1. 콘텐츠 기본 정보 가져오기
    const { data: contentData, error: contentError } = await supabase
      .from('contents')
      .select('id, title')
      .eq('id', contentId)
      .single()

    if (contentError) {
      fetchError = contentError
      throw contentError
    }

    // 2. 그룹 정보 가져오기
    const { data: groupData, error: groupError } = await supabase
      .from('content_groups')
      .select('id, title, original_text')
      .eq('id', groupId)
      .eq('content_id', contentId)
      .single()

    if (groupError) {
      fetchError = groupError
      throw groupError
    }

    // 3. 그룹에 속한 청크 가져오기
    const { data: chunksData, error: chunksError } = await supabase
      .from('content_chunks')
      .select('id, summary, masked_text')
      .eq('group_id', groupId)
      .order('position', { ascending: true })

    if (chunksError) {
      fetchError = chunksError
      throw chunksError
    }

    data = {
      content: contentData,
      group: {
        ...groupData,
        chunks: chunksData || []
      }
    }
  } catch (error: unknown) {
    if (!fetchError && error instanceof Error) {
      console.error('Unexpected fetch error:', error)
      throw new Error(`Fetch failed: ${error.message}`)
    }
  }

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      notFound()
    } else {
      throw new Error(`Supabase error: ${fetchError.message}`)
    }
  }

  if (!data) {
    notFound()
  }

  return <GroupDetail content={data.content} group={data.group} />
}