'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { motion, AnimatePresence } from 'framer-motion'

type Chunk = {
    id: string
    group_id: string
    summary: string
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

    // 해당 그룹 디테일 페이지로 이동
    const goToGroupDetail = () => {
        if (!groupId) return
        router.push(`/content/${contentId}/groups/${groupId}`)
    }

    // 그룹과 청크 데이터 로드
    const loadGroupAndChunks = useCallback(async () => {
        if (!contentId || !groupId) {
            console.error('필수 파라미터가 없습니다:', { contentId, groupId })
            return
        }

        try {
            const { data: groupData, error: groupError } = await supabase
                .from('content_groups')
                .select(`
                    id,
                    title,
                    chunks:content_chunks (
                        id,
                        group_id,
                        summary,
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

            setIsLoading(false)
        } catch (error: any) {
            console.error('데이터 로드 실패:', error)
            alert(error.message)
            goToGroupDetail()
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
    const handleDifficulty = (level: 'again' | 'hard' | 'good' | 'easy') => {
        if (!currentGroup || !currentChunk) return

        // 마지막 카드인 경우 그룹 리스트 페이지로 이동
        if (currentIndex === currentGroup.chunks.length - 1) {
            goToGroupDetail()
            return
        }

        // 다음 청크로 이동
        const nextChunk = currentGroup.chunks[currentIndex + 1]
        setCurrentChunk(nextChunk)
        setCurrentIndex(currentIndex + 1)
        setIsFlipped(false)

        // URL 업데이트 (페이지 새로고침 없이)
        window.history.pushState(
            {},
            '',
            `/content/${contentId}/learning?chunk=${nextChunk.id}&group=${currentGroup.id}`
        )
    }

    // 마스킹된 텍스트 처리 함수
    const processMaskedText = (text: string) => {
        // First handle masked text within {{}}
        const maskedText = text.replace(/\{\{([^{}]+)\}\}/g,
            '<span class="inline-block bg-black w-10 h-4 rounded"></span>');

        // Then handle bold text with **
        return maskedText.replace(/\*\*(.*?)\*\*/g, '<span class="font-bold text-black">$1</span>')
    }

    // 로딩 중에는 아무것도 렌더링하지 않음
    if (isLoading) {
        return null;
    }

    if (!currentGroup || !currentChunk) {
        return (
            <div className="p-4 text-center">
                <p className="text-red-500">학습할 카드를 찾을 수 없습니다.</p>
                <button
                    onClick={goToGroupDetail}
                    className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                    뒤로
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
                    className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center text-gray-600 hover:text-gray-900 transition-all duration-200 group"
                >
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="ml-2 font-medium group-hover:font-semibold transition-all duration-200">뒤로</span>
                </button>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4 flex flex-col min-h-[calc(100vh-3rem)]">
                {/* 그룹 제목 */}
                <h1 className="text-2xl font-bold text-gray-800 mb-8 mt-8 text-center">{currentGroup.title}</h1>

                {/* 카드 표시 영역 - 절대 위치로 고정 */}
                <div className="relative flex-1 overflow-hidden">
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {/* 카드 인덱스 표시 - 카드 바로 위로 이동 */}
                        <div className="text-lg mb-4 text-center">
                            <div className="inline-flex items-center justify-center bg-[#8B4513]/60 backdrop-blur-md rounded-full px-4 py-1.5">
                                <span className="font-bold text-white">{currentIndex + 1}</span>
                                <span className="font-bold text-white/50">/{currentGroup.chunks.length}</span>
                            </div>
                        </div>

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentChunk.id}
                                initial={{ opacity: 0, x: 200 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -200 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 300,
                                    damping: 30
                                }}
                                className="w-full max-w-md"
                            >
                                <div className="w-full min-h-[200px] bg-white/90 backdrop-blur-md rounded-xl border border-[#D4C4B7] p-6 shadow-lg">
                                    <div
                                        className="text-gray-800 text-lg"
                                        dangerouslySetInnerHTML={{
                                            __html: processMaskedText(isFlipped ? currentChunk.masked_text : currentChunk.summary)
                                        }}
                                    />
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>

                {/* 하단 버튼 영역 - 고정 높이 */}
                <div className="mt-auto pt-4 h-[150px]">
                    {!isFlipped ? (
                        // 앞면: 정답 보기 버튼
                        <button
                            onClick={handleFlip}
                            className="w-full bg-white rounded-xl border border-[#D4C4B7] py-4 text-gray-800 font-medium hover:bg-gray-50 transition-colors shadow-lg mb-8"
                        >
                            정답 보기
                        </button>
                    ) : (
                        // 뒷면: 난이도 버튼들
                        <div>
                            <p className="text-center text-gray-600 text-sm mb-4">
                                {currentIndex === currentGroup.chunks.length - 1 ? (
                                    "마지막 카드입니다."
                                ) : (
                                    <>
                                        난이도에 따른 복습 간격을 선택하면<br />
                                        다음 카드로 넘어갑니다.<br />
                                        복습 간격은 최적으로 계속 조정됩니다.
                                    </>
                                )}
                            </p>
                            <div className="grid grid-cols-4 gap-2 mb-8">
                                <button
                                    onClick={() => handleDifficulty('again')}
                                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-red-50 hover:bg-red-100 transition-colors"
                                >
                                    <span className="text-red-500 font-medium">Again</span>
                                    <span className="text-red-400 text-sm">1m</span>
                                </button>
                                <button
                                    onClick={() => handleDifficulty('hard')}
                                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-orange-50 hover:bg-orange-100 transition-colors"
                                >
                                    <span className="text-orange-500 font-medium">Hard</span>
                                    <span className="text-orange-400 text-sm">8m</span>
                                </button>
                                <button
                                    onClick={() => handleDifficulty('good')}
                                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-green-50 hover:bg-green-100 transition-colors"
                                >
                                    <span className="text-green-500 font-medium">Good</span>
                                    <span className="text-green-400 text-sm">15m</span>
                                </button>
                                <button
                                    onClick={() => handleDifficulty('easy')}
                                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors"
                                >
                                    <span className="text-blue-500 font-medium">Easy</span>
                                    <span className="text-blue-400 text-sm">4d</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}