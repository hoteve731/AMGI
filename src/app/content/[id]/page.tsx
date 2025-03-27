// src/app/content/[id]/page.tsx
'use server'

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import ContentDetail from '@/components/ContentDetail' // Make sure this path is correct
import { notFound } from 'next/navigation'
import type { Metadata } from 'next' // Import Metadata type

// Define content types (keep these as they describe your data)
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
    details?: string | null
    hint?: string | null
}

// generateMetadata function with explicit param typing
export async function generateMetadata(
    { params }: { params: { id: string } } // Type params directly
): Promise<Metadata> {
    // You might want to fetch the actual title here if needed
    // const supabase = createServerComponentClient({ cookies });
    // const { data } = await supabase.from('contents').select('title').eq('id', params.id).single();
    return {
        title: `Content ${params.id}`, // Placeholder title
        // description: `Details for content ${params.id}`
    }
}

// Page component with explicit param typing
export default async function Page(
    { params }: { params: { id: string } } // Type params directly here too
) {
    // Validate ID early if necessary
    if (!params || typeof params.id !== 'string') {
        console.error("Invalid params received in Page:", params);
        notFound(); // Or throw an error
    }
    const { id } = params;

    const supabase = createServerComponentClient({ cookies })

    // Fetch content - ensuring type safety with Supabase call
    // Use .single() which returns { data: T | null, error: PostgrestError | null }
    const { data: content, error } = await supabase
        .from('contents')
        .select('*') // Select all columns or specify necessary ones
        .eq('id', id)
        .returns<Content>() // Specify the expected return type for better type checking
        .single()           // Fetches a single row

    // Robust error handling
    if (error) {
        console.error(`Error fetching content with ID ${id}:`, error.message)
        // If the error indicates the item wasn't found (e.g., PostgREST error code PGRST116)
        if (error.code === 'PGRST116') {
             console.log(`Content with ID ${id} not found.`);
             notFound(); // Trigger 404 page
        } else {
             // For other database errors, you might want to throw to trigger an error boundary
             throw new Error(`Database error: ${error.message} (Code: ${error.code})`);
        }
    }

    // Handle the case where data is null even without an error (should be caught by .single() error usually)
    if (!content) {
        console.log(`Content with ID ${id} resulted in null data unexpectedly.`);
        notFound();
    }

    return <ContentDetail content={content} />
}