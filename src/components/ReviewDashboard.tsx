'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

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
        return (
            <div className="bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 shadow-lg p-6 mb-6">
                <div className="flex items-center mb-6">
                    <img
                        src="/images/doneloopa.png"
                        alt="No cards character"
                        className="w-20 h-20"
                    />
                    <div className="ml-4">
                        <p className="text-lg font-medium text-gray-800">
                            {userName}님,<br />
                            기억할 카드가 없어요!
                        </p>
                    </div>
                </div>

                {/* 복습 통계 */}
                <div className="grid grid-cols-4 gap-2 mb-6">
                    <div className="text-center">
                        <p className="text-blue-600 text-xl font-medium">{stats.new}</p>
                        <p className="text-gray-500 text-xs">새 카드</p>
                    </div>
                    <div className="text-center">
                        <p className="text-orange-600 text-xl font-medium">{stats.learning}</p>
                        <p className="text-gray-500 text-xs">학습 중</p>
                    </div>
                    <div className="text-center">
                        <p className="text-purple-600 text-xl font-medium">{stats.review}</p>
                        <p className="text-gray-500 text-xs">복습 중</p>
                    </div>
                    <div className="text-center">
                        <p className="text-gray-800 text-xl font-medium">{stats.total}</p>
                        <p className="text-gray-500 text-xs">전체 카드</p>
                    </div>
                </div>

                {/* 아이디어 추가 버튼 */}
                <div className="flex justify-center">
                    <button
                        onClick={handleAddIdea}
                        className="w-full py-4 px-6 rounded-xl bg-white border border-[#D4C4B7] text-[#7969F7] font-medium hover:bg-gray-50 transition-all duration-200 flex items-center justify-center"
                    >
                        <span>기억하고 싶은 아이디어 추가하기</span>
                        <span className="ml-2 text-[#7969F7] text-lg">+</span>
                    </button>
                </div>
            </div>
        )
    }

    // 복습할 카드가 있는 경우
    return (
        <div className="bg-white/80 backdrop-blur-md rounded-xl shadow-lg p-5 mb-6">
            <div className="flex items-center mb-6">
                <img
                    src="/images/reviewloopa.png"
                    alt="Study character"
                    className="w-20 h-20"
                />
                <div className="ml-4">
                    <p className="text-xl font-bold text-gray-800">
                        {userName}님,<br />
                        학습을 시작해 볼까요?
                    </p>
                </div>
            </div>

            {/* 복습 통계 */}
            <div className="grid grid-cols-4 gap-2 mb-6">
                <div className="text-center">
                    <p className="text-blue-600 text-xl font-light">{stats.new}</p>
                    <p className="text-gray-500 text-xs font-bold">새 카드</p>
                </div>
                <div className="text-center">
                    <p className="text-orange-600 text-xl font-light">{stats.learning}</p>
                    <p className="text-gray-500 text-xs font-bold">학습 중</p>
                </div>
                <div className="text-center">
                    <p className="text-purple-600 text-xl font-light">{stats.review}</p>
                    <p className="text-gray-500 text-xs font-bold">복습 중</p>
                </div>
                <div className="text-center">
                    <p className="text-gray-800 text-xl font-light">{stats.total}</p>
                    <p className="text-gray-500 text-xs font-bold">전체 카드</p>
                </div>
            </div>

            {/* 복습 시작 버튼 */}
            <div className="flex flex-col items-center">
                <button
                    onClick={handleStartReview}
                    className="w-full py-4 px-6 rounded-xl bg-[#7969F7] text-white font-bold hover:bg-[#6858e6] transition-all duration-200 flex items-center justify-center"
                >
                    <span className="mr-2">🔥</span>
                    <span>{stats.due}개 카드 복습 시작하기</span>
                </button>
                <p className="text-xs text-gray-500 mt-2 text-center">
                    가장 잘 기억할 수 있도록 순서와 간격이 실시간으로 조정돼요
                </p>
            </div>
        </div>
    )
}