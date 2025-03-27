import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import ContentDetail from '@/components/ContentDetail'

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

// 페이지 컴포넌트
export default async function Page(props: GeneratePageProps) {
    const { params } = props
    const supabase = createServerComponentClient({ cookies })

    const { data: content, error } = await supabase
        .from('contents')
        .select('*')
        .eq('id', params.id)
        .single()

    if (error) {
        throw new Error(error.message)
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