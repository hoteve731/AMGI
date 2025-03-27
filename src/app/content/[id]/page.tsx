// src/app/content/[id]/page.tsx
'use server'

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import ContentDetail from '@/components/ContentDetail'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next' // Import Metadata type from next

// Define the props type directly for the page and metadata function
// This is the standard approach for the App Router
type PageProps = {
    params: { id: string };
    searchParams?: { [key: string]: string | string[] | undefined };
}

// content 타입 정의 (기존과 동일)
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

// generateMetadata 함수: Props 타입을 직접 사용
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    // Fetch data needed for metadata if necessary, or use params directly
    // Example: Fetch content title
    // const supabase = createServerComponentClient({ cookies })
    // const { data: contentTitle } = await supabase.from('contents').select('title').eq('id', params.id).single()

    return {
        title: `Content ${params.id}`, // Use a default or fetched title
        // description: `Details for content item ${params.id}`, // Add description if needed
    }
}

// 페이지 컴포넌트: Props 타입을 직접 사용
export default async function Page({ params }: PageProps) {
    const supabase = createServerComponentClient({ cookies })

    // Use .then() approach correctly or await directly
    const { data: content, error } = await supabase
        .from('contents')
        .select('*')
        .eq('id', params.id)
        .single<{ data: Content | null, error: SupabaseError | null }>(); // Type assertion for the promise result if needed, but often better inferred

    // Handle potential Supabase errors
    if (error) {
        console.error('Error fetching content:', error.message)
        // Decide how to handle the error - show an error page or throw
        // For a server component, throwing might trigger an error boundary
        throw new Error(`Failed to fetch content: ${error.message}`);
        // Or you could use notFound() for specific error codes like 'PGRST116' (resource not found)
        // if (error.code === 'PGRST116') {
        //   notFound();
        // }
    }

    // Handle case where content is not found (but no error occurred)
    if (!content) {
        notFound()
    }

    // Render the detail component with the fetched content
    return <ContentDetail content={content} />
}

// REMOVED: The problematic global type declaration
/*
declare module 'next' {
    export interface PageProps {
        params: GeneratePageParams; // This was likely causing the conflict
        searchParams?: { [key: string]: string | string[] | undefined };
    }
}
*/