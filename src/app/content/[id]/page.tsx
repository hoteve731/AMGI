import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import ContentDetail from '@/components/ContentDetail'

export default async function ContentPage({ params }: { params: { id: string } }) {
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