import { Metadata } from 'next'
import SnippetList from '@/components/SnippetList'

export const metadata: Metadata = {
    title: '내 스니펫 | AMGI',
    description: '마크다운 헤더에서 생성한 스니펫 목록을 관리합니다.',
}

export default function SnippetsPage() {
    return (
        <main className="min-h-screen bg-gray-50 py-8">
            <SnippetList />
        </main>
    )
}
