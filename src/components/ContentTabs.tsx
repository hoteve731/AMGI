import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import ContentList from '@/components/ContentList'

export default async function ContentTabs() {
    const supabase = createServerComponentClient({ cookies })

    const { data: contents } = await supabase
        .from('contents')
        .select('id, title, created_at, status, chunks')
        .order('created_at', { ascending: false })

    return <ContentList contents={contents || []} />
} 