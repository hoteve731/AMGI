'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MigratePage() {
    const [isLoading, setIsLoading] = useState(false)
    const [result, setResult] = useState<{ success?: boolean; message?: string; error?: string }>({})
    const router = useRouter()

    const handleMigration = async () => {
        if (isLoading) return

        if (!confirm('정말로 contents 테이블에서 status 필드를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
            return
        }

        setIsLoading(true)
        setResult({})

        try {
            const response = await fetch('/api/migrate-drop-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            const data = await response.json()

            if (!response.ok) {
                setResult({
                    success: false,
                    error: data.error || '마이그레이션 중 오류가 발생했습니다.'
                })
            } else {
                setResult({
                    success: true,
                    message: data.message || '마이그레이션이 성공적으로 완료되었습니다.'
                })
            }
        } catch (error) {
            setResult({
                success: false,
                error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#F3F5FD] to-[#E8D9C5] flex flex-col">
            <header className="bg-[#F3F5FD] border-b border-[#D4C4B7] p-4">
                <div className="flex items-center justify-between max-w-4xl mx-auto">
                    <h1 className="text-xl font-bold text-[#7969F7]">관리자 - 데이터베이스 마이그레이션</h1>
                    <button
                        onClick={() => router.push('/')}
                        className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                    >
                        홈으로
                    </button>
                </div>
            </header>

            <main className="flex-1 p-4">
                <div className="max-w-lg mx-auto bg-white rounded-xl shadow-md p-6 mt-6">
                    <h2 className="text-xl font-bold mb-4">status 필드 삭제 마이그레이션</h2>
                    <p className="mb-6 text-gray-600">
                        이 마이그레이션은 contents 테이블에서 status 필드를 완전히 제거합니다.
                        이 작업은 되돌릴 수 없으므로 주의하세요.
                    </p>

                    {result.success && (
                        <div className="mb-4 p-3 bg-green-100 text-green-800 rounded-lg">
                            {result.message}
                        </div>
                    )}

                    {result.error && (
                        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg">
                            오류: {result.error}
                        </div>
                    )}

                    <button
                        onClick={handleMigration}
                        disabled={isLoading}
                        className={`
              w-full py-3 rounded-lg font-medium
              ${isLoading
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-[#7969F7] text-white hover:bg-[#6859E7] transition'}
            `}
                    >
                        {isLoading ? '처리 중...' : 'status 필드 삭제 실행'}
                    </button>
                </div>
            </main>
        </div>
    )
} 