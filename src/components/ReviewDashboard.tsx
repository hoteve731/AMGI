'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { motion, AnimatePresence } from 'framer-motion'
import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { createPortal } from 'react-dom'
import LoadingOverlay from './LoadingOverlay'

type ReviewStats = {
    new: number
    learning: number
    review: number
    due: number
    total: number
}

interface ReviewDashboardProps {
    userName: string
}

const DashboardSkeleton = () => (
    <div className="bg-white/50 backdrop-blur-sm rounded-[16px] shadow-lg/60 p-6 mb-0 animate-pulse min-h-[492.5px]">
        {/* Header placeholder */}
        <div className="flex justify-between items-center mb-6">
            <div className="h-8 bg-gray-300 rounded w-24"></div>
            <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
        </div>
        {/* Stat placeholders */}
        <div className="flex justify-center space-x-6 mb-6">
            <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-gray-300 rounded-full"></div>
                <div className="h-4 bg-gray-300 rounded w-16"></div>
            </div>
            <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-gray-300 rounded-full"></div>
                <div className="h-4 bg-gray-300 rounded w-16"></div>
            </div>
            <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-gray-300 rounded-full"></div>
                <div className="h-4 bg-gray-300 rounded w-16"></div>
            </div>
        </div>
        {/* Progress bar placeholder */}
        <div className="w-[270px] h-4 bg-gray-300 rounded-full mx-auto mb-6"></div>
        {/* Character placeholder */}
        <div className="w-32 h-32 bg-gray-300 rounded-full mx-auto mt-12 mb-6"></div>
        {/* Message placeholders */}
        <div className="space-y-2 mb-10">
            <div className="h-4 bg-gray-300 rounded w-3/4 mx-auto"></div>
            <div className="h-4 bg-gray-300 rounded w-1/2 mx-auto"></div>
        </div>
        {/* Action button placeholder */}
        <div className="w-full h-12 bg-gray-300 rounded-xl mt-auto"></div>
    </div>
);

