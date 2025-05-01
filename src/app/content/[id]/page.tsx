// src/app/content/[id]/page.tsx
'use server'

import { PostgrestError } from '@supabase/supabase-js'
import ContentDetail from '@/components/ContentDetail'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

type Chunk = {
  summary: string
}

type MaskedChunk = {
  masked_text: string
}

type Content = {
  id: string
  title: string
  original_text: string
  markdown_text?: string
  chunks: Chunk[]
  masked_chunks: MaskedChunk[]
  created_at: string
}

type ContentGroup = {
  id: string
  content_id: string
  title: string
  original_text: string
  chunks: Array<{ id: string, summary: string, masked_text: string }>
}

// Define the type for the nested query result
type ContentGroupWithChunks = {
  id: string
  content_id: string
  title: string
  original_text: string
  content_chunks: Array<{ id: string, summary: string, masked_text: string }>
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
  let group: ContentGroup | null = null
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
          masked_text
        )
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
    const data = rawData as ContentGroupWithChunks;

    // Transform the data to match the expected format
    if (data && Array.isArray(data.content_chunks)) {
      group = {
        id: data.id,
        content_id: data.content_id,
        title: data.title,
        original_text: data.original_text,
        chunks: data.content_chunks
      };
    } else {
      console.warn('No content chunks found for group');
      group = {
        id: data.id,
        content_id: data.content_id,
        title: data.title,
        original_text: data.original_text,
        chunks: []
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

  return <ContentDetail group={group} content={content} />
}
