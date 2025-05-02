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
                        <span className="text-white text-2xl font-bold">/{stats.total}Completed</span>
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
                        <span className="text-white text-sm font-medium">New</span>
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
                        <span className="text-white text-sm font-medium">Learning</span>
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
                        <span className="text-white text-sm font-medium">Review</span>
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
                    <p className="text-xl font-bold">{userName},</p>
                    <p className="text-xl font-bold">All cards are completed!</p>
                </motion.div>

                <motion.div
                    className="flex justify-center"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2 }}
                >
                    <button
                        onClick={handleAddIdea}
                        className="w-full py-4 px-6 rounded-xl bg-white text-[#7969F7] font-semibold hover:bg-gray-50 transition-all duration-200 flex items-center justify-center"
                    >
                        <span>Add Text to Remember</span>
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
                    <span className="text-[#5F4BB6] text-3xl font-bold">/{stats.total} Completed</span>
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
                    <span className="text-white text-sm font-medium">New</span>
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
                    <span className="text-white text-sm font-medium">Learning</span>
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
                    <span className="text-white text-sm font-medium">Review</span>
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
                <p className="text-2xl font-bold">Welcome, {userName}!</p>
                <p className="text-xl font-bold">Let's start reviewing!</p>
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
                    <span>{stats.due} cards to review</span>
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
                    <h3 className="text-xl font-bold text-gray-800">How to Use</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-8 overflow-y-auto">
                    <div className="text-center mb-2">
                        <p className="text-xl font-semibold text-gray-700 leading-relaxed">
                            ✨ Review cards at optimal intervals to strengthen your memory ✨
                        </p>
                    </div>

                    <div>
                        <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                            <span className="mr-2">📊</span> Card Status
                        </h4>
                        <div className="text-sm text-gray-600 space-y-1 ml-6">
                            <p>• New: First-time cards</p>
                            <p>• Learning: Short interval cards</p>
                            <p>• Review: Long interval cards</p>
                            <p>• Due: Today's cards</p>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                            <span className="mr-2">🧠</span> Memory Algorithm
                        </h4>
                        <div className="text-sm text-gray-600 space-y-1 ml-6">
                            <p>• ❌ Forgotten: Reset learning</p>
                            <p>• 😐 Recalled partially: Shorter interval</p>
                            <p>• 😄 Recalled with effort: Standard interval</p>
                            <p>• 👑 Immediately: Longer interval</p>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
}