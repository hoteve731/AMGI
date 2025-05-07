'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useSWRConfig } from 'swr'
import { useRouter } from 'next/navigation'
import LoadingOverlay from './LoadingOverlay'
import { motion } from 'framer-motion'
import useSWR from 'swr'
import { ChevronRightIcon } from '@heroicons/react/24/outline'
import Image from 'next/image'

type Content = {
    id: string
    title: string
    icon?: string
    created_at: string
    groups_count?: number
    chunks_count?: number
    isProcessing?: boolean
    group_names?: string[]
    processing_status?: string
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
            // 처리 중인 콘텐츠가 있을 때만 폴링 활성화
            refreshInterval: processingContentIds.length > 0 ? 5000 : 0,
            revalidateOnFocus: true,
            revalidateOnReconnect: true,
            dedupingInterval: 5000,
        }
    )

    // 임시 콘텐츠 처리
    useEffect(() => {
        // 로컬 스토리지에서 임시 콘텐츠 가져오기
        const tempContentString = localStorage.getItem('temp_content');
        const realContentId = localStorage.getItem('real_content_id');

        if (tempContentString) {
            try {
                const tempContent = JSON.parse(tempContentString);

                // 실제 콘텐츠 ID가 있으면 임시 콘텐츠를 제거하고 데이터 갱신
                if (realContentId) {
                    localStorage.removeItem('temp_content');
                    localStorage.removeItem('real_content_id');
                    mutate(); // 데이터 다시 가져오기
                } else {
                    // 실제 콘텐츠 ID가 없으면 임시 콘텐츠를 표시
                    const currentData = data || { contents: [] };

                    // 이미 임시 콘텐츠가 있는지 확인
                    const hasTempContent = currentData.contents.some(c => c.id === tempContent.id);

                    if (!hasTempContent) {
                        // 임시 콘텐츠 추가
                        mutate({
                            contents: [tempContent, ...currentData.contents]
                        }, false);
                    }
                }
            } catch (e) {
                console.error('임시 콘텐츠 파싱 오류:', e);
                localStorage.removeItem('temp_content');
            }
        }
    }, [data, mutate]);

    // 실제 사용할 콘텐츠 데이터 결정
    const contentsToProcess = externalContents || data?.contents || []

    // 콘텐츠 처리 상태 설정
    useEffect(() => {
        if (contentsToProcess.length === 0) return;

        const processContents = () => {
            const contentsCopy = [...contentsToProcess];
            const newProcessingIds: string[] = [];

            // 각 콘텐츠에 processing_status에 따라 처리 상태 설정
            for (const content of contentsCopy) {
                const index = contentsCopy.findIndex(c => c.id === content.id);
                if (index !== -1) {
                    // 처리 중인 콘텐츠 식별 - processing_status만으로 판단
                    const isProcessing =
                        content.processing_status === 'pending' ||
                        content.processing_status === 'title_generated' ||
                        content.processing_status === 'groups_generating' ||
                        content.processing_status === 'groups_generated' ||
                        content.processing_status === 'chunks_generating';

                    // 명시적으로 isProcessing 상태 설정
                    if (isProcessing) {
                        newProcessingIds.push(content.id);
                        contentsCopy[index].isProcessing = true;
                    } else {
                        contentsCopy[index].isProcessing = false;
                    }

                    // 콘텐츠 상태 로깅
                    console.log(`[ContentList] Content ${content.id}:`, {
                        title: content.title,
                        processing_status: content.processing_status || 'undefined',
                        isProcessing: contentsCopy[index].isProcessing
                    });
                }
            }

            // 처리 중인 콘텐츠 ID 업데이트
            setProcessingContentIds(newProcessingIds);
            setProcessedContents(contentsCopy);
        };

        processContents();
    }, [contentsToProcess]);

    // 처리 중인 콘텐츠의 상태 확인
    const checkContentStatus = useCallback(async () => {
        let needsRefresh = false;
        let updatedContents = false;
        const contentsCopy = [...processedContents];

        for (const contentId of processingContentIds) {
            try {
                // API 호출 전에 확인
                if (!contentId) continue;

                const response = await fetch(`/content/${contentId}/status`);
                if (!response.ok) continue;

                try {
                    const data = await response.json();

                    // 현재 콘텐츠 찾기
                    const contentIndex = contentsCopy.findIndex(c => c.id === contentId);
                    if (contentIndex === -1) continue;

                    // 상태가 변경되었는지 확인
                    const currentStatus = contentsCopy[contentIndex].processing_status;
                    const newStatus = data.processing_status;

                    if (currentStatus !== newStatus) {
                        console.log(`[ContentList] Status changed for ${contentId}: ${currentStatus} -> ${newStatus}`);

                        // 상태 업데이트
                        contentsCopy[contentIndex].processing_status = newStatus;

                        // 처리 중 상태 업데이트
                        const isProcessing =
                            newStatus === 'pending' ||
                            newStatus === 'title_generated' ||
                            newStatus === 'groups_generating' ||
                            newStatus === 'groups_generated' ||
                            newStatus === 'chunks_generating';

                        contentsCopy[contentIndex].isProcessing = isProcessing;
                        updatedContents = true;

                        // processing_status가 completed인지 확인
                        if (newStatus === 'completed') {
                            needsRefresh = true;
                        }
                    }
                } catch (jsonError) {
                    console.error('콘텐츠 상태 JSON 파싱 오류:', jsonError);
                    continue;
                }
            } catch (error) {
                console.error('콘텐츠 상태 확인 중 오류:', error);
            }
        }

        // 콘텐츠 상태가 업데이트되었으면 상태 업데이트
        if (updatedContents) {
            setProcessedContents(contentsCopy);

            // 처리 중인 콘텐츠 ID 필터링
            const newProcessingIds = contentsCopy
                .filter(c => c.isProcessing)
                .map(c => c.id);

            setProcessingContentIds(newProcessingIds);
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
    }, [processingContentIds, processedContents, externalMutate, mutate, localMutate]);

    useEffect(() => {
        if (processingContentIds.length === 0) return;

        // 최초 실행
        checkContentStatus();

        // 1.5초 후 다시 확인 (기존 3초에서 단축)
        const intervalId = setInterval(() => {
            checkContentStatus();
        }, 1500);

        // 클린업 함수
        return () => {
            clearInterval(intervalId);
        };
    }, [processingContentIds, checkContentStatus]);

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

    // Function to open the bottom sheet
    const openBottomSheet = () => {
        const event = new CustomEvent('openBottomSheet');
        window.dispatchEvent(event);
    };

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
            {!isFetching && !error && displayContents.length === 0 && (
                <div className="flex flex-col items-center justify-center h-[30vh] text-center">
                    <div className="relative w-24 h-24 mb-2">
                        <Image
                            src="/images/doneloopa.png"
                            alt="Create a new note"
                            fill
                            style={{ objectFit: 'contain' }}
                        />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-700 mb-1">No notes yet</h3>
                    <p className="text-gray-500 mb-6 max-w-xs">Create your first note to get started</p>
                    <motion.button
                        onClick={openBottomSheet}
                        className="px-6 py-3 bg-[#5F4BB6] text-white rounded-full shadow-lg text-base font-semibold flex items-center"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        New Note
                    </motion.button>
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
                            <div className="flex justify-between items-center">
                                {content.isProcessing ? (
                                    <div className="flex-1">
                                        <h2 className="text-lg font-bold text-gray-800">
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
                                                <span className="ml-2 text-sm text-[#7969F7]">Processing...</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 cursor-pointer relative"
                                        onClick={() => handleContentClick(content.id)}
                                    >
                                        {/* Caret right icon - positioned at vertical center on the right */}
                                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                                            <ChevronRightIcon className="w-4 h-4 text-black text-opacity-40" />
                                        </div>

                                        {/* Icon with circular background - positioned at vertical center on the left */}
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-12 h-12 rounded-full bg-[#F3F5FD]">
                                            <span className="text-xl">{content.icon || '📄'}</span>
                                        </div>

                                        <div className="pl-16 pr-8">
                                            {/* Title */}
                                            <h2 className="text-lg font-semibold text-gray-800">
                                                {content.title}
                                            </h2>

                                            {/* Ready message */}
                                            {(content.groups_count === 0 && content.chunks_count === 0 && !content.isProcessing) && (
                                                <div className="mt-1 mb-2 text-base text-gray-500 font-semibold">
                                                    ✅ Your Note is ready. Now generate memory cards!
                                                </div>
                                            )}

                                            {/* Bottom row with counts on left and date on right */}
                                            <div className="flex items-center mt-2">
                                                {/* Card count and date on the left */}
                                                <div className="flex items-center gap-2 text-black text-opacity-40">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-xs">{content.chunks_count || 0} Cards</span>
                                                    </div>
                                                    <span className="text-xs">•</span>

                                                    {/* Date */}
                                                    <span className="text-xs">
                                                        {new Date(content.created_at).toLocaleDateString('en-US', {
                                                            year: 'numeric',
                                                            month: 'long',
                                                            day: 'numeric'
                                                        })}
                                                    </span>
                                                </div>
                                            </div>
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