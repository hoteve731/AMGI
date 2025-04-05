'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
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
    chunks_count?: number
    isProcessing?: boolean
    isManuallyPaused?: boolean
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
    const [processedContents, setProcessedContents] = useState<Content[]>([])
    const [processingContentIds, setProcessingContentIds] = useState<string[]>([])
    const router = useRouter()
    const supabase = createClientComponentClient()
    const { mutate: localMutate } = useSWRConfig()

    // 콘텐츠 처리 상태 설정
    useEffect(() => {
        if (!contents || contents.length === 0) return;

        const processContents = () => {
            const contentsCopy = [...contents];
            const newProcessingIds: string[] = [];

            // 각 콘텐츠에 그룹 수에 따라 처리 상태 설정
            for (const content of contentsCopy) {
                const index = contentsCopy.findIndex(c => c.id === content.id);
                if (index !== -1) {
                    // 'paused' 상태이면서 그룹이 없거나 청크가 없으면 처리 중으로 간주
                    const hasNoGroups = !content.groups_count || content.groups_count === 0;
                    const hasNoChunks = !content.chunks_count || content.chunks_count === 0;
                    const isProcessing = content.status === 'paused' && (hasNoGroups || hasNoChunks);

                    contentsCopy[index].isProcessing = isProcessing;

                    // 처리 중인 콘텐츠 ID 저장
                    if (isProcessing) {
                        newProcessingIds.push(content.id);
                    }
                }
            }

            setProcessedContents(contentsCopy);
            setProcessingContentIds(newProcessingIds);
        };

        processContents();
    }, [contents]);

    // 처리 중인 콘텐츠의 상태 확인
    const checkContentStatus = useCallback(async () => {
        let needsRefresh = false;

        for (const contentId of processingContentIds) {
            try {
                const response = await fetch(`/content/${contentId}/status`);
                if (!response.ok) continue;

                const data = await response.json();

                // studying 상태로 변경되었으면 처리 완료로 간주
                if (data.status === 'studying') {
                    needsRefresh = true;
                }
            } catch (error) {
                console.error('콘텐츠 상태 확인 중 오류:', error);
            }
        }

        // 상태 변경이 감지되면 콘텐츠 목록 새로고침
        if (needsRefresh) {
            if (externalMutate) {
                externalMutate();
            } else {
                localMutate('/api/contents');
            }
        }
    }, [processingContentIds, externalMutate, localMutate]);

    useEffect(() => {
        if (processingContentIds.length === 0) return;

        let checkTimeout: NodeJS.Timeout;

        // 최초 실행
        checkContentStatus();

        // 3초 후 다시 확인
        const intervalId = setInterval(() => {
            checkContentStatus();
        }, 3000);

        // 클린업 함수
        return () => {
            clearInterval(intervalId);
        };
    }, [processingContentIds.length, checkContentStatus]);

    const handleStatusChange = async (contentId: string, newStatus: Content['status']) => {
        if (isStatusChanging) return

        try {
            setIsStatusChanging(true)

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

    const displayContents = processedContents.length > 0 ? processedContents : contents;

    return (
        <div className="flex-1 overflow-y-auto p-4 pb-[120px] relative">
            {isLoading && <LoadingOverlay />}
            <div className="space-y-5">
                {displayContents.map((content, index) => (
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
                        <div className={`
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
                            ${content.isProcessing ? 'opacity-70' : ''}
                        `}>
                            <div className="flex items-center justify-between">
                                {content.isProcessing ? (
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-lg font-medium text-gray-800">
                                                {content.title}
                                            </h2>
                                            <div className="flex items-center ml-2">
                                                <div className="relative w-5 h-5">
                                                    {[0, 1, 2].map((i) => (
                                                        <motion.div
                                                            key={i}
                                                            className="absolute w-1.5 h-1.5 bg-[#7969F7] rounded-full"
                                                            style={{
                                                                top: '50%',
                                                                left: '50%',
                                                                x: `calc(${Math.cos(2 * Math.PI * i / 3) * 6}px - 50%)`,
                                                                y: `calc(${Math.sin(2 * Math.PI * i / 3) * 6}px - 50%)`,
                                                            }}
                                                            animate={{
                                                                scale: [1, 1.5, 1],
                                                            }}
                                                            transition={{
                                                                duration: 1,
                                                                repeat: Infinity,
                                                                delay: i * 0.2,
                                                                ease: 'easeInOut',
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                                <span className="ml-2 text-sm text-[#7969F7]">처리 중...</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className="flex-1 cursor-pointer"
                                        onClick={() => handleContentClick(content.id)}
                                    >
                                        <h2 className="text-lg font-medium text-gray-800">
                                            {content.title}
                                        </h2>
                                    </div>
                                )}
                            </div>

                            {!content.isProcessing ? (
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
                                            <span className="font-medium text-gray-800">{content.groups_count || 0}</span>
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
                            ) : null}
                        </div>
                    </motion.div>
                ))}

                {displayContents.length === 0 && (
                    <div className="text-center py-10">
                        <p className="text-gray-500">No contents here 😄</p>
                    </div>
                )}
            </div>
        </div>
    )
}