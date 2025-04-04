'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useSWRConfig } from 'swr'
import LoadingOverlay from './LoadingOverlay'
import { motion } from 'framer-motion'

type ContentGroup = {
    id: string
    title: string
    chunks_count: number
}

type ContentWithGroups = {
    id: string
    title: string
    created_at: string
    status: 'studying' | 'completed' | 'paused'
    groups: ContentGroup[]
}

export default function ContentGroups({ content }: { content: ContentWithGroups }) {
    const router = useRouter()
    const { mutate } = useSWRConfig()
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    const [isDeletingContent, setIsDeletingContent] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const handleDelete = async (groupId: string) => {
        if (!confirm('정말로 이 그룹을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
            return
        }

        setIsDeleting(groupId)
        try {
            const response = await fetch('/api/groups', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: groupId }),
            })

            if (!response.ok) {
                throw new Error('그룹 삭제 중 오류가 발생했습니다.')
            }

            // SWR 캐시 업데이트
            mutate('/api/contents')
            router.refresh()
        } catch (error) {
            console.error('그룹 삭제 중 오류:', error)
            alert('그룹 삭제 중 오류가 발생했습니다.')
        } finally {
            setIsDeleting(null)
        }
    }

    const handleDeleteContent = async () => {
        if (!confirm('정말로 이 콘텐츠를 삭제하시겠습니까? 모든 그룹과 기억 카드가 삭제되며, 이 작업은 되돌릴 수 없습니다.')) {
            return
        }

        setIsDeletingContent(true)
        try {
            const response = await fetch('/api/contents', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: content.id }),
            })

            if (!response.ok) {
                throw new Error('콘텐츠 삭제 중 오류가 발생했습니다.')
            }

            // SWR 캐시 업데이트
            mutate('/api/contents')

            // 홈으로 이동
            router.push('/')

            // 홈으로 이동한 후 새로고침
            setTimeout(() => {
                window.location.href = '/'
            }, 300)
        } catch (error) {
            console.error('콘텐츠 삭제 중 오류:', error)
            alert('콘텐츠 삭제 중 오류가 발생했습니다.')
        } finally {
            setIsDeletingContent(false)
        }
    }

    const handleGroupClick = (groupId: string) => {
        setIsLoading(true)
        router.push(`/content/${content.id}/groups/${groupId}`)
    }

    return (
        <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
            {isLoading && <LoadingOverlay />}
            <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] h-12 z-50">
                <button
                    onClick={() => router.back()}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <button
                    onClick={() => router.back()}
                    className="absolute left-10 top-1/2 -translate-y-1/2 text-gray-800 font-medium hover:text-gray-600"
                >
                    홈
                </button>
                <button
                    onClick={handleDeleteContent}
                    disabled={isDeletingContent}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                    {isDeletingContent ? (
                        <div className="flex space-x-1">
                            {[0, 1, 2, 3, 4].map((i) => (
                                <motion.div
                                    key={i}
                                    className="w-1.5 h-1.5 bg-[#7969F7] rounded-full"
                                    animate={{
                                        y: ["0%", "-100%"],
                                    }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 300,
                                        damping: 15,
                                        mass: 0.8,
                                        repeat: Infinity,
                                        repeatType: "reverse",
                                        delay: i * 0.1,
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    )}
                </button>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4">
                <div className="space-y-4 mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">{content.title}</h1>
                    <div className="text-sm text-gray-500">
                        {new Date(content.created_at).toLocaleDateString('ko-KR')} 시작
                    </div>
                </div>

                <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-gray-700">학습 그룹</h2>
                    <div className="grid grid-cols-2 gap-4">
                        {content.groups.map((group, index) => (
                            <div
                                key={group.id}
                                className="block relative transition-all duration-300 hover:scale-[1.02]"
                            >
                                <div className="
                                    flex flex-col
                                    p-4 
                                    bg-white/60
                                    backdrop-blur-md 
                                    rounded-xl
                                    shadow-lg
                                    border
                                    border-white/20
                                    hover:bg-white/70
                                    transition-colors
                                    [-webkit-backdrop-filter:blur(20px)]
                                    [backdrop-filter:blur(20px)]
                                ">
                                    <Link
                                        href={`/content/${content.id}/groups/${group.id}`}
                                        className="flex-1 flex flex-col"
                                        onClick={() => handleGroupClick(group.id)}
                                    >
                                        <h3 className="text-lg font-medium text-gray-800 mb-2">{group.title}</h3>
                                    </Link>
                                    <div className="flex items-center justify-between mt-2">
                                        <div className="flex items-center gap-1">
                                            <svg
                                                className="w-4 h-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                />
                                            </svg>
                                            <span className="text-gray-600">기억카드</span>
                                            <span className="text-gray-700 font-bold">{group.chunks_count}</span>
                                        </div>
                                        <button
                                            onClick={() => handleDelete(group.id)}
                                            disabled={isDeleting === group.id}
                                            className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                        >
                                            {isDeleting === group.id ? (
                                                <div className="relative w-6 h-6">
                                                    {[0, 1, 2, 3, 4].map((i) => (
                                                        <motion.div
                                                            key={i}
                                                            className="absolute w-1.5 h-1.5 bg-[#7969F7] rounded-full"
                                                            style={{
                                                                left: '50%',
                                                                top: '50%',
                                                                transform: 'translate(-50%, -50%)',
                                                            }}
                                                            animate={{
                                                                x: [
                                                                    '0px',
                                                                    `${Math.cos(i * (2 * Math.PI / 5)) * 12}px`,
                                                                    '0px'
                                                                ],
                                                                y: [
                                                                    '0px',
                                                                    `${Math.sin(i * (2 * Math.PI / 5)) * 12}px`,
                                                                    '0px'
                                                                ],
                                                            }}
                                                            transition={{
                                                                repeat: Infinity,
                                                                duration: 1.5,
                                                                delay: i * 0.1,
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    )
}