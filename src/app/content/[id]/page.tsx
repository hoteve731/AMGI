// src/app/content/[id]/page.tsx
'use server'

import { PostgrestError } from '@supabase/supabase-js'
import GroupDetail from '@/components/GroupDetail'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

// Define types for database content
type Content = {
  id: string
  title: string
  user_id: string
  original_text: string
  markdown_text?: string
  chunks: any[]
  masked_chunks: any[]
  created_at: string
}

// Define the type for the database query result
type DbContentGroup = {
  id: string
  content_id: string
  title: string
  original_text: string
  position: number
  content_chunks: Array<{
    id: string
    summary: string
    masked_text: string
    position?: number
  }>
}

// Define types that match what GroupDetail component expects
type GroupDetailChunk = {
  id: string
  group_id: string
  summary: string
  masked_text: string
  position: number
  status?: 'active' | 'inactive'
}

type GroupDetailGroup = {
  id: string
  title: string
  original_text: string
  chunks?: GroupDetailChunk[]
  position: number
}

// ✅ 핵심: Vercel 타입 충돌 피하기 위해 any 사용
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function Page(props: any) {
  const params = props?.params as { id?: string }
  const id = typeof params?.id === 'string' ? params.id : ''

  if (!id) {
    console.error('Invalid ID param:', params)
    notFound()
  }

  const supabase = await createClient()

  let content: Content | null = null
  let fetchError: PostgrestError | null = null

  try {
    const { data, error } = await supabase
      .from('contents')
      .select('id, title, original_text, markdown_text, chunks, masked_chunks, created_at')
      .eq('id', id)
      .returns<Content>()
      .single()

    content = data
    fetchError = error
  } catch (error: unknown) {
    console.error('Unexpected fetch error:', error)

    if (error instanceof Error) {
      throw new Error(`Fetch failed: ${error.message}`)
    } else {
      throw new Error('Unknown fetch error')
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

  // Fetch the first group associated with this content
  let group: GroupDetailGroup | null = null
  try {
    // Use the any type for the raw response and then transform it properly
    const { data: rawData, error } = await supabase
      .from('content_groups')
      .select(`
        id, 
        content_id, 
        title, 
        original_text, 
        content_chunks (
          id,
          summary, 
          masked_text,
          position
        ),
        position
      `)
      .eq('content_id', id)
      .single()

    if (error) {
      console.error('Error fetching group:', error)
      // PGRST116 코드는 결과가 없거나 여러 개인 경우 발생
      if (error.code === 'PGRST116') {
        // 그룹이 없는 경우 - 그룹 리스트 페이지로 리다이렉트
        redirect(`/content/${id}/groups`);
      }
      throw new Error(`Group fetch error: ${error.message}`)
    }

    // Type assertion to help TypeScript understand the structure
    const data = rawData as DbContentGroup;

    // Transform the data to match the expected format
    if (data && Array.isArray(data.content_chunks)) {
      // Transform chunks to match the GroupDetail component's expected structure
      const transformedChunks: GroupDetailChunk[] = data.content_chunks.map((chunk, index) => ({
        id: chunk.id,
        group_id: data.id, // Set group_id to the parent group's id
        summary: chunk.summary,
        masked_text: chunk.masked_text,
        position: typeof chunk.position === 'number' ? chunk.position : index,
        status: 'active' // Default status
      }));

      // Create a group object that matches GroupDetail's expectations
      group = {
        id: data.id,
        title: data.title,
        original_text: data.original_text,
        chunks: transformedChunks,
        position: data.position || 0
      };
    } else {
      console.warn('No content chunks found for group');
      group = {
        id: data.id,
        title: data.title,
        original_text: data.original_text,
        chunks: [],
        position: data.position || 0
      };
    }
  } catch (error: unknown) {
    console.error('Unexpected group fetch error:', error)
    if (error instanceof Error) {
      // 에러 메시지에 'multiple (or no) rows returned'가 포함되어 있으면 그룹이 없는 경우로 처리
      if (error.message.includes('multiple (or no) rows returned')) {
        // 그룹이 없는 경우 - 그룹 리스트 페이지로 리다이렉트
        redirect(`/content/${id}/groups`);
      }
      throw new Error(`Group fetch failed: ${error.message}`)
    } else {
      throw new Error('Unknown group fetch error')
    }
  }

  if (!group) {
    // 그룹이 없는 경우 - 그룹 리스트 페이지로 리다이렉트
    redirect(`/content/${id}/groups`);
  }

  return <GroupDetail group={group} content={content} />
}
