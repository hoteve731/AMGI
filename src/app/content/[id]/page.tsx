// src/app/content/[id]/page.tsx
'use server'

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
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
    id: string // Ensure type matches DB (e.g., string for UUID, number for integer ID)
    title: string
    original_text: string
    chunks: Chunk[] // Assumes 'chunks' is a JSON/JSONB array of objects
    masked_chunks: MaskedChunk[] // Assumes 'masked_chunks' is a JSON/JSONB array of objects
    created_at: string // Or Date if you parse it
}

// REMOVED: The unused SupabaseError type definition
// type SupabaseError = { ... }

// generateMetadata function with explicit param typing
export async function generateMetadata(
    { params }: { params: { id: string } }
): Promise<Metadata> {
    // NOTE: For accurate metadata, you might fetch the specific content title here.
    // Requires another Supabase call, ensure env vars are available.
    // Example:
    // try {
    //   const supabase = createServerComponentClient({ cookies });
    //   const { data: metaContent } = await supabase.from('contents').select('title').eq('id', params.id).single();
    //   return { title: metaContent?.title || `Content ${params.id}` };
    // } catch (error) {
    //   console.error("Metadata fetch error:", error);
    //   return { title: `Content ${params.id}` }; // Fallback title
    // }

    // Using placeholder for simplicity:
    return {
        title: `Content ${params.id}`,
        // description: `Details for content ${params.id}` // Add description if desired
    }
}

// Page component with explicit param typing
export default async function Page(
    { params }: { params: { id: string } }
) {
    // Basic validation for the ID parameter
    if (!params || typeof params.id !== 'string' || params.id.trim() === '') {
        console.error("Invalid or missing ID parameter:", params);
        notFound(); // ID is required and must be a non-empty string
    }
    const { id } = params;

    // IMPORTANT: Ensure Supabase environment variables are set in Vercel!
    // (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY)
    const supabase = createServerComponentClient({ cookies })

    let content: Content | null = null;
    let fetchError: any = null; // Use 'any' or PostgrestError from '@supabase/supabase-js' if installed directly

    try {
        const { data, error } = await supabase
            .from('contents')
            .select('*') // Select only necessary columns if possible for performance
            .eq('id', id)
            .returns<Content>() // Ensures data matches the Content type
            .single();          // Expects exactly one row or null

        content = data;
        fetchError = error;

    } catch (error) {
        // Catch unexpected errors during the fetch process itself
        console.error(`Unexpected error fetching content with ID ${id}:`, error);
        // Depending on policy, you might show a generic error page instead of 404
        // throw new Error("Failed to load content due to an unexpected issue.");
        notFound(); // Or trigger notFound for any fetch failure
    }


    // Handle Supabase specific errors (like item not found)
    if (fetchError) {
        console.error(`Supabase error fetching content ID ${id}:`, fetchError.message);
        // PostgREST error code 'PGRST116: Row Not Found'
        if (fetchError.code === 'PGRST116') {
             console.log(`Content with ID ${id} not found in database.`);
             notFound(); // Standard way to show 404
        } else {
             // For other database/Supabase errors, throwing might be better
             // to let Next.js Error Boundary handle it (if you have one)
             // Or display a generic error message component.
             // For now, we'll treat other DB errors as "not found" for simplicity,
             // but you might want a different behavior.
             console.warn(`Unhandled Supabase error code: ${fetchError.code}. Treating as Not Found.`);
             notFound();
             // Alternatively: throw new Error(`Database error: ${fetchError.message}`);
        }
    }

    // Handle case where query succeeded but returned no data (should be caught by single() error PGRST116)
    if (!content) {
        console.log(`Content with ID ${id} was not found (data is null).`);
        notFound();
    }

    // If we reach here, content should be valid
    // Ensure ContentDetail can handle the 'content' prop correctly
    return <ContentDetail content={content} />
}