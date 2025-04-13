'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useSWRConfig } from 'swr'
import LoadingOverlay from './LoadingOverlay'
import { motion, AnimatePresence } from 'framer-motion'

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
    additional_memory?: string
}

export default function ContentGroups({ content }: { content: ContentWithGroups }) {
    const router = useRouter()
    const { mutate } = useSWRConfig()
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    const [isDeletingContent, setIsDeletingContent] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isNavigating, setIsNavigating] = useState(false)
    const [showAdditionalMemory, setShowAdditionalMemory] = useState(false)

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

    const handleGoBack = () => {
        setIsNavigating(true)
        router.push('/')
    }

    return (
        <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
            {(isLoading || isDeleting || isDeletingContent || isNavigating) && <LoadingOverlay />}
            <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] h-12 z-50">
                <button
                    onClick={handleGoBack}
                    className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center text-gray-600 hover:text-gray-900 transition-all duration-200 group"
                >
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="ml-2 font-medium group-hover:font-semibold transition-all duration-200">홈</span>
                </button>
                <button
                    onClick={handleDeleteContent}
                    disabled={isDeletingContent}
                    className="absolute right-4 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-[#8B4513]/60 backdrop-blur-md text-white rounded-full flex items-center hover:bg-red-500/90 transition-colors disabled:opacity-50"
                >
                    {isDeletingContent ? (
                        <div className="flex space-x-1">
                            {[0, 1, 2, 3, 4].map((i) => (
                                <motion.div
                                    key={i}
                                    className="w-1.5 h-1.5 bg-white rounded-full"
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
                        <>
                            <svg className="w-5 h-5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span className="font-medium">전체 삭제</span>
                        </>
                    )}
                </button>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4">
                <div className="space-y-2 mb-8 mt-4">
                    <h1 className="text-3xl font-bold text-gray-800">{content.title}</h1>
                    <div className="text-sm text-gray-500">
                        {new Date(content.created_at).toLocaleDateString('ko-KR')} 시작
                    </div>
                </div>

                {content.additional_memory && (
                    <div className="flex flex-col mb-6">
                        <button
                            onClick={() => setShowAdditionalMemory(!showAdditionalMemory)}
                            className={`w-full bg-white/60 backdrop-blur-md rounded-xl p-4 flex items-center justify-between border border-white/20 ${showAdditionalMemory ? 'rounded-b-none border-b-0' : ''}`}
                        >
                            <div className="flex items-center">
                                <svg
                                    className={`w-5 h-5 text-gray-600 transition-transform mr-2 ${showAdditionalMemory ? 'transform rotate-90' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 5l7 7-7 7"
                                    />
                                </svg>
                                <span className="text-lg font-medium text-gray-800">특별히 기억하고 싶은 내용</span>
                            </div>
                            <div></div>
                        </button>

                        <AnimatePresence>
                            {showAdditionalMemory && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="overflow-hidden"
                                >
                                    <div className="bg-white/40 backdrop-blur-md rounded-xl rounded-t-none p-4 border border-white/20 border-t-0">
                                        <p className="text-gray-600 text-sm whitespace-pre-wrap">{content.additional_memory}</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-gray-700 mt-2">학습 그룹</h2>
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
                                        onClick={(e) => {
                                            // 클릭 시 로딩 상태 설정
                                            setIsLoading(true);
                                            // 선택한 그룹 ID를 localStorage에 저장
                                            localStorage.setItem(`content_${content.id}_selected_group`, group.id.toString());
                                        }}
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