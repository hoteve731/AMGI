// src/app/content/[id]/page.tsx
'use server'

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { PostgrestError } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import ContentDetail from '@/components/ContentDetail'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

// Define content types
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

// Define params type for Next.js App Router
type PageParams = {
  params: {
    id: string
  }
}

// SEO metadata generator
export async function generateMetadata(
  { params }: PageParams
): Promise<Metadata> {
  return {
    title: `Content ${params.id}`,
  }
}

// Page component
export default async function Page({ params }: PageParams) {
  if (!params || typeof params.id !== 'string' || params.id.trim() === '') {
    console.error("Invalid or missing ID parameter:", params)
    notFound()
  }

  const { id } = params
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
    console.error(`Unexpected error fetching content with ID ${id}:`, error)

    if (error instanceof Error) {
      throw new Error(`Failed to load content: ${error.message}`)
    } else {
      throw new Error("Unexpected non-error thrown")
    }
  }

  if (fetchError) {
    console.error(`Supabase error for ID ${id}:`, fetchError.message)

    if (fetchError.code === 'PGRST116') {
      notFound()
    } else {
      throw new Error(`Database error: ${fetchError.message} (Code: ${fetchError.code})`)
    }
  }

  if (!content) {
    console.warn(`Content with ID ${id} resulted in null without error`)
    notFound()
  }

  return <ContentDetail content={content} />
}
