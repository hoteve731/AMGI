'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { motion, AnimatePresence } from 'framer-motion'

type Chunk = {
    id: string
    group_id: string
    masked_text: string
}

type ContentGroup = {
    id: string
    title: string
    chunks: Chunk[]
}

export default function LearningPage() {
    const router = useRouter()
    const params = useParams()
    const searchParams = useSearchParams()
    const supabase = createClientComponentClient()

    const contentId = params?.id as string
    const chunkId = searchParams?.get('chunk')
    const groupId = searchParams?.get('group')

    const [currentGroup, setCurrentGroup] = useState<ContentGroup | null>(null)
    const [currentChunk, setCurrentChunk] = useState<Chunk | null>(null)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isFlipped, setIsFlipped] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    // 그룹 상세 페이지로 이동
    const goToGroupDetail = () => {
        router.push(`/content/${contentId}`)
    }

    // 그룹과 청크 데이터 로드
    const loadGroupAndChunks = useCallback(async () => {
        if (!contentId || !groupId) {
            console.error('필수 파라미터가 없습니다:', { contentId, groupId })
            return
        }

        setIsLoading(true)
        try {
            // 그룹 정보 가져오기
            const { data: groupData, error: groupError } = await supabase
                .from('content_groups')
                .select(`
                    id,
                    title,
                    chunks:content_chunks (
                        id,
                        group_id,
                        masked_text
                    )
                `)
                .eq('id', groupId)
                .single()

            if (groupError) {
                throw new Error(`그룹 정보 가져오기 오류: ${groupError.message}`)
            }

            if (!groupData || !groupData.chunks || groupData.chunks.length === 0) {
                throw new Error('학습할 카드가 없습니다.')
            }

            setCurrentGroup(groupData)

            // 현재 청크 찾기
            let targetChunk = groupData.chunks[0]
            let targetIndex = 0
            if (chunkId) {
                const foundIndex = groupData.chunks.findIndex(c => c.id === chunkId)
                if (foundIndex !== -1) {
                    targetChunk = groupData.chunks[foundIndex]
                    targetIndex = foundIndex
                }
            }

            setCurrentChunk(targetChunk)
            setCurrentIndex(targetIndex)
            console.log('학습 데이터 로드 완료:', { group: groupData, chunk: targetChunk, index: targetIndex })

        } catch (error: any) {
            console.error('데이터 로드 실패:', error)
            alert(error.message)
            goToGroupDetail()
        } finally {
            setIsLoading(false)
        }
    }, [contentId, groupId, chunkId, router, supabase])

    useEffect(() => {
        loadGroupAndChunks()
    }, [loadGroupAndChunks])

    // 카드 뒤집기
    const handleFlip = () => {
        setIsFlipped(!isFlipped)
    }

    // 난이도 선택
    const handleDifficulty = async (level: 'again' | 'hard' | 'good' | 'easy') => {
        if (!currentGroup || !currentChunk) return

        // 마지막 카드인 경우 그룹 상세 페이지로 이동
        if (currentIndex === currentGroup.chunks.length - 1) {
            // 바로 router.push를 하지 않고 약간의 딜레이를 줌
            setTimeout(() => {
                router.push(`/content/${contentId}`)
            }, 100)
            return
        }

        // 다음 청크로 이동
        const nextChunk = currentGroup.chunks[currentIndex + 1]
        router.push(`/content/${contentId}/learning?chunk=${nextChunk.id}&group=${currentGroup.id}`)
        setIsFlipped(false)
    }

    // 마스킹된 텍스트 처리 함수
    const processMaskedText = (text: string, isFlipped: boolean) => {
        if (isFlipped) {
            // 뒷면: 볼드+보라색으로 하이라이트
            return text.replace(/\*\*(.*?)\*\*/g, '<span class="font-bold text-purple-600">$1</span>')
        } else {
            // 앞면: 검은 사각형으로 가림
            return text.replace(/\*\*(.*?)\*\*/g, '<div class="inline-block w-10 h-4 bg-black"></div>')
        }
    }

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    if (!currentGroup || !currentChunk) {
        return (
            <div className="p-4 text-center">
                <p className="text-red-500">학습할 카드를 찾을 수 없습니다.</p>
                <button
                    onClick={goToGroupDetail}
                    className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                    뒤로가기
                </button>
            </div>
        )
    }

    return (
        <main className="flex min-h-screen flex-col bg-gradient-to-t from-[#D4C4B7] via-[#E8D9C5] to-[#F8F4EF]">
            {/* 헤더 */}
            <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] h-12 z-50">
                <button
                    onClick={goToGroupDetail}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <button
                    onClick={goToGroupDetail}
                    className="absolute left-10 top-1/2 -translate-y-1/2 text-gray-800 font-medium hover:text-gray-600"
                >
                    뒤로가기
                </button>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4 flex flex-col min-h-[calc(100vh-3rem)]">
                {/* 그룹 제목 */}
                <h1 className="text-2xl font-bold text-gray-800 mb-4 text-center">{currentGroup.title}</h1>

                {/* 카드 인덱스 표시 */}
                <div className="text-sm text-gray-600 mb-4 text-center">
                    {currentIndex + 1}/{currentGroup.chunks.length}
                </div>

                {/* 카드 표시 영역 */}
                <div className="flex-1 flex flex-col justify-center py-8">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={isFlipped ? 'back' : 'front'}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{
                                duration: 0.3,
                                type: "spring",
                                stiffness: 500,
                                damping: 30
                            }}
                            className="w-full"
                        >
                            <div className="w-full min-h-[200px] bg-white rounded-xl border border-[#D4C4B7] p-6 shadow-lg">
                                <div
                                    className="text-gray-800 text-lg"
                                    dangerouslySetInnerHTML={{
                                        __html: processMaskedText(currentChunk.masked_text, isFlipped)
                                    }}
                                />
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* 하단 버튼 영역 */}
                <div className="mt-auto pt-4">
                    {!isFlipped ? (
                        // 앞면: 정답 보기 버튼
                        <button
                            onClick={handleFlip}
                            className="w-full bg-white rounded-xl border border-[#D4C4B7] py-4 text-gray-800 font-medium hover:bg-gray-50 transition-colors shadow-lg"
                        >
                            정답 보기
                        </button>
                    ) : (
                        // 뒷면: 난이도 버튼들
                        <div className="space-y-2">
                            <p className="text-center text-gray-600 text-sm mb-4">
                                난이도에 따른 복습 간격을 선택하면<br />
                                다음 카드로 넘어갑니다.<br />
                                복습 간격은 최적으로 계속 조정됩니다.
                            </p>
                            <button
                                onClick={() => handleDifficulty('again')}
                                className="w-full bg-white rounded-xl border border-[#D4C4B7] py-3 text-gray-800 hover:bg-gray-50 transition-colors shadow-lg"
                            >
                                다시 (&lt;10분)
                            </button>
                            <button
                                onClick={() => handleDifficulty('hard')}
                                className="w-full bg-white rounded-xl border border-[#D4C4B7] py-3 text-gray-800 hover:bg-gray-50 transition-colors shadow-lg"
                            >
                                어려움 (&lt;20분)
                            </button>
                            <button
                                onClick={() => handleDifficulty('good')}
                                className="w-full bg-white rounded-xl border border-[#D4C4B7] py-3 text-gray-800 hover:bg-gray-50 transition-colors shadow-lg"
                            >
                                알맞음 (2일)
                            </button>
                            <button
                                onClick={() => handleDifficulty('easy')}
                                className="w-full bg-white rounded-xl border border-[#D4C4B7] py-3 text-gray-800 hover:bg-gray-50 transition-colors shadow-lg"
                            >
                                쉬움 (3일)
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}