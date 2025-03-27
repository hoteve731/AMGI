// src/app/content/[id]/page.tsx
'use server'

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { PostgrestError } from '@supabase/supabase-js' // <-- Import the specific error type
import { cookies } from 'next/headers'
import ContentDetail from '@/components/ContentDetail' // <-- Verify this path is correct
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

// Define content types (Check these match your DB schema)
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

// generateMetadata function (keeping it concise, add fetch if needed)
export async function generateMetadata(
    { params }: { params: { id: string } }
): Promise<Metadata> {
     // Consider fetching the actual title here for better SEO
    return {
        title: `Content ${params.id}`,
    }
}

// Page component
export default async function Page(
    { params }: { params: { id: string } }
) {
    // Basic validation for the ID parameter
    if (!params || typeof params.id !== 'string' || params.id.trim() === '') {
        console.error("Invalid or missing ID parameter:", params);
        notFound();
    }
    const { id } = params;

    // Ensure Supabase environment variables are set in Vercel
    const supabase = createServerComponentClient({ cookies })

    let content: Content | null = null;
    // Use the specific PostgrestError type from Supabase
    let fetchError: PostgrestError | null = null; // <-- Use PostgrestError instead of any

    try {
        // Fetch data using Supabase client
        const { data, error } = await supabase
            .from('contents')
            .select('*')
            .eq('id', id)
            .returns<Content>()
            .single();

        content = data;
        fetchError = error; // Assign the error (which is PostgrestError | null)

    } catch (error: unknown) { // <-- Catch generic errors as 'unknown'
        // Handle totally unexpected errors during the fetch/network process
        console.error(`Unexpected error fetching content with ID ${id}:`, error);

        // Optionally, provide more context if it's an Error instance
        if (error instanceof Error) {
             throw new Error(`Failed to load content due to an unexpected issue: ${error.message}`);
        } else {
             // Throw a generic error if it's not an Error instance
             throw new Error("Failed to load content due to an unexpected non-error value.");
        }
        // Alternatively, could just call notFound() here for any unexpected error
        // notFound();
    }

    // Handle known Supabase errors (like item not found)
    if (fetchError) {
        console.error(`Supabase error fetching content ID ${id}:`, fetchError.message);
        // PostgREST error code 'PGRST116: Row Not Found' from .single()
        if (fetchError.code === 'PGRST116') {
             console.log(`Content with ID ${id} not found in database.`);
             notFound(); // Show 404 page
        } else {
             // For other database/Supabase errors, throwing allows Error Boundaries to catch
             console.error(`Unhandled Supabase error: Code=${fetchError.code}, Message=${fetchError.message}`);
             throw new Error(`Database error occurred while fetching content: ${fetchError.message} (Code: ${fetchError.code})`);
             // Or if you prefer to show 404 for all DB errors:
             // notFound();
        }
    }

    // Double-check: If no error occurred but content is still null (shouldn't happen with .single())
    if (!content) {
        console.warn(`Content with ID ${id} resulted in null data without a corresponding error.`);
        notFound();
    }

    // Render the component if content is successfully fetched
    return <ContentDetail content={content} />
}