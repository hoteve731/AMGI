import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import ContentDetail from '@/components/ContentDetail'

// 타입 정의 방식 변경
interface PageProps {
    params: { id: string }
}

// generateMetadata 함수 추가 (필요한 경우)
export async function generateMetadata({ params }: PageProps) {
    return {
        title: `Content ${params.id}`,
    }
}

// 페이지 컴포넌트
const Page = async ({ params }: PageProps) => {
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

export default Page 