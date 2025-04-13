'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { motion, AnimatePresence } from 'framer-motion'
import { InformationCircleIcon } from '@heroicons/react/24/outline'

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
    const [error, setError] = useState<string | null>(null)
    const [needsMigration, setNeedsMigration] = useState(false)
    const [animateProgress, setAnimateProgress] = useState(false)
    const [showStatsModal, setShowStatsModal] = useState(false)

    useEffect(() => {
        const fetchReviewStats = async () => {
            try {
                console.log('Fetching review stats...')
                setIsLoading(true)
                setError(null)

                // API 요청 보내기 - 인증은 세션 쿠키로 처리
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

                if (result.needsMigration) {
                    setNeedsMigration(true)
                }

                console.log('Review stats:', result.stats)
                setStats(result.stats)

                // Trigger animation after data is loaded
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

    const handleStartReview = () => {
        router.push('/review')
    }

    const handleAddIdea = () => {
        // 바텀시트 열기 - CustomEvent 사용
        console.log('바텀시트 열기 이벤트 발생시키기')
        const event = new CustomEvent('openBottomSheet')
        window.dispatchEvent(event)
    }

    // 완료된 카드 수와 완료율 계산
    const completedCards = stats.total - stats.due;
    const completionPercentage = stats.total > 0 ? Math.round((completedCards / stats.total) * 100) : 100;

    // 새 카드, 학습 중, 복습 중의 비율 계산
    const totalCards = stats.new + stats.learning + stats.review;
    const newRatio = totalCards > 0 ? stats.new / totalCards : 0;
    const learningRatio = totalCards > 0 ? stats.learning / totalCards : 0;
    const reviewRatio = totalCards > 0 ? stats.review / totalCards : 0;

    // 디버깅을 위한 로그 추가
    console.log('Rendering Arch - Stats:', stats);
    console.log('Rendering Arch - TotalCards for Ratio:', totalCards);
    console.log('Rendering Arch - Ratios:', { newRatio, learningRatio, reviewRatio });

    if (isLoading) {
        return (
            <div className="bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 shadow-lg p-6 mb-6">
                <div className="flex items-center justify-center h-24">
                    <div className="w-6 h-6 rounded-full border-2 border-purple-300 border-t-transparent animate-spin"></div>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 shadow-lg p-6 mb-6">
                <div className="text-center py-4">
                    <p className="text-gray-500">{error}</p>
                </div>
            </div>
        )
    }

    if (needsMigration) {
        return (
            <div className="bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 shadow-lg p-6 mb-6">
                <div className="text-center py-4">
                    <p className="text-gray-500">데이터베이스 마이그레이션이 필요합니다.</p>
                </div>
            </div>
        )
    }

    // 복습할 카드가 없는 경우
    if (stats.due === 0) {
        console.log('Rendering Arch (Due === 0) - Stats:', stats); // 이 블록 내부에서도 로그 추가
        console.log('Rendering Arch (Due === 0) - TotalCards:', totalCards);
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-[#B4B6E4] backdrop-blur-md rounded-3xl shadow-lg p-6 mb-6"
            >
                {/* 상단 카드 상태 표시와 정보 버튼 */}
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

                {/* 카드 타입 카운터 - 가로 정렬 */}
                <div className="flex justify-center space-x-6 mb-4">
                    <motion.div
                        className="flex items-center"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4, delay: 0.4 }}
                    >
                        <div className="w-6 h-6 rounded-full bg-[#FDFF8C] flex items-center justify-center mr-2">
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
                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center mr-2">
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
                        <div className="w-6 h-6 rounded-full bg-[#5F4BB6] flex items-center justify-center mr-2">
                            <span className="text-white text-sm font-bold">{stats.review}</span>
                        </div>
                        <span className="text-white text-sm font-medium">복습 중</span>
                    </motion.div>
                </div>

                {/* 프로그레스 바 */}
                <div className="relative flex flex-col items-center justify-center w-[300px] mx-auto mb-6">
                    {/* 카드 타입별 프로그레스 바 */}
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

                    {/* 캐릭터 */}
                    <motion.img
                        src="/images/doneloopa.png"
                        alt="Character"
                        className="w-32 h-32 mt-4"
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                    />
                </div>

                {/* 사용자 이름과 메시지 */}
                <motion.div
                    className="text-center text-white mt-2 mb-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 1 }}
                >
                    <p className="text-xl font-bold">{userName}님,</p>
                    <p className="text-xl font-bold">모든 카드를 완료했어요!</p>
                </motion.div>

                {/* 아이디어 추가 버튼 */}
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
                        <span>기억하고 싶은 아이디어 추가하기</span>
                        <span className="ml-2 text-[#7969F7] text-lg">+</span>
                    </button>
                </motion.div>
            </motion.div>
        )
    }

    console.log('Rendering Arch (Due > 0) - Stats:', stats); // 이 블록 내부에서도 로그 추가
    console.log('Rendering Arch (Due > 0) - TotalCards:', totalCards);
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-[#B4B6E4] backdrop-blur-md rounded-3xl shadow-lg p-6 mb-6"
        >
            {/* 상단 카드 상태 표시 */}
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

            {/* 카드 타입 카운터 - 가로 정렬 */}
            <div className="flex justify-center space-x-6 mb-4">
                <motion.div
                    className="flex items-center"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.4 }}
                >
                    <div className="w-6 h-6 rounded-full bg-[#FDFF8C] flex items-center justify-center mr-2">
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
                    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center mr-2">
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
                    <div className="w-6 h-6 rounded-full bg-[#5F4BB6] flex items-center justify-center mr-2">
                        <span className="text-white text-sm font-bold">{stats.review}</span>
                    </div>
                    <span className="text-white text-sm font-medium">복습 중</span>
                </motion.div>
            </div>

            {/* 프로그레스 바 */}
            <div className="relative flex flex-col items-center justify-center w-[300px] mx-auto mb-4">
                {/* 카드 타입별 프로그레스 바 */}
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

                {/* 캐릭터 */}
                <motion.img
                    src="/images/reviewloopa.png"
                    alt="Character"
                    className="w-32 h-32 mt-8"
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                />
            </div>

            {/* 사용자 이름과 메시지 */}
            <motion.div
                className="text-center text-white mb-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 1 }}
            >
                <p className="text-2xl font-bold">{userName}님,</p>
                <p className="text-xl font-bold">학습을 시작해 볼까요?</p>
            </motion.div>

            {/* 복습 시작 버튼 */}
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
                    <span>{stats.due}개 바로 학습하기 </span>
                </button>
            </motion.div>

            {/* 통계 모달 */}
            <AnimatePresence>
                {showStatsModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                        onClick={() => setShowStatsModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-xl p-6 w-full max-w-md mx-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-xl font-bold text-gray-800 mb-4">기억카드 통계</h3>

                            <table className="w-full mb-4">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-2 text-gray-600">상태</th>
                                        <th className="text-right py-2 text-gray-600">개수</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-gray-100">
                                        <td className="py-2 text-gray-800">새 카드</td>
                                        <td className="py-2 text-right font-bold text-gray-800">{stats.new}</td>
                                    </tr>
                                    <tr className="border-b border-gray-100">
                                        <td className="py-2 text-gray-800">학습 중</td>
                                        <td className="py-2 text-right font-bold text-gray-800">{stats.learning}</td>
                                    </tr>
                                    <tr className="border-b border-gray-100">
                                        <td className="py-2 text-gray-800">복습 중</td>
                                        <td className="py-2 text-right font-bold text-gray-800">{stats.review}</td>
                                    </tr>
                                    <tr className="border-b border-gray-100">
                                        <td className="py-2 text-gray-800">지금 학습 필요</td>
                                        <td className="py-2 text-right font-bold text-gray-800">{stats.due}</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 text-gray-800 font-bold">전체 기억카드</td>
                                        <td className="py-2 text-right font-bold text-gray-800">{stats.total}</td>
                                    </tr>
                                </tbody>
                            </table>

                            <div className="text-sm text-gray-500 mb-4">
                                <p>* 새 카드: 아직 한번도 학습하지 않은 카드</p>
                                <p>* 학습 중: 학습 단계에 있는 카드</p>
                                <p>* 복습 중: 학습 단계를 졸업하고 장기 기억으로 이동한 카드</p>
                                <p>* 지금 학습 필요: 당장 학습/복습이 필요한 카드</p>
                            </div>

                            <button
                                onClick={() => setShowStatsModal(false)}
                                className="w-full py-2 rounded-lg bg-gray-100 text-gray-800 font-medium hover:bg-gray-200 transition-colors"
                            >
                                닫기
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}