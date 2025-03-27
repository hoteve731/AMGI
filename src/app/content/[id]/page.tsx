import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import ContentDetail from '@/components/ContentDetail'
import { Metadata } from 'next'

// 타입 정의
type PageParams = {
    id: string
}

type Props = {
    params: PageParams
    searchParams: { [key: string]: string | string[] | undefined }
}

export default async function Page({ params }: Props) {
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    return {
        title: `Content ${params.id}`,
    }
} 