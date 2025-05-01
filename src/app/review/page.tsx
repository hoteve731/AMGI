'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { motion, AnimatePresence } from 'framer-motion'
import LoadingOverlay from '@/components/LoadingOverlay'
import { CheckIcon } from '@heroicons/react/24/outline'

type ReviewCard = {
    id: string
    group_id: string
    summary: string
    masked_text: string
    card_state: 'new' | 'learning' | 'graduated' | 'review' | 'relearning'
    due: number | null
    ease: number
    interval: number
    repetition_count: number
    last_result: 'again' | 'hard' | 'good' | 'easy' | null
    last_reviewed: number | null
    status: 'active' | 'inactive'
    content_groups: {
        title: string
        content_id: string
    }
}

export default function ReviewPage() {
    const router = useRouter()
    const supabase = createClientComponentClient()

    const [cards, setCards] = useState<ReviewCard[]>([])
    const [currentCardIndex, setCurrentCardIndex] = useState(0)
    const [isFlipped, setIsFlipped] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [activeButton, setActiveButton] = useState<'again' | 'hard' | 'good' | 'easy' | null>(null)
    const [slideDirection, setSlideDirection] = useState<'right-to-left' | 'flip'>('flip')
    const [isNavigatingBack, setIsNavigatingBack] = useState(false)
    const [isInitialized, setIsInitialized] = useState(false)
    const [showCheckAnimation, setShowCheckAnimation] = useState(false)

    const currentCard = cards[currentCardIndex]

    const fetchReviewCards = useCallback(async () => {
        try {
            console.log('Fetching review cards...')
            setIsLoading(true)

            const response = await fetch('/api/review', {
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include' // 쿠키 포함
            })

            console.log('API response status:', response.status)

            if (!response.ok) {
                const errorData = await response.json()
                console.error('API error response:', errorData)
                throw new Error(`서버 오류: ${response.status} - ${errorData.details || errorData.error || '알 수 없는 오류'}`)
            }

            const result = await response.json()
            console.log('API response data:', result)

            if (result.cards && Array.isArray(result.cards)) {
                console.log(`Received ${result.cards.length} cards for review`)
                setCards(result.cards)

                // 서버 측에서 알림을 처리하므로 클라이언트 측 알림 코드 제거
                console.log(`리뷰 페이지 접속: ${result.cards.length}개의 카드 로드됨`)
            } else {
                console.warn('No cards received from API or cards is not an array:', result.cards)
                setCards([])
            }

            setIsLoading(false)
            setIsInitialized(true)
        } catch (error) {
            console.error('Error fetching review cards:', error)
            setIsLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchReviewCards()
    }, [fetchReviewCards])

    const handleFlip = () => {
        setSlideDirection('flip')
        setIsFlipped(!isFlipped)
    }

    const formatInterval = (interval: number) => {
        if (interval < 1) {
            // Convert to minutes
            const minutes = Math.round(interval * 1440) // 1440 minutes in a day
            return `${minutes}m`
        } else if (interval === 1) {
            return '1d'
        } else if (interval < 30) {
            return `${interval}d`
        } else if (interval < 365) {
            const months = Math.round(interval / 30)
            return `${months}mo`
        } else {
            const years = Math.round(interval / 365)
            return `${years}y`
        }
    }

    const getNextIntervalPreview = (card: ReviewCard, result: 'again' | 'hard' | 'good' | 'easy') => {
        const settings = {
            steps: [1, 10], // minutes
            graduating_interval: 1, // days
            starting_ease: 2.5,
            easy_bonus: 1.3,
            hard_interval: 1.2,
            interval_modifier: 0.9
        }

        let interval = card.interval || 1

        if (card.card_state === 'new' || card.card_state === 'learning') {
            if (result === 'again') {
                return '1m'
            } else if (result === 'hard') {
                // 학습 중인 카드에 대한 hard 결과 처리
                return '5m'
            } else if (result === 'good') {
                if (card.card_state === 'learning') {
                    return '1d'
                } else {
                    return '10m'
                }
            } else if (result === 'easy') {
                return '2d'
            }
        } else if (card.card_state === 'graduated' || card.card_state === 'review') {
            if (result === 'again') {
                return '1d'
            } else if (result === 'hard') {
                interval = Math.ceil(interval * settings.hard_interval * settings.interval_modifier)
                return formatInterval(interval)
            } else if (result === 'good') {
                interval = Math.ceil(interval * (card.ease || 2.5) * settings.interval_modifier)
                return formatInterval(interval)
            } else if (result === 'easy') {
                interval = Math.ceil(interval * (card.ease || 2.5) * settings.easy_bonus * settings.interval_modifier)
                return formatInterval(interval)
            }
        } else if (card.card_state === 'relearning') {
            if (result === 'again') {
                return '1m'
            } else if (result === 'hard') {
                // 재학습 중인 카드에 대한 hard 결과 처리
                return '5m'
            } else if (result === 'good') {
                return formatInterval(Math.max(1, Math.ceil(interval * 0.5 * settings.interval_modifier)))
            } else if (result === 'easy') {
                return formatInterval(Math.ceil(interval * settings.interval_modifier))
            }
        }

        return '?'
    }

    const handleCardAction = async (result: 'again' | 'hard' | 'good' | 'easy') => {
        if (isSubmitting || !currentCard) return

        setActiveButton(result)
        setShowCheckAnimation(true)
        setIsSubmitting(true)
        setSlideDirection('right-to-left') // Set slide direction for next card animation

        // Hide check animation after 500ms
        setTimeout(() => {
            setShowCheckAnimation(false)
        }, 500)

        try {
            console.log(`Submitting card action: ${result} for card ID: ${currentCard.id}`)

            const response = await fetch('/api/review', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: currentCard.id,
                    result
                }),
                credentials: 'include' // 쿠키 포함
            })

            console.log('API response status:', response.status)

            if (!response.ok) {
                const errorData = await response.json()
                console.error('API error response:', errorData)
                throw new Error(`서버 오류: ${response.status} - ${errorData.details || errorData.error || '알 수 없는 오류'}`)
            }

            // Move to the next card
            if (currentCardIndex < cards.length - 1) {
                setCurrentCardIndex(prev => prev + 1)
            } else {
                // No more cards, show completion message or redirect
                console.log('All cards reviewed!')
                router.push('/')
            }

            // Reset flip state
            setIsFlipped(false)
        } catch (error) {
            console.error('Error submitting card action:', error)
            alert('카드 처리 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : String(error)))
        } finally {
            setIsSubmitting(false)
            setActiveButton(null)
        }
    }

    const handleCardStatus = async (status: 'active' | 'inactive') => {
        if (!currentCard || isSubmitting) return

        try {
            setIsSubmitting(true)
            console.log(`Updating card status to ${status} for card ID: ${currentCard.id}`)

            const response = await fetch('/api/review', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: currentCard.id,
                    status
                }),
                credentials: 'include' // 쿠키 포함
            })

            console.log('API response status:', response.status)

            if (!response.ok) {
                const errorData = await response.json()
                console.error('API error response:', errorData)
                throw new Error(`서버 오류: ${response.status} - ${errorData.details || errorData.error || '알 수 없는 오류'}`)
            }

            // Remove the current card from the queue
            setCards(prev => prev.filter((_, i) => i !== currentCardIndex))

            // Reset flip state
            setIsFlipped(false)

            // If no more cards, refresh the queue
            if (currentCardIndex >= cards.length - 1) {
                await fetchReviewCards()
                setCurrentCardIndex(0)
            }
        } catch (error) {
            console.error('Error updating card status:', error)
            alert('카드 상태 업데이트 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : String(error)))
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleGoHome = () => {
        setIsNavigatingBack(true)
        router.push('/')
    }

    // Process masked text
    const processMaskedText = (text: string) => {
        // First handle masked text within {{}}
        const maskedText = text.replace(/\{\{([^{}]+)\}\}/g,
            '<span class="inline-block bg-black w-10 h-4 rounded"></span>')

        // Then handle bold text with **
        return maskedText.replace(/\*\*(.*?)\*\*/g, '<span class="font-bold text-black">$1</span>')
    }

    if (isLoading) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8F4EF]">
                <LoadingOverlay />
            </div>
        )
    }

    if (!cards || cards.length === 0) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8F4EF] p-4">
                <div className="bg-white/90 backdrop-blur-md rounded-xl shadow-lg p-6 max-w-md w-full">
                    <h1 className="text-2xl font-bold text-center mb-4">복습 완료!</h1>
                    <p className="text-gray-600 text-center mb-6">
                        현재 복습할 카드가 없습니다. 모든 복습을 완료했습니다.
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-light rounded-lg transition-colors"
                    >
                        홈으로 돌아가기
                    </button>
                </div>
            </div>
        )
    }

    return (
        <main className="flex h-screen overflow-hidden flex-col bg-[#F8F4EF] touch-none">
            {isNavigatingBack && <LoadingOverlay />}
            {/* 헤더 */}
            <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] h-12 z-50">
                <button
                    onClick={handleGoHome}
                    className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center text-gray-600 hover:text-gray-900 transition-all duration-200 group"
                >
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="ml-2 font-bold group-hover:font-bold transition-all duration-200">홈</span>
                </button>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4 flex flex-col overflow-hidden">
                {/* 그룹 제목 */}
                <h1 className="text-sm font-medium text-gray-600 mb-1 mt-2 text-center">
                    {currentCard?.content_groups?.title || '복습'}
                </h1>

                {/* 상단 여백 추가 */}
                <div className="h-6"></div>

                {/* 카드 진행 상태 태그 - 그룹 타이틀 아래 중앙에 배치 */}
                <div className="flex justify-center mb-1">
                    <div className="inline-flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm">
                        <span className="text-sm text-gray-800 font-bold">
                            {currentCardIndex + 1}/{cards.length}
                        </span>
                    </div>
                </div>

                <div className="h-4"></div>

                {/* 카드 표시 영역 */}
                <div className="overflow-hidden">
                    <AnimatePresence mode="wait" key={`${currentCard?.id}-${isFlipped ? 'flipped' : 'front'}`}>
                        {currentCard && (
                            <motion.div
                                key={`card-${currentCard.id}`}
                                initial={slideDirection === 'flip'
                                    ? { opacity: 0, rotateY: isFlipped ? -90 : 90 }
                                    : { opacity: 0, x: 300 }
                                }
                                animate={slideDirection === 'flip'
                                    ? { opacity: 1, rotateY: 0 }
                                    : { opacity: 1, x: 0 }
                                }
                                exit={slideDirection === 'flip'
                                    ? { opacity: 0, rotateY: isFlipped ? 90 : -90 }
                                    : { opacity: 0, x: -300 }
                                }
                                transition={slideDirection === 'flip'
                                    ? {
                                        type: "spring",
                                        stiffness: 300,
                                        damping: 30
                                    }
                                    : {
                                        type: "spring",
                                        stiffness: 300,
                                        damping: 30,
                                        duration: 0.3
                                    }
                                }
                                className="w-full max-w-md perspective-1000 mx-auto"
                            >
                                <div className="w-full min-h-[200px] bg-white/90 backdrop-blur-md rounded-xl shadow-lg p-6">
                                    {/* 카드 상태 및 반복 수 태그 - 좌상단에 통합 표시 */}
                                    <div className="flex justify-start mb-2">
                                        <div className="inline-flex items-center justify-center bg-white rounded-full px-3 py-1 border border-gray-200">
                                            <div className="flex items-center">
                                                <div className={`w-2 h-2 rounded-full mr-2 ${currentCard?.card_state === 'new' ? 'bg-[#FDFF8C]' :
                                                    currentCard?.card_state === 'learning' || currentCard?.card_state === 'relearning' ? 'bg-[#B4B6E4]' :
                                                        currentCard?.card_state === 'review' || currentCard?.card_state === 'graduated' ? 'bg-[#5F4BB6]' :
                                                            'bg-gray-400'
                                                    }`}></div>
                                                <div className="text-sm font-medium text-gray-800">
                                                    {currentCard?.card_state === 'new' ? '새 카드' :
                                                        currentCard?.card_state === 'learning' ? '학습 중' :
                                                            currentCard?.card_state === 'graduated' || currentCard?.card_state === 'review' ? '복습' :
                                                                '재학습'}
                                                    {currentCard?.repetition_count !== undefined && (
                                                        <span className="ml-1 text-gray-600">
                                                            (반복 {currentCard.repetition_count}회)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div
                                        className="text-gray-800 text-lg"
                                        dangerouslySetInnerHTML={{
                                            __html: processMaskedText(isFlipped ? currentCard.masked_text : currentCard.summary)
                                        }}
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* 카드 비활성화 버튼 - 카드 바로 아래 배치 */}
                <div className="flex justify-center mt-6 mb-32">
                    <button
                        onClick={() => handleCardStatus('inactive')}
                        className="text-gray-500 hover:text-red-500 transition-colors mx-2 flex items-center"
                        title="비활성화"
                        disabled={isSubmitting}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span className="ml-1 text-m font-medium">이 카드 비활성화 (스킵)</span>
                    </button>
                </div>

                {/* 하단 여백 */}
                <div className="flex-grow"></div>

                {/* 하단 버튼 영역 - 고정 플로팅 처리 */}
                <div className="fixed bottom-0 left-0 right-0 z-10 w-full">
                    <div className="p-4 pb-8 flex justify-center">
                        <div style={{ width: "100%", maxWidth: "500px" }}>
                            {!isFlipped ? (
                                // 앞면: 정답 보기 버튼
                                <button
                                    onClick={handleFlip}
                                    className="w-full flex flex-col items-center justify-center p-4 rounded-xl bg-white hover:bg-gray-50 transition-colors shadow-lg"
                                    disabled={isSubmitting}
                                >
                                    <span className="text-gray-800 font-semibold">정답 보기</span>
                                </button>
                            ) : (
                                // 뒷면: 난이도 버튼들
                                <div className="grid grid-cols-2 gap-4 w-full">
                                    <button
                                        onClick={() => handleCardAction('again')}
                                        className={`flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all relative`}
                                        disabled={isSubmitting}
                                    >
                                        {activeButton === 'again' && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-xl">
                                                {showCheckAnimation && (
                                                    <motion.div
                                                        initial={{ scale: 0.5, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1 }}
                                                        exit={{ scale: 1.5, opacity: 0 }}
                                                        transition={{ duration: 0.3 }}
                                                        className="text-red-500"
                                                    >
                                                        <CheckIcon className="h-6 w-6" />
                                                    </motion.div>
                                                )}
                                            </div>
                                        )}
                                        <div className="text-xl mb-1">❌</div>
                                        <span className="text-black text-sm font-semibold">Forgotten</span>
                                        <span className="text-black text-xs font-normal">
                                            {getNextIntervalPreview(currentCard, 'again')} 후 복습
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => handleCardAction('hard')}
                                        className={`flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all relative`}
                                        disabled={isSubmitting}
                                    >
                                        {activeButton === 'hard' && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-xl">
                                                {showCheckAnimation && (
                                                    <motion.div
                                                        initial={{ scale: 0.5, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1 }}
                                                        exit={{ scale: 1.5, opacity: 0 }}
                                                        transition={{ duration: 0.3 }}
                                                        className="text-yellow-500"
                                                    >
                                                        <CheckIcon className="h-6 w-6" />
                                                    </motion.div>
                                                )}
                                            </div>
                                        )}
                                        <div className="text-xl mb-1">😐</div>
                                        <span className="text-black text-sm font-semibold">Recalled partially</span>
                                        <span className="text-black text-xs font-normal">
                                            {getNextIntervalPreview(currentCard, 'hard')} 후 복습
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => handleCardAction('good')}
                                        className={`flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all relative`}
                                        disabled={isSubmitting}
                                    >
                                        {activeButton === 'good' && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-xl">
                                                {showCheckAnimation && (
                                                    <motion.div
                                                        initial={{ scale: 0.5, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1 }}
                                                        exit={{ scale: 1.5, opacity: 0 }}
                                                        transition={{ duration: 0.3 }}
                                                        className="text-green-500"
                                                    >
                                                        <CheckIcon className="h-6 w-6" />
                                                    </motion.div>
                                                )}
                                            </div>
                                        )}
                                        <div className="text-xl mb-1">😄</div>
                                        <span className="text-black text-sm font-semibold">Recalled with effort</span>
                                        <span className="text-black text-xs font-normal">
                                            {getNextIntervalPreview(currentCard, 'good')} 후 복습
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => handleCardAction('easy')}
                                        className={`flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all relative`}
                                        disabled={isSubmitting}
                                    >
                                        {activeButton === 'easy' && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-xl">
                                                {showCheckAnimation && (
                                                    <motion.div
                                                        initial={{ scale: 0.5, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1 }}
                                                        exit={{ scale: 1.5, opacity: 0 }}
                                                        transition={{ duration: 0.3 }}
                                                        className="text-blue-500"
                                                    >
                                                        <CheckIcon className="h-6 w-6" />
                                                    </motion.div>
                                                )}
                                            </div>
                                        )}
                                        <div className="text-xl mb-1">👑</div>
                                        <span className="text-black text-sm font-semibold">Immediately</span>
                                        <span className="text-black text-xs font-normal">
                                            {getNextIntervalPreview(currentCard, 'easy')} 후 복습
                                        </span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}