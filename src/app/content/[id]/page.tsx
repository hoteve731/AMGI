// src/app/content/[id]/page.tsx
'use server'

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { PostgrestError } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import ContentDetail from '@/components/ContentDetail'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

// DB 관련 타입들
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

// ✅ Page props 타입 직접 쓰지 말고, 구조 분해 후 내부에서 id 타입 확인만!
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  return {
    title: `Content ${params.id}`,
  }
}

export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params

  if (!id || typeof id !== 'string' || id.trim() === '') {
    console.error('Invalid ID param:', id)
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
