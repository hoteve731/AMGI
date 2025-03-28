// src/app/content/[id]/page.tsx
'use server'

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { PostgrestError } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import ContentDetail from '@/components/ContentDetail'
import { notFound } from 'next/navigation'

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
  chunks: Chunk[]
  masked_chunks: MaskedChunk[]
  created_at: string
}

// ✅ 여기서 힌트 타입만 살짝 줌!
export default async function Page(props: { params: Record<string, string> }) {
  const id = typeof props.params?.id === 'string' ? props.params.id : ''

  if (!id) {
    console.error('Invalid ID param:', props.params)
    notFound()
  }

  const supabase = createServerComponentClient({ cookies })

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

  return <ContentDetail content={content} />
}
