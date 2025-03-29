'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import ConfirmModal from './ConfirmModal'
import Link from 'next/link'

type Content = {
    id: string
    title: string
    created_at: string
    original_text: string
    chunks: Array<{ summary: string }>
}

export default function ContentDetail({ content }: { content: Content }) {
    const [showOriginal, setShowOriginal] = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const router = useRouter()
    const supabase = createClientComponentClient()

    const handleDelete = async () => {
        if (isDeleting) return

        try {
            setIsDeleting(true)

            // 현재 인증된 사용자 확인
            const { data: { user }, error: authError } = await supabase.auth.getUser()

            if (authError || !user) {
                throw new Error('인증되지 않은 사용자입니다.')
            }

            // 삭제 요청
            const { error: deleteError } = await supabase
                .from('contents')
                .delete()
                .match({
                    id: content.id,
                    user_id: user.id  // 현재 사용자의 콘텐츠만 삭제 가능
                })

            if (deleteError) {
                throw deleteError
            }

            setShowDeleteModal(false)
            alert('콘텐츠가 삭제되었습니다.')

            router.push('/')
            router.refresh()
        } catch (error) {
            console.error('삭제 중 오류 발생:', error)
            alert(error instanceof Error ? error.message : '콘텐츠 삭제 중 오류가 발생했습니다.')
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <main className="flex min-h-screen flex-col">
            <div className="sticky top-0 bg-white border-b p-4">
                <button
                    onClick={() => router.back()}
                    className="absolute left-4 top-1/2 -translate-y-1/2"
                >
                    ←
                </button>
                <h1 className="text-center text-lg font-bold">{content.title}</h1>
                <button
                    onClick={() => setShowDeleteModal(true)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500 hover:text-red-600"
                    disabled={isDeleting}
                >
                    {isDeleting ? '삭제중...' : '🗑️'}
                </button>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4">
                <div className="text-sm text-gray-500 mb-6">
                    {new Date(content.created_at).toLocaleDateString('ko-KR')} 암기 시작
                </div>
                <div className="space-y-4">
                    {content.chunks.map((chunk, index) => (
                        <div key={index} className="p-4 bg-gray-50 rounded-lg">
                            <p>{chunk.summary}</p>
                        </div>
                    ))}
                </div>
                <button
                    onClick={() => setShowOriginal(true)}
                    className="mt-4 text-sm text-gray-500 hover:text-gray-700"
                >
                    원본 텍스트 보기 →
                </button>
            </div>

            <div className="sticky bottom-0 p-4 bg-white border-t">
                <Link
                    href={`/content/${content.id}/learning`}
                    className="block w-full py-4 bg-black text-white text-center rounded-full font-medium hover:bg-gray-900 transition-colors"
                >
                    지금 암기하기
                </Link>
            </div>

            {showOriginal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
                    <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold">원본 텍스트</h3>
                            <button onClick={() => setShowOriginal(false)}>✕</button>
                        </div>
                        <p className="whitespace-pre-wrap">{content.original_text}</p>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={handleDelete}
                title="콘텐츠 삭제"
                message="정말로 이 콘텐츠를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
                confirmText={isDeleting ? "삭제중..." : "삭제"}
                cancelText="취소"
            />
        </main>
    )
} 