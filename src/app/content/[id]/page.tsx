'use server'

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import ContentDetail from '@/components/ContentDetail'
import { notFound } from 'next/navigation'

// Next.js 14의 정확한 타입 정의
type GeneratePageParams = {
    id: string;
}

type GeneratePageProps<T = GeneratePageParams> = {
    params: T;
    searchParams?: { [key: string]: string | string[] | undefined };
}

// generateMetadata 함수 추가 (필요한 경우)
export async function generateMetadata({ params }: GeneratePageProps) {
    return {
        title: `Content ${params.id}`,
    }
}

// content 타입 정의 추가
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

type SupabaseError = {
    message: string
    code: string
}

// 페이지 컴포넌트를 더 단순하게 정의
export default async function Page({
    params,
}: {
    params: { id: string }
}) {
    const supabase = createServerComponentClient({ cookies })

    const { data: content, error } = await supabase
        .from('contents')
        .select('*')
        .eq('id', params.id)
        .single()
        .then(result => result as { data: Content | null, error: SupabaseError | null })

    if (error) {
        console.error('Error fetching content:', error)
        throw error
    }

    if (!content) {
        notFound()
    }

    return <ContentDetail content={content} />
}

// Next.js의 정적 타입 체크를 위한 타입 선언
declare module 'next' {
    export interface PageProps {
        params: GeneratePageParams;
        searchParams?: { [key: string]: string | string[] | undefined };
    }
} 