// src/app/content/[id]/page.tsx
'use server'

import { PostgrestError } from '@supabase/supabase-js'
import ContentDetail from '@/components/ContentDetail'
import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

type Chunk = {
  summary: string
}

type MaskedChunk = {
  masked_text: string
}

type Content = {
  id: string
  // title: string
  original_text: string
  chunks: Chunk[]
  masked_chunks: MaskedChunk[]
  created_at: string
  status: string
}

type ContentGroup = {
  id: string
  content_id: string
  title: string
  original_text: string
  chunks: Array<{ summary: string, masked_text: string }>
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
      .select('*')
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
    const { data, error } = await supabase
      .from('content_groups')
      .select('*')
      .eq('content_id', id)
      .returns<ContentGroup>()
      .single()

    if (error) {
      console.error('Error fetching group:', error)
      throw new Error(`Group fetch error: ${error.message}`)
    }

    group = data
  } catch (error: unknown) {
    console.error('Unexpected group fetch error:', error)
    if (error instanceof Error) {
      throw new Error(`Group fetch failed: ${error.message}`)
    } else {
      throw new Error('Unknown group fetch error')
    }
  }

  if (!group) {
    throw new Error(`No group found for content ID: ${id}`)
  }

  return <ContentDetail group={group} content={content} />
}
