'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useSWRConfig } from 'swr'
import { useRouter } from 'next/navigation'
import LoadingOverlay from './LoadingOverlay'
import { motion } from 'framer-motion'

type Content = {
    id: string
    title: string
    created_at: string
    status: 'studying' | 'completed' | 'paused'
    groups_count?: number
}

const statusStyles = {
    studying: {
        bg: 'bg-blue-100',
        text: 'text-blue-800',
        dot: 'bg-blue-500',
    },
    completed: {
        bg: 'bg-green-100',
        text: 'text-green-800',
        dot: 'bg-green-500',
    },
    paused: {
        bg: 'bg-gray-100',
        text: 'text-gray-800',
        dot: 'bg-gray-500',
    },
}

type ContentListProps = {
    contents: Content[]
    showTabs?: boolean
    mutate?: () => void
}

export default function ContentList({ contents, showTabs = false, mutate: externalMutate }: ContentListProps) {
    const [isStatusChanging, setIsStatusChanging] = useState(false)
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()
    const supabase = createClientComponentClient()
    const { mutate: localMutate } = useSWRConfig()

    const handleStatusChange = async (contentId: string, newStatus: Content['status']) => {
        if (isStatusChanging) return

        try {
            setIsStatusChanging(true)

            // API를 통한 상태 업데이트
            const response = await fetch('/api/contents', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: contentId,
                    status: newStatus,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || '상태 업데이트 중 오류가 발생했습니다.');
            }

            // 전역 상태 리프레시
            if (externalMutate) {
                externalMutate();
            } else {
                localMutate('/api/contents');
            }
        } catch (error) {
            console.error('상태 업데이트 중 오류:', error);
            alert(error instanceof Error ? error.message : '상태 업데이트 중 오류가 발생했습니다.');
        } finally {
            setIsStatusChanging(false);
        }
    };

    const handleContentClick = (contentId: string) => {
        setIsLoading(true)
        router.push(`/content/${contentId}/groups`)
    }

    return (
        <div className="flex-1 overflow-y-auto p-4 relative">
            {isLoading && <LoadingOverlay />}
            <div className="space-y-5">
                {contents.map((content, index) => (
                    <motion.div
                        key={content.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{
                            duration: 0.3,
                            delay: index * 0.05,
                            ease: [0.25, 0.1, 0.25, 1.0]
                        }}
                        className="block relative hover:scale-[1.02] transition-transform duration-200"
                    >
                        <div className="
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
                            <div className="flex items-center justify-between">
                                <div
                                    onClick={() => handleContentClick(content.id)}
                                    className="flex-1 cursor-pointer"
                                >
                                    <h2 className="text-lg font-medium text-gray-800 hover:text-blue-600 transition-colors">
                                        {content.title}
                                    </h2>
                                </div>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center gap-3 text-sm text-gray-500">
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
                                                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                                            />
                                        </svg>
                                        <span className="text-gray-600">그룹</span>
                                        <span className="text-gray-700 font-bold">{content.groups_count || 0}</span>
                                    </div>
                                    <div>
                                        {new Date(content.created_at).toLocaleDateString('ko-KR')} 시작
                                    </div>
                                </div>
                                <div className="relative inline-block">
                                    <select
                                        data-content-id={content.id}
                                        value={content.status}
                                        onChange={(e) => handleStatusChange(content.id, e.target.value as Content['status'])}
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
                                        `}
                                        disabled={isStatusChanging}
                                    >
                                        <option value="studying">Looping</option>
                                        <option value="completed">Completed</option>
                                        <option value="paused">Paused</option>
                                    </select>
                                    <div
                                        className={`
                                            absolute 
                                            left-2 
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
                        </div>
                    </motion.div>
                ))}

                {contents.length === 0 && (
                    <div className="text-center py-10">
                        <p className="text-gray-500">No contents here 😄</p>
                    </div>
                )}
            </div>
        </div>
    )
}