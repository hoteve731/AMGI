// src/app/content/[id]/groups/page.tsx
'use server'

import { PostgrestError } from '@supabase/supabase-js'
import ContentGroups from '@/components/ContentGroups'
import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

type ContentGroup = {
  id: string
  title: string
  chunks_count: number
}

type ContentWithGroups = {
  id: string
  title: string
  created_at: string
  status: 'studying' | 'completed' | 'paused'
  groups: ContentGroup[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function Page({ params }: { params: { id: string } }) {
  const id = params.id

  if (!id) {
    console.error('Invalid ID param:', params)
    notFound()
  }

  const supabase = await createClient()

  let content: ContentWithGroups | null = null
  let fetchError: PostgrestError | null = null

  try {
    // 1. 콘텐츠 기본 정보 가져오기
    const { data: contentData, error: contentError } = await supabase
      .from('contents')
      .select('id, title, created_at, status')
      .eq('id', id)
      .single()

    if (contentError) {
      fetchError = contentError
      throw contentError
    }

    // 2. 콘텐츠에 속한 그룹 가져오기
    const { data: groupsData, error: groupsError } = await supabase
      .from('content_groups')
      .select('id, title')
      .eq('content_id', id)

    if (groupsError) {
      fetchError = groupsError
      throw groupsError
    }

    // 3. 각 그룹별 청크 개수 가져오기
    const groupsWithChunkCount = await Promise.all(
      (groupsData || []).map(async (group) => {
        const { count, error: countError } = await supabase
          .from('content_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', group.id)

        if (countError) {
          console.error('Error counting chunks:', countError)
          return { ...group, chunks_count: 0 }
        }

        return { ...group, chunks_count: count || 0 }
      })
    )

    content = {
      ...contentData,
      groups: groupsWithChunkCount
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

  if (!content) {
    notFound()
  }

  return <ContentGroups content={content} />
}