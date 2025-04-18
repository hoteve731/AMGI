'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useSWRConfig } from 'swr'
import { useRouter } from 'next/navigation'
import LoadingOverlay from './LoadingOverlay'
import { motion } from 'framer-motion'
import useSWR from 'swr'
import { FolderIcon, Squares2X2Icon } from '@heroicons/react/24/outline'

type Content = {
    id: string
    title: string
    created_at: string
    groups_count?: number
    chunks_count?: number
    isProcessing?: boolean
    group_names?: string[]
}

type ContentListProps = {
    contents?: Content[]
    showTabs?: boolean
    mutate?: () => void
}

// API fetcher
const fetcher = async (url: string) => {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error('데이터를 불러오는데 실패했습니다.')
    }
    return response.json()
}

export default function ContentList({ contents: externalContents, showTabs = false, mutate: externalMutate }: ContentListProps) {
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [processedContents, setProcessedContents] = useState<Content[]>([])
    const [processingContentIds, setProcessingContentIds] = useState<string[]>([])
    const router = useRouter()
    const supabase = createClientComponentClient()
    const { mutate: localMutate } = useSWRConfig()

    // 외부에서 제공된 콘텐츠가 없을 경우 SWR로 데이터 가져오기
    const { data, error, isLoading: isFetching, mutate } = useSWR<{ contents: Content[] }>(
        !externalContents ? '/api/contents' : null,
        fetcher,
        {
            refreshInterval: 0,
            revalidateOnFocus: true,
            revalidateOnReconnect: true,
            dedupingInterval: 5000,
        }
    )

    // 실제 사용할 콘텐츠 데이터 결정
    const contentsToProcess = externalContents || data?.contents || []

    // 콘텐츠 처리 상태 설정
    useEffect(() => {
        if (contentsToProcess.length === 0) return;

        const processContents = () => {
            const contentsCopy = [...contentsToProcess];
            const newProcessingIds: string[] = [];

            // 각 콘텐츠에 그룹 수에 따라 처리 상태 설정
            for (const content of contentsCopy) {
                const index = contentsCopy.findIndex(c => c.id === content.id);
                if (index !== -1) {
                    // 그룹이 없거나 청크가 없으면 처리 중으로 간주
                    const hasNoGroups = !content.groups_count || content.groups_count === 0;
                    const hasNoChunks = !content.chunks_count || content.chunks_count === 0;
                    const isProcessing = hasNoGroups || hasNoChunks;

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
    }, [contentsToProcess]);

    // 처리 중인 콘텐츠의 상태 확인
    const checkContentStatus = useCallback(async () => {
        let needsRefresh = false;

        for (const contentId of processingContentIds) {
            try {
                const response = await fetch(`/content/${contentId}/status`);
                if (!response.ok) continue;

                const data = await response.json();

                // 그룹과 청크가 생성되었는지 확인
                if (data.groupsGenerated && data.chunksGenerated) {
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
            } else if (mutate) {
                mutate();
            } else {
                localMutate('/api/contents');
            }
        }
    }, [processingContentIds, externalMutate, mutate, localMutate]);

    useEffect(() => {
        if (processingContentIds.length === 0) return;

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

    const handleContentClick = async (contentId: string) => {
        setIsLoading(true)
        try {
            // 그룹 리스트 페이지로 이동
            router.push(`/content/${contentId}/groups`)
        } catch (error) {
            console.error('페이지 이동 중 오류 발생:', error)
            setIsLoading(false)
        }
    }

    const displayContents = processedContents.length > 0 ? processedContents : contentsToProcess;

    return (
        <div className="flex-1 overflow-y-auto p-4 pt-5 pb-[120px] relative">
            {isLoading && <LoadingOverlay />}
            {isFetching && (
                <div className="flex items-center justify-center h-64">
                    <div className="relative w-10 h-10">
                        {[0, 1, 2, 3, 4].map((i) => (
                            <motion.div
                                key={i}
                                className="absolute w-2 h-2 bg-[#7969F7] rounded-full"
                                style={{
                                    left: '50%',
                                    top: '50%',
                                    transform: 'translate(-50%, -50%)',
                                }}
                                animate={{
                                    x: [
                                        '0px',
                                        `${Math.cos(i * (2 * Math.PI / 5)) * 16}px`,
                                        '0px'
                                    ],
                                    y: [
                                        '0px',
                                        `${Math.sin(i * (2 * Math.PI / 5)) * 16}px`,
                                        '0px'
                                    ],
                                }}
                                transition={{
                                    duration: 1.2,
                                    repeat: Infinity,
                                    delay: i * 0.1,
                                    ease: [0.4, 0, 0.2, 1],
                                    times: [0, 0.5, 1]
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}
            {error && (
                <div className="text-center p-8 text-red-500">
                    <p>데이터를 불러오는 중 오류가 발생했습니다.</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-4 px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
                    >
                        새로고침
                    </button>
                </div>
            )}
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
                        className={`
                            bg-white/80 rounded-[16px] shadow-lg/60 overflow-hidden
                            hover:bg-white/90 backdrop-blur-sm
                            transition-all duration-200 active:scale-[0.98]
                        `}
                    >
                        <div className="p-5">
                            <div className="flex justify-between items-start">
                                {content.isProcessing ? (
                                    <div className="flex-1">
                                        <h2 className="text-xl font-bold text-gray-800">
                                            {content.title}
                                        </h2>
                                        <div className="mt-2">
                                            <div className="flex items-center justify-start">
                                                <div className="flex">
                                                    {[0, 1, 2].map((i) => (
                                                        <motion.div
                                                            key={i}
                                                            className="w-2 h-2 rounded-full bg-[#7969F7] mx-0.5"
                                                            animate={{
                                                                opacity: [0.4, 1, 0.4],
                                                                y: ['0px', '-4px', '0px']
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
                                        <h2 className="text-xl font-bold text-gray-800">
                                            {content.title}
                                        </h2>

                                        {content.group_names && content.group_names.length > 0 && (
                                            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                                {content.group_names.join(', ')}
                                            </p>
                                        )}

                                        <div className="flex items-center mt-3 space-x-4">
                                            <div className="flex items-center gap-1">
                                                <FolderIcon className="w-4 h-4 text-[#7969F7]" />
                                                <span className="text-sm text-gray-600">그룹</span>
                                                <span className="text-sm font-medium text-gray-800">{content.groups_count || 0}</span>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <Squares2X2Icon className="w-4 h-4 text-[#F59E42]" />
                                                <span className="text-sm text-gray-600">카드</span>
                                                <span className="text-sm font-medium text-gray-800">{content.chunks_count || 0}</span>
                                            </div>
                                        </div>

                                        <div className="mt-2 text-xs text-gray-400">
                                            {new Date(content.created_at).toLocaleString('ko-KR', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}