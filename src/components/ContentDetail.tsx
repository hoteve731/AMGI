'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'
import { useSWRConfig } from 'swr'

type ContentGroup = {
    id: string
    content_id: string
    title: string
    original_text: string
    chunks: Array<{ summary: string, masked_text: string }>
}

type Content = {
    id: string
    title: string
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

export default function ContentDetail({
    group,
    content
}: {
    group: ContentGroup,
    content: Content
}) {
    const [showOriginal, setShowOriginal] = useState(false)
    const [contentStatus, setContentStatus] = useState(content.status)
    const router = useRouter()
    const supabase = createClientComponentClient()
    const { mutate } = useSWRConfig()

    const handleStatusChange = async (newStatus: Content['status']) => {
        try {
            const response = await fetch('/api/contents', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: content.id,
                    status: newStatus
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '상태 업데이트 중 오류가 발생했습니다');
            }

            setContentStatus(newStatus);
            mutate('/api/contents');
            router.refresh();
        } catch (error) {
            console.error('상태 업데이트 중 오류:', error);
            alert('상태 업데이트 중 오류가 발생했습니다.');
        }
    };

    return (
        <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
            <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] h-12">
                <button
                    onClick={() => router.back()}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4">
                <div className="space-y-4 mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">{group.title}</h1>
                    <div className="text-sm text-gray-500">
                        {group.chunks.length}개의 청크로 구성됨
                    </div>
                    <div className="relative inline-block">
                        <select
                            value={contentStatus}
                            onChange={(e) => handleStatusChange(e.target.value as Content['status'])}
                            className={`
                                appearance-none
                                pl-7 pr-4 py-1.5
                                rounded-full
                                text-sm
                                font-medium
                                ${statusStyles[contentStatus].bg}
                                ${statusStyles[contentStatus].text}
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
                                ${statusStyles[contentStatus].dot}
                            `}
                        />
                    </div>
                </div>

                <div className="mb-8">
                    <button
                        onClick={() => setShowOriginal(!showOriginal)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                        {showOriginal ? '원문 숨기기' : '원문 보기'}
                    </button>

                    {showOriginal && (
                        <div className="mt-4 p-4 bg-white/70 backdrop-blur-md rounded-xl border border-white/20">
                            <h3 className="text-lg font-medium text-gray-800 mb-2">원문</h3>
                            <p className="text-gray-700 whitespace-pre-wrap">{group.original_text}</p>
                        </div>
                    )}
                </div>

                <div className="space-y-0 relative">
                    {group.chunks.map((chunk, index) => (
                        <div
                            key={index}
                            className="relative pl-8 mb-6"
                            style={{
                                marginTop: index === 0 ? '0' : '-4px',
                            }}
                        >
                            {/* 연결 선 */}
                            {index < group.chunks.length - 1 && (
                                <div
                                    className="absolute left-[7px] top-[40px] h-[calc(100%_+_12px)] w-1 bg-white/70"
                                    style={{
                                        background: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.3) 100%)'
                                    }}
                                />
                            )}

                            {/* 원 */}
                            <div
                                className="absolute left-0 top-[18px] w-[15px] h-[15px] rounded-full bg-white border-2 border-[#D4C4B7]"
                            />

                            {/* 카드 */}
                            <div
                                className="
                                    p-4 
                                    bg-white/60
                                    backdrop-blur-md 
                                    rounded-xl
                                    shadow-sm
                                    border
                                    border-white/20
                                    [-webkit-backdrop-filter:blur(20px)]
                                    [backdrop-filter:blur(20px)]
                                "
                            >
                                <p className="text-gray-800">{chunk.summary}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-8 mb-4">
                    <Link
                        href={`/content/${content.id}/group/${group.id}/learning`}
                        className="w-full block text-center py-3 px-4 rounded-lg bg-[#DDCFFD] text-white font-medium hover:bg-opacity-90 transition-colors"
                    >
                        학습 시작하기
                    </Link>
                </div>
            </div>
        </main>
    )
}