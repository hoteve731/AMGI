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
    status: 'studying' | 'completed' | 'paused'
}

const statusStyles = {
    studying: {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        dot: 'bg-blue-500',
        label: '진행 중'
    },
    completed: {
        bg: 'bg-green-100',
        text: 'text-green-700',
        dot: 'bg-green-500',
        label: '완료'
    },
    paused: {
        bg: 'bg-gray-100',
        text: 'text-gray-700',
        dot: 'bg-gray-500',
        label: '시작 전'
    }
}

export default function ContentDetail({ content: initialContent }: { content: Content }) {
    const [content, setContent] = useState(initialContent)
    const [showOriginal, setShowOriginal] = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const router = useRouter()
    const supabase = createClientComponentClient()

    const handleStatusChange = async (newStatus: Content['status']) => {
        try {
            const { data, error } = await supabase
                .from('contents')
                .update({ status: newStatus })
                .eq('id', content.id)
                .select()

            if (error) {
                console.error('Supabase error:', error)
                throw new Error(error.message)
            }

            if (!data || data.length === 0) {
                throw new Error('상태 업데이트 후 데이터를 받지 못했습니다')
            }

            setContent(prev => ({ ...prev, status: newStatus }))
            router.refresh()

        } catch (error) {
            console.error('상태 업데이트 중 오류:', error)
            alert('상태 업데이트 중 오류가 발생했습니다.')
        }
    }

    // ContentDetail.tsx의 handleDelete 함수 부분을 이렇게 수정하세요
const handleDelete = async () => {
    if (isDeleting) return

    try {
        setIsDeleting(true)
        console.log('Starting deletion for content ID:', content.id)

        // API를 통해 삭제 요청
        const response = await fetch(`/api/contents?id=${content.id}`, {
            method: 'DELETE',
        });

        const result = await response.json();
        console.log('Delete API response:', result);

        if (!response.ok) {
            throw new Error(result.error || '콘텐츠 삭제 중 오류가 발생했습니다.');
        }

        setShowDeleteModal(false)
        alert('콘텐츠가 삭제되었습니다.')

        // 홈으로 리다이렉트
        router.push('/')
        
        // 리다이렉트 완료 후 리프레시를 위해 타이머 시간 늘림
        setTimeout(() => {
            router.refresh()
        }, 300)
    } catch (error) {
        console.error('삭제 중 오류 발생:', error)
        alert(error instanceof Error ? error.message : '콘텐츠 삭제 중 오류가 발생했습니다.')
    } finally {
        setIsDeleting(false)
    }
}

    return (
        <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
            <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] p-4">
                <button
                    onClick={() => router.back()}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800"
                >
                    ←
                </button>
                <button
                    onClick={() => setShowDeleteModal(true)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500 hover:text-red-600"
                    disabled={isDeleting}
                >
                    {isDeleting ? '삭제중...' : '🗑️'}
                </button>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4">
                <div className="space-y-4 mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">{content.title}</h1>
                    <div className="text-sm text-gray-500">
                        {new Date(content.created_at).toLocaleDateString('ko-KR')} 암기 시작
                    </div>
                    <div className="relative inline-block">
                        <select
                            value={content.status}
                            onChange={(e) => handleStatusChange(e.target.value as Content['status'])}
                            className={`
                                appearance-none
                                pl-7 pr-4 py-1.5
                                rounded-full
                                text-sm
                                font-medium
                                ${statusStyles[content.status].bg}
                                ${statusStyles[content.status].text}
                                transition-colors
                                border-0
                                focus:outline-none
                                focus:ring-2
                                focus:ring-offset-2
                                focus:ring-blue-500
                                whitespace-nowrap
                                cursor-pointer
                            `}
                        >
                            <option value="studying">진행 중</option>
                            <option value="completed">완료</option>
                            <option value="paused">시작 전</option>
                        </select>
                        <div
                            className={`
                                absolute 
                                left-3 
                                top-1/2 
                                -translate-y-1/2 
                                w-2 
                                h-2 
                                rounded-full 
                                ${statusStyles[content.status].dot}
                            `}
                        />
                    </div>
                </div>

                <div className="space-y-0 relative">
                    {content.chunks.map((chunk, index) => (
                        <div
                            key={index}
                            className="relative pl-8 mb-6"
                            style={{
                                marginTop: index === 0 ? '0' : '-4px',
                            }}
                        >
                            {/* 연결 선 */}
                            {index < content.chunks.length - 1 && (
                                <div
                                    className="absolute left-[7px] top-[40px] h-[calc(100%_+_12px)] w-1 bg-white/70"
                                    style={{
                                        background: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.3) 100%)'
                                    }}
                                />
                            )}
                            {/* 원형 포인트 */}
                            <div className="absolute left-[3px] top-[32px] w-3 h-3 rounded-full bg-white z-10" />
                            {/* 콘텐츠 카드 */}
                            <div className="
                                relative
                                p-6
                                bg-white/60 
                                backdrop-blur-md 
                                rounded-xl 
                                border 
                                border-white/30
                                hover:bg-white/70 
                                transition-colors
                                z-20
                            ">
                                <p className="text-gray-800 leading-relaxed">{chunk.summary}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    onClick={() => setShowOriginal(true)}
                    className="mt-8 text-sm text-gray-500 hover:text-gray-700 text-center w-full"
                >
                    원본 텍스트 보기
                </button>
            </div>

            <div className="sticky bottom-0 p-4 bg-[#F8F4EF] border-t border-[#D4C4B7]">
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