export default function ReviewDashboard({ userName }: ReviewDashboardProps) {
    const router = useRouter()
    const supabase = createClientComponentClient()

    const [stats, setStats] = useState<ReviewStats>({
        new: 0,
        learning: 0,
        review: 0,
        due: 0,
        total: 0
    })
    const [isLoading, setIsLoading] = useState(true)
    const [isNavigating, setIsNavigating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [needsMigration, setNeedsMigration] = useState(false)
    const [animateProgress, setAnimateProgress] = useState(false)
    const [showStatsModal, setShowStatsModal] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        const fetchReviewStats = async () => {
            try {
                console.log('Fetching review stats...')
                setIsLoading(true)
                setError(null)

                const response = await fetch('/api/review', {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                })

                console.log('API response status:', response.status)

                if (!response.ok) {
                    const errorData = await response.json()
                    console.error('API error response:', errorData)
                    throw new Error(`서버 오류: ${response.status} - ${errorData.details || errorData.error || '알 수 없는 오류'}`)
                }

                const result = await response.json()

                if (result.needsMigration) {
                    setNeedsMigration(true)
                }

                console.log('Review stats:', result.stats)
                setStats(result.stats)

                setTimeout(() => {
                    setAnimateProgress(true)
                }, 300)
            } catch (error) {
                console.error('Error fetching review stats:', error)
                setError('통계를 가져오는 중 오류가 발생했습니다.')
            } finally {
                setIsLoading(false)
            }
        }

        fetchReviewStats()
    }, [supabase])

    useEffect(() => {
        setMounted(true)
    }, [])

    const handleStartReview = () => {
        // 리뷰 페이지에서 복귀할 때 스켈레톤 표시를 위해 플래그 설정
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('fromReview', 'true')
        }
        setIsNavigating(true)
        router.push('/review')
    }

    const handleAddIdea = () => {
        const event = new CustomEvent('openBottomSheet')
        window.dispatchEvent(event)
    }

    const completedCards = stats.total - stats.due;
    const completionPercentage = stats.total > 0 ? Math.round((completedCards / stats.total) * 100) : 100;

    const totalCards = stats.new + stats.learning + stats.review;
    const newRatio = totalCards > 0 ? stats.new / totalCards : 0;
    const learningRatio = totalCards > 0 ? stats.learning / totalCards : 0;
    const reviewRatio = totalCards > 0 ? stats.review / totalCards : 0;

    console.log('Rendering Arch - Stats:', stats);
    console.log('Rendering Arch - TotalCards for Ratio:', totalCards);
    console.log('Rendering Arch - Ratios:', { newRatio, learningRatio, reviewRatio });

    if (isLoading) {
        return <DashboardSkeleton />;
    }

    if (error) {
        return (
            <div className="bg-white/90 backdrop-blur-md rounded-[16px] border border-gray-200 shadow-lg/60 p-6 mb-0">
                <div className="text-center py-4">
                    <p className="text-gray-500">{error}</p>
                </div>
            </div>
        )
    }

    if (needsMigration) {
        return (
            <div className="bg-white/90 backdrop-blur-md rounded-[16px] border border-gray-200 shadow-lg/60 p-6 mb-0">
                <div className="text-center py-4">
                    <p className="text-gray-500">데이터베이스 마이그레이션이 필요합니다.</p>
                </div>
            </div>
        )
    }

    if (stats.due === 0) {
        console.log('Rendering Arch (Due === 0) - Stats:', stats);
        console.log('Rendering Arch (Due === 0) - TotalCards:', totalCards);
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-[#B4B6E4] backdrop-blur-md rounded-[16px] shadow-lg/60 p-6 mb-0 min-h-[432px]"
            >
                <div className="flex justify-between items-center mb-3">
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="text-center"
                    >
                        <span className="text-[#5F4BB6] text-3xl font-extrabold">{stats.total}</span>
                        <span className="text-white text-2xl font-bold">/{stats.total} 완료</span>
                    </motion.div>

                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        onClick={() => setShowStatsModal(true)}
                        className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors duration-200"
                    >
                        <InformationCircleIcon className="text-white w-5 h-5" />
                    </motion.button>
                </div>

                <div className="flex justify-center space-x-6 mb-4 mt-6">
                    <motion.div
                        className="flex items-center"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4, delay: 0.4 }}
                    >
                        <div className={`${stats.new >= 100 ? 'w-auto px-2' : 'w-6'} h-6 rounded-full bg-[#FDFF8C] flex items-center justify-center mr-2`}>
                            <span className="text-gray-800 text-sm font-bold">{stats.new}</span>
                        </div>
                        <span className="text-white text-sm font-medium">새 카드</span>
                    </motion.div>

                    <motion.div
                        className="flex items-center"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4, delay: 0.5 }}
                    >
                        <div className={`${stats.learning >= 100 ? 'w-auto px-2' : 'w-6'} h-6 rounded-full bg-white flex items-center justify-center mr-2`}>
                            <span className="text-[#B4B6E4] text-sm font-bold">{stats.learning}</span>
                        </div>
                        <span className="text-white text-sm font-medium">학습 중</span>
                    </motion.div>

                    <motion.div
                        className="flex items-center"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4, delay: 0.6 }}
                    >
                        <div className={`${stats.review >= 100 ? 'w-auto px-2' : 'w-6'} h-6 rounded-full bg-[#5F4BB6] flex items-center justify-center mr-2`}>
                            <span className="text-white text-sm font-bold">{stats.review}</span>
                        </div>
                        <span className="text-white text-sm font-medium">복습 중</span>
                    </motion.div>
                </div>

                <div className="relative flex flex-col items-center justify-center w-[300px] mx-auto mb-6">
                    <div className="w-full">
                        {totalCards > 0 && (
                            <div className="w-[250px] h-4 rounded-full overflow-hidden bg-[#E2DDFF] flex mx-auto">
                                {stats.new > 0 && (
                                    <motion.div
                                        className="h-full bg-[#FDFF8C]"
                                        style={{ width: `${newRatio * 100}%` }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${newRatio * 100}%` }}
                                        transition={{ duration: 1, ease: "easeOut" }}
                                    />
                                )}
                                {stats.learning > 0 && (
                                    <motion.div
                                        className="h-full bg-white"
                                        style={{ width: `${learningRatio * 100}%` }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${learningRatio * 100}%` }}
                                        transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                                    />
                                )}
                                {stats.review > 0 && (
                                    <motion.div
                                        className="h-full bg-[#5F4BB6]"
                                        style={{ width: `${reviewRatio * 100}%` }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${reviewRatio * 100}%` }}
                                        transition={{ duration: 1, ease: "easeOut", delay: 0.6 }}
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    <motion.img
                        src="/images/doneloopa.png"
                        alt="Character"
                        className="w-32 h-32 mt-4"
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                    />
                </div>

                <motion.div
                    className="text-center text-white mt-2 mb-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 1 }}
                >
                    <p className="text-xl font-bold">{userName}님,</p>
                    <p className="text-xl font-bold">모든 카드를 완료했어요!</p>
                </motion.div>

                <motion.div
                    className="flex justify-center"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2 }}
                >
                    <button
                        onClick={handleAddIdea}
                        className="w-full py-4 px-6 rounded-xl bg-white text-[#7969F7] font-medium hover:bg-gray-50 transition-all duration-200 flex items-center justify-center"
                    >
                        <span>기억하고 싶은 텍스트 추가하기</span>
                        <span className="ml-2 text-[#7969F7] text-lg">+</span>
                    </button>
                </motion.div>

                {mounted && (
                    <AnimatePresence>
                        {showStatsModal && (
                            <StatsModal
                                stats={stats}
                                completionPercentage={completionPercentage}
                                completedCards={completedCards}
                                onClose={() => setShowStatsModal(false)}
                            />
                        )}
                    </AnimatePresence>
                )}
            </motion.div>
        )
    }

    console.log('Rendering Arch (Due > 0) - Stats:', stats);
    console.log('Rendering Arch (Due > 0) - TotalCards:', totalCards);
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-[#B4B6E4] backdrop-blur-md rounded-[16px] shadow-lg/60 p-6 mb-0 min-h-[432px]"
        >
            {isNavigating && <LoadingOverlay />}
            <div className="flex justify-between items-center mb-6">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="text-center"
                >
                    <span className="text-white text-4xl font-extrabold">{completedCards}</span>
                    <span className="text-[#5F4BB6] text-3xl font-bold">/{stats.total} 완료</span>
                </motion.div>

                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    onClick={() => setShowStatsModal(true)}
                    className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors duration-200"
                >
                    <InformationCircleIcon className="text-white w-5 h-5" />
                </motion.button>
            </div>

            <div className="flex justify-center space-x-6 mb-4">
                <motion.div
                    className="flex items-center"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.4 }}
                >
                    <div className={`${stats.new >= 100 ? 'w-auto px-2' : 'w-6'} h-6 rounded-full bg-[#FDFF8C] flex items-center justify-center mr-2`}>
                        <span className="text-gray-800 text-sm font-bold">{stats.new}</span>
                    </div>
                    <span className="text-white text-sm font-medium">새 카드</span>
                </motion.div>

                <motion.div
                    className="flex items-center"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.5 }}
                >
                    <div className={`${stats.learning >= 100 ? 'w-auto px-2' : 'w-6'} h-6 rounded-full bg-white flex items-center justify-center mr-2`}>
                        <span className="text-[#B4B6E4] text-sm font-bold">{stats.learning}</span>
                    </div>
                    <span className="text-white text-sm font-medium">학습 중</span>
                </motion.div>

                <motion.div
                    className="flex items-center"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.6 }}
                >
                    <div className={`${stats.review >= 100 ? 'w-auto px-2' : 'w-6'} h-6 rounded-full bg-[#5F4BB6] flex items-center justify-center mr-2`}>
                        <span className="text-white text-sm font-bold">{stats.review}</span>
                    </div>
                    <span className="text-white text-sm font-medium">복습 중</span>
                </motion.div>
            </div>

            <div className="relative flex flex-col items-center justify-center w-[300px] mx-auto mb-4">
                <div className="w-full">
                    {totalCards > 0 && (
                        <div className="w-[270px] h-4 rounded-full overflow-hidden bg-[#E2DDFF] flex mx-auto">
                            {stats.new > 0 && (
                                <motion.div
                                    className="h-full bg-[#FDFF8C]"
                                    style={{ width: `${newRatio * 100}%` }}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${newRatio * 100}%` }}
                                    transition={{ duration: 1, ease: "easeOut" }}
                                />
                            )}
                            {stats.learning > 0 && (
                                <motion.div
                                    className="h-full bg-white"
                                    style={{ width: `${learningRatio * 100}%` }}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${learningRatio * 100}%` }}
                                    transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                                />
                            )}
                            {stats.review > 0 && (
                                <motion.div
                                    className="h-full bg-[#5F4BB6]"
                                    style={{ width: `${reviewRatio * 100}%` }}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${reviewRatio * 100}%` }}
                                    transition={{ duration: 1, ease: "easeOut", delay: 0.6 }}
                                />
                            )}
                        </div>
                    )}
                </div>

                <motion.img
                    src="/images/reviewloopa.png"
                    alt="Character"
                    className="w-32 h-32 mt-8"
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                />
            </div>

            <motion.div
                className="text-center text-white mb-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 1 }}
            >
                <p className="text-2xl font-bold">{userName}님,</p>
                <p className="text-xl font-bold">반복을 시작해 볼까요?</p>
            </motion.div>

            <motion.div
                className="flex justify-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
            >
                <button
                    onClick={handleStartReview}
                    className="w-full py-4 px-6 rounded-xl bg-white text-[#7969F7] font-bold hover:bg-gray-50 transition-all duration-200 flex items-center justify-center"
                >
                    <span>{stats.due}개 반복 시작하기 </span>
                </button>
            </motion.div>

            {mounted && (
                <AnimatePresence>
                    {showStatsModal && (
                        <StatsModal
                            stats={stats}
                            completionPercentage={completionPercentage}
                            completedCards={completedCards}
                            onClose={() => setShowStatsModal(false)}
                        />
                    )}
                </AnimatePresence>
            )}
        </motion.div>
    )
}

function StatsModal({
    stats,
    completionPercentage,
    completedCards,
    onClose
}: {
    stats: ReviewStats;
    completionPercentage: number;
    completedCards: number;
    onClose: () => void;
}) {
    return createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={onClose}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <h3 className="text-xl font-bold text-gray-800">반복 & 카드 정보</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto">
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-medium text-gray-700 mb-2">카드 상태</h4>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="flex items-center">
                                <div className={`${stats.new >= 100 ? 'w-auto px-2' : 'w-3'} h-3 rounded-full bg-[#FDFF8C] mr-2`}></div>
                                <span className="text-sm text-gray-600">새 카드: {stats.new}</span>
                            </div>
                            <div className="flex items-center">
                                <div className={`${stats.learning >= 100 ? 'w-auto px-2' : 'w-3'} h-3 rounded-full bg-white border border-gray-300 mr-2`}></div>
                                <span className="text-sm text-gray-600">학습 중: {stats.learning}</span>
                            </div>
                            <div className="flex items-center">
                                <div className={`${stats.review >= 100 ? 'w-auto px-2' : 'w-3'} h-3 rounded-full bg-[#5F4BB6] mr-2`}></div>
                                <span className="text-sm text-gray-600">복습 중: {stats.review}</span>
                            </div>
                            <div className="flex items-center">
                                <div className={`${stats.due >= 100 ? 'w-auto px-2' : 'w-3'} h-3 rounded-full bg-green-500 mr-2`}></div>
                                <span className="text-sm text-gray-600">지금 학습 필요: {stats.due}</span>
                            </div>
                        </div>

                        <div className="w-full border-t border-gray-200 pt-3 mt-2">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-gray-800">전체 기억카드</span>
                                <span className="font-bold text-gray-800">{stats.total}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-medium text-gray-700 mb-2">암기 현황</h4>
                        <div className="mb-2">
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-[#7969F7]"
                                    style={{ width: `${completionPercentage}%` }}
                                ></div>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 text-center">{completionPercentage}% 완료</p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-medium text-gray-700 mb-2">카드 상태</h4>
                        <div className="text-sm text-gray-600 space-y-1">
                            <p>* 새 카드: 아직 한번도 학습하지 않은 카드</p>
                            <p>* 학습 중: 학습 단계에 있는 카드</p>
                            <p>* 복습 중: 학습 단계를 졸업하고 장기 기억으로 이동한 카드</p>
                            <p>* 지금 학습 필요: 당장 학습/복습이 필요한 카드</p>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-medium text-gray-700 mb-2">기억 알고리즘</h4>
                        <p className="text-sm text-gray-600 mb-2">
                            LOOPA는 AI를 활용한 자동 기억카드 변환과 간격 반복(Spaced Repetition) 알고리즘을 사용하여 효율적인 기억을 돕습니다.
                        </p>
                        <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">

                        </ul>
                    </div>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
}