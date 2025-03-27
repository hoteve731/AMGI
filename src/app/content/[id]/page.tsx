import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import ContentDetail from '@/components/ContentDetail'
import { Metadata } from 'next'

interface PageProps {
    params: {
        id: string
    }
    searchParams?: { [key: string]: string | string[] | undefined }
}

export default async function Page({ params }: PageProps) {
    const supabase = createServerComponentClient({ cookies })

    const { data: content } = await supabase
        .from('contents')
        .select('*')
        .eq('id', params.id)
        .single()

    if (!content) {
        notFound()
    }

    return <ContentDetail content={content} />
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    return {
        title: `Content ${params.id}`,
    }
} 