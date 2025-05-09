'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'react-hot-toast'
import { useRouter } from 'next/navigation'

interface SnippetBottomSheetProps {
    isOpen: boolean
    onClose: () => void
    headerText: string
    contentId: string
}

type SnippetType = 'summary' | 'question' | 'explanation' | 'custom'

const SnippetBottomSheet: React.FC<SnippetBottomSheetProps> = ({
    isOpen,
    onClose,
    headerText,
    contentId
}) => {
    const router = useRouter()
    const [snippetType, setSnippetType] = useState<SnippetType>('summary')
    const [customQuery, setCustomQuery] = useState('')
    const [isCreating, setIsCreating] = useState(false)

    // 스니펫 생성 함수
    const createSnippet = async () => {
        try {
            setIsCreating(true)

            // 커스텀 타입인데 쿼리가 비어있는 경우 검증
            if (snippetType === 'custom' && !customQuery.trim()) {
                toast.error('커스텀 쿼리를 입력해주세요.')
                return
            }

            // 스니펫 생성 API 호출
            const response = await fetch('/api/snippets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    header_text: headerText,
                    content_id: contentId,
                    snippet_type: snippetType,
                    custom_query: snippetType === 'custom' ? customQuery : undefined
                }),
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.error || '스니펫 생성 중 오류가 발생했습니다.')
            }

            const data = await response.json()
            toast.success('스니펫이 생성되었습니다!')
            onClose()

            // 홈 페이지로 이동 후 스니펫 탭으로 전환하기 위해 쿼리 파라미터 추가
            router.push('/?tab=snippets')
        } catch (error) {
            console.error('스니펗 생성 오류:', error)
            toast.error(error instanceof Error ? error.message : '스니펫 생성 중 오류가 발생했습니다.')
        } finally {
            setIsCreating(false)
        }
    }

    // 스니펫 타입에 따른 설명 텍스트
    const getSnippetTypeDescription = () => {
        switch (snippetType) {
            case 'summary':
                return '이 헤더 섹션의 내용을 요약합니다.'
            case 'question':
                return '이 헤더 섹션의 내용에 대한 질문과 답변을 생성합니다.'
            case 'explanation':
                return '이 헤더 섹션의 내용을 자세히 설명합니다.'
            case 'custom':
                return '직접 작성한 쿼리를 사용하여 스니펫을 생성합니다.'
            default:
                return ''
        }
    }

    // 바텀 시트 외부 클릭 시 닫기 방지
    const handleContentClick = (e: React.MouseEvent) => {
        e.stopPropagation()
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-white rounded-t-xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
                onClick={handleContentClick}
            >
                {/* 헤더 */}
                <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-gray-200 bg-white">
                    <h2 className="text-lg font-bold text-gray-800">스니펫 생성</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 내용 */}
                <div className="p-4">
                    {/* 헤더 텍스트 표시 */}
                    <div className="mb-4">
                        <h3 className="text-sm font-medium text-gray-500 mb-1">선택한 헤더</h3>
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="font-medium text-gray-800">{headerText}</p>
                        </div>
                    </div>

                    {/* 스니펫 타입 선택 */}
                    <div className="mb-4">
                        <h3 className="text-sm font-medium text-gray-500 mb-2">스니펫 타입</h3>
                        <div className="flex flex-col space-y-2">
                            {[
                                { value: 'summary', label: '요약' },
                                { value: 'question', label: '질문' },
                                { value: 'explanation', label: '설명' },
                                { value: 'custom', label: '커스텀' }
                            ].map((type) => (
                                <label key={type.value} className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="snippetType"
                                        value={type.value}
                                        checked={snippetType === type.value}
                                        onChange={() => setSnippetType(type.value as SnippetType)}
                                        className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                                    />
                                    <span className="text-gray-700">{type.label}</span>
                                </label>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">{getSnippetTypeDescription()}</p>
                    </div>

                    {/* 커스텀 쿼리 입력 (커스텀 타입 선택 시) */}
                    {snippetType === 'custom' && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                커스텀 쿼리
                            </label>
                            <textarea
                                value={customQuery}
                                onChange={(e) => setCustomQuery(e.target.value)}
                                placeholder="예: 이 내용의 핵심 아이디어는 무엇인가요?"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                rows={3}
                                required
                            />
                        </div>
                    )}

                    {/* 버튼 */}
                    <div className="flex gap-2 mt-6">
                        <button
                            onClick={createSnippet}
                            disabled={isCreating || (snippetType === 'custom' && !customQuery.trim())}
                            className={`flex-1 py-2 px-4 rounded-md text-white font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${isCreating || (snippetType === 'custom' && !customQuery.trim())
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500'
                                }`}
                        >
                            {isCreating ? '생성 중...' : '스니펫 생성'}
                        </button>
                        <button
                            onClick={onClose}
                            disabled={isCreating}
                            className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-md font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                        >
                            취소
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    )
}

export default SnippetBottomSheet
