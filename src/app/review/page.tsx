'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { motion, AnimatePresence } from 'framer-motion'

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

    const currentCard = cards[currentCardIndex]

    const fetchReviewCards = useCallback(async () => {
        try {
            setIsLoading(true)
            const { data, error } = await supabase.auth.getSession()

            if (error || !data.session) {
                console.error('Authentication error:', error)
                router.push('/login')
                return
            }

            const response = await fetch('/api/review')
            const result = await response.json()

            if (result.cards) {
                setCards(result.cards)
            }

            setIsLoading(false)
        } catch (error) {
            console.error('Error fetching review cards:', error)
            setIsLoading(false)
        }
    }, [router, supabase])

    useEffect(() => {
        fetchReviewCards()
    }, [fetchReviewCards])

    const handleFlip = () => {
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
            } else if (result === 'good') {
                return formatInterval(Math.max(1, Math.ceil(interval * 0.5 * settings.interval_modifier)))
            } else if (result === 'easy') {
                return formatInterval(Math.ceil(interval * settings.interval_modifier))
            }
        }

        return '?'
    }

    const handleAnswer = async (result: 'again' | 'hard' | 'good' | 'easy') => {
        if (!currentCard || isSubmitting) return

        try {
            setIsSubmitting(true)

            const response = await fetch('/api/review', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: currentCard.id,
                    result
                })
            })

            if (!response.ok) {
                throw new Error('Failed to update card')
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
            console.error('Error updating card:', error)
            alert('카드 업데이트 중 오류가 발생했습니다.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleCardStatus = async (status: 'active' | 'inactive') => {
        if (!currentCard || isSubmitting) return

        try {
            setIsSubmitting(true)

            const response = await fetch('/api/review', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: currentCard.id,
                    status
                })
            })

            if (!response.ok) {
                throw new Error('Failed to update card status')
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
            alert('카드 상태 업데이트 중 오류가 발생했습니다.')
        } finally {
            setIsSubmitting(false)
        }
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
            <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-t from-[#D4C4B7] via-[#E8D9C5] to-[#F8F4EF]">
                <div className="animate-spin w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full"></div>
                <p className="mt-4 text-gray-600">복습 카드를 불러오는 중...</p>
            </div>
        )
    }

    if (!cards || cards.length === 0) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-t from-[#D4C4B7] via-[#E8D9C5] to-[#F8F4EF] p-4">
                <div className="bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 shadow-lg p-6 max-w-md w-full">
                    <h1 className="text-2xl font-bold text-center mb-4">복습 완료!</h1>
                    <p className="text-gray-600 text-center mb-6">
                        현재 복습할 카드가 없습니다. 모든 복습을 완료했습니다.
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
                    >
                        홈으로 돌아가기
                    </button>
                </div>
            </div>
        )
    }

    return (
        <main className="flex min-h-screen flex-col bg-gradient-to-t from-[#D4C4B7] via-[#E8D9C5] to-[#F8F4EF]">
            {/* 헤더 */}
            <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] h-12 z-50">
                <button
                    onClick={() => router.push('/')}
                    className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center text-gray-600 hover:text-gray-900 transition-all duration-200 group"
                >
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="ml-2 font-medium group-hover:font-semibold transition-all duration-200">홈으로</span>
                </button>

                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                    <span className="text-sm text-gray-500">
                        {currentCardIndex + 1}/{cards.length}
                    </span>
                </div>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4 flex flex-col min-h-[calc(100vh-3rem)]">
                {/* 그룹 제목 */}
                <h1 className="text-xl font-bold text-gray-800 mb-2 mt-6 text-center">
                    {currentCard?.content_groups?.title || '복습'}
                </h1>

                {/* 카드 상태 */}
                <div className="flex justify-center mb-6">
                    <div className="inline-flex items-center justify-center bg-gray-100 rounded-full px-3 py-1">
                        <span className={`text-sm font-medium ${currentCard?.card_state === 'new' ? 'text-blue-600' :
                                currentCard?.card_state === 'learning' ? 'text-orange-600' :
                                    currentCard?.card_state === 'graduated' ? 'text-green-600' :
                                        currentCard?.card_state === 'review' ? 'text-purple-600' :
                                            'text-red-600'
                            }`}>
                            {currentCard?.card_state === 'new' ? '새 카드' :
                                currentCard?.card_state === 'learning' ? '학습 중' :
                                    currentCard?.card_state === 'graduated' ? '졸업' :
                                        currentCard?.card_state === 'review' ? '복습' :
                                            '재학습'}
                        </span>
                    </div>
                </div>

                {/* 카드 표시 영역 */}
                <div className="relative flex-1 overflow-hidden">
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentCard.id + (isFlipped ? '-back' : '-front')}
                                initial={{ opacity: 0, rotateY: isFlipped ? -90 : 90 }}
                                animate={{ opacity: 1, rotateY: 0 }}
                                exit={{ opacity: 0, rotateY: isFlipped ? 90 : -90 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 300,
                                    damping: 30
                                }}
                                className="w-full max-w-md perspective-1000"
                            >
                                <div className="w-full min-h-[200px] bg-white/90 backdrop-blur-md rounded-xl border border-[#D4C4B7] p-6 shadow-lg">
                                    <div
                                        className="text-gray-800 text-lg"
                                        dangerouslySetInnerHTML={{
                                            __html: processMaskedText(isFlipped ? currentCard.masked_text : currentCard.summary)
                                        }}
                                    />
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>

                {/* 카드 관리 버튼 */}
                <div className="flex justify-center mt-4 mb-2">
                    <button
                        onClick={() => handleCardStatus('inactive')}
                        className="text-gray-500 hover:text-red-500 transition-colors mx-2 flex items-center"
                        title="비활성화"
                        disabled={isSubmitting}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span className="ml-1 text-sm">비활성화</span>
                    </button>

                    <button
                        onClick={() => router.push(`/content/${currentCard?.content_groups?.content_id}/groups/${currentCard?.group_id}`)}
                        className="text-gray-500 hover:text-blue-500 transition-colors mx-2 flex items-center"
                        title="그룹으로 이동"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="ml-1 text-sm">그룹으로</span>
                    </button>
                </div>

                {/* 하단 버튼 영역 */}
                <div className="mt-auto pt-4 h-[150px]">
                    {!isFlipped ? (
                        // 앞면: 정답 보기 버튼
                        <button
                            onClick={handleFlip}
                            className="w-full bg-white rounded-xl border border-[#D4C4B7] py-4 text-gray-800 font-medium hover:bg-gray-50 transition-colors shadow-lg mb-8"
                            disabled={isSubmitting}
                        >
                            정답 보기
                        </button>
                    ) : (
                        // 뒷면: 난이도 버튼들
                        <div>
                            <p className="text-center text-gray-600 text-sm mb-4">
                                난이도에 따른 복습 간격을 선택하세요
                            </p>
                            <div className="grid grid-cols-4 gap-2 mb-8">
                                <button
                                    onClick={() => handleAnswer('again')}
                                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-red-50 hover:bg-red-100 transition-colors"
                                    disabled={isSubmitting}
                                >
                                    <span className="text-red-500 font-medium">Again</span>
                                    <span className="text-red-400 text-sm">
                                        {getNextIntervalPreview(currentCard, 'again')}
                                    </span>
                                </button>
                                <button
                                    onClick={() => handleAnswer('hard')}
                                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-orange-50 hover:bg-orange-100 transition-colors"
                                    disabled={isSubmitting}
                                >
                                    <span className="text-orange-500 font-medium">Hard</span>
                                    <span className="text-orange-400 text-sm">
                                        {getNextIntervalPreview(currentCard, 'hard')}
                                    </span>
                                </button>
                                <button
                                    onClick={() => handleAnswer('good')}
                                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-green-50 hover:bg-green-100 transition-colors"
                                    disabled={isSubmitting}
                                >
                                    <span className="text-green-500 font-medium">Good</span>
                                    <span className="text-green-400 text-sm">
                                        {getNextIntervalPreview(currentCard, 'good')}
                                    </span>
                                </button>
                                <button
                                    onClick={() => handleAnswer('easy')}
                                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors"
                                    disabled={isSubmitting}
                                >
                                    <span className="text-blue-500 font-medium">Easy</span>
                                    <span className="text-blue-400 text-sm">
                                        {getNextIntervalPreview(currentCard, 'easy')}
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}