// src/app/content/[id]/groups/page.tsx
'use server'

import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import ContentGroups from '@/components/ContentGroups'

// Define proper types for the props
type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ params, searchParams }: PageProps) {
  // Ensure params and searchParams are properly awaited
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams
  const id = resolvedParams.id

  if (!id) {
    console.error('Invalid ID param:', params)
    notFound()
  }

  const supabase = await createClient()

  // 콘텐츠 정보 가져오기
  const { data: content, error: contentError } = await supabase
    .from('contents')
    .select('id, title, created_at, additional_memory, original_text, markdown_text, user_id')
    .eq('id', id)
    .single()

  if (contentError) {
    console.error('Error fetching content:', contentError)
    notFound()
  }

  // 콘텐츠에 속한 그룹 정보 가져오기
  const { data: groups, error: groupsError } = await supabase
    .from('content_groups')
    .select('*, chunks:content_chunks(*)')
    .eq('content_id', id)

  if (groupsError) {
    console.error('Error fetching groups:', groupsError)
    notFound()
  }

  // 각 그룹별 청크 개수 가져오기
  const groupsWithChunkCounts = await Promise.all(
    groups.map(async (group) => {
      const { count, error: countError } = await supabase
        .from('content_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', group.id)

      if (countError) {
        console.error(`Error counting chunks for group ${group.id}:`, countError)
        return { ...group, chunks_count: 0 }
      }

      return { ...group, chunks_count: count || 0 }
    })
  )

  // 콘텐츠와 그룹 정보 합치기
  const contentWithGroups = {
    ...content,
    groups: groupsWithChunkCounts
  }

  return <ContentGroups content={contentWithGroups} />
}