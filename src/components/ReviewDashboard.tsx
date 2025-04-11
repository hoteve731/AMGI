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

export default function ReviewDashboard() {
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

                // 세션에서 사용자 ID 가져오기
                const { data: { session } } = await supabase.auth.getSession()
                const userId = session?.user?.id

                if (!userId) {
                    console.log('No user ID found in session, continuing anyway')
                }

                // API 요청 보내기
                const response = await fetch('/api/review', {
                    headers: {
                        'Content-Type': 'application/json',
                        // 사용자 ID가 있으면 Authorization 헤더에 포함
                        ...(userId && { 'Authorization': `Bearer ${userId}` })
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

                if (result.error) {
                    console.error('API error:', result.error)
                    setError(`데이터를 불러오는 중 오류가 발생했습니다: ${result.error}`)
                }

                if (result.stats) {
                    setStats(result.stats)
                }

                setIsLoading(false)
            } catch (error) {
                console.error('Error fetching review stats:', error)
                setError(error instanceof Error ? error.message : '데이터를 불러오는 중 오류가 발생했습니다.')
                setIsLoading(false)
            }
        }

        fetchReviewStats()
    }, [supabase])

    const handleStartReview = () => {
        router.push('/review')
    }

    if (isLoading) {
        return (
            <div className="bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 shadow-lg p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800">복습</h2>
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-transparent animate-spin"></div>
                </div>
                <div className="h-24 flex items-center justify-center">
                    <p className="text-gray-500">복습 정보를 불러오는 중...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 shadow-lg p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">복습</h2>
                <div className="text-center py-6">
                    <p className="text-gray-500 mb-4">{error}</p>
                </div>
            </div>
        )
    }

    if (needsMigration) {
        return (
            <div className="bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 shadow-lg p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">복습</h2>
                <div className="text-center py-6">
                    <p className="text-gray-500 mb-4">데이터베이스 마이그레이션이 필요합니다.</p>
                    <p className="text-sm text-gray-400">
                        데이터베이스를 마이그레이션한 후 다시 시도해 주세요.
                    </p>
                </div>
            </div>
        )
    }

    if (stats.total === 0) {
        return (
            <div className="bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 shadow-lg p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">복습</h2>
                <div className="text-center py-6">
                    <p className="text-gray-500 mb-4">아직 복습할 카드가 없습니다.</p>
                    <p className="text-sm text-gray-400">
                        콘텐츠를 추가하면 자동으로 복습 카드가 생성됩니다.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">복습</h2>

            {/* 복습 통계 */}
            <div className="grid grid-cols-4 gap-2 mb-6">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-blue-600 text-xl font-bold">{stats.new}</p>
                    <p className="text-blue-500 text-sm">새 카드</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center">
                    <p className="text-orange-600 text-xl font-bold">{stats.learning}</p>
                    <p className="text-orange-500 text-sm">학습 중</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <p className="text-purple-600 text-xl font-bold">{stats.review}</p>
                    <p className="text-purple-500 text-sm">복습</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-green-600 text-xl font-bold">{stats.total}</p>
                    <p className="text-green-500 text-sm">전체</p>
                </div>
            </div>

            {/* 복습 시작 버튼 */}
            <div className="flex justify-center">
                <button
                    onClick={handleStartReview}
                    disabled={stats.due === 0}
                    className={`
            py-3 px-6 rounded-lg font-medium transition-all duration-200
            ${stats.due > 0
                            ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md hover:shadow-lg'
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }
          `}
                >
                    {stats.due > 0
                        ? `${stats.due}개 카드 복습하기`
                        : '복습할 카드가 없습니다'
                    }
                </button>
            </div>
        </div>
    )
}