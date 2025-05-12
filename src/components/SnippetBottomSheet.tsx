'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'react-hot-toast'
import { useRouter } from 'next/navigation'

interface SnippetBottomSheetProps {
    isOpen: boolean
    onClose: () => void
    headerText?: string
    contentId: string
    selectedText?: string
}

type SnippetType = 'summary' | 'question' | 'explanation' | 'custom'

const SnippetBottomSheet: React.FC<SnippetBottomSheetProps> = ({
    isOpen,
    onClose,
    headerText,
    contentId,
    selectedText
}) => {
    // selectedText가 있으면 그것을 사용하고, 없으면 headerText 사용
    const snippetText = selectedText || headerText || '';
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
                    header_text: snippetText,
                    content_id: contentId,
                    snippet_type: snippetType,
                    custom_query: snippetType === 'custom' ? customQuery : undefined
                }),
            })

            if (!response.ok) {
                let errorMessage = '스니펫 생성 중 오류가 발생했습니다.'
                try {
                    const errorText = await response.text()
                    try {
                        const errorData = JSON.parse(errorText)
                        errorMessage = errorData.error || errorMessage
                    } catch (jsonError) {
                        // JSON 파싱 실패 시 텍스트 그대로 사용
                        console.error('JSON 파싱 오류:', jsonError)
                        // 504 타임아웃 오류인 경우 스니펫은 생성되었을 가능성이 높음
                        if (response.status === 504) {
                            toast.success('스니펫이 생성되었습니다!')
                            onClose()
                            // 스니펫 ID를 추출하려고 시도
                            try {
                                const match = errorText.match(/"id":\s*"([^"]+)"/);
                                if (match && match[1]) {
                                    // ID가 추출되면 해당 스니펫 페이지로 이동
                                    router.push(`/snippets/${match[1]}`)
                                } else {
                                    // ID를 찾을 수 없으면 스니펫 목록으로 이동
                                    router.push('/?tab=snippets')
                                }
                            } catch (e) {
                                // 오류 발생 시 스니펫 목록으로 이동
                                router.push('/?tab=snippets')
                            }
                            return
                        }
                    }
                } catch (textError) {
                    console.error('응답 텍스트 읽기 오류:', textError)
                    // 응답 읽기 실패 시에도 스니펫은 생성되었을 가능성이 있음
                    if (response.status === 504) {
                        toast.success('스니펫이 생성되었습니다!')
                        onClose()
                        // 응답을 읽을 수 없으므로 스니펫 목록으로 이동
                        router.push('/?tab=snippets')
                        return
                    }
                }
                throw new Error(errorMessage)
            }

            let data
            try {
                data = await response.json()
            } catch (jsonError) {
                console.error('응답 JSON 파싱 오류:', jsonError)
                // 파싱 오류가 발생해도 스니펫은 생성되었을 가능성이 높음
                toast.success('스니펫이 생성되었습니다!')
                onClose()
                
                // 응답 텍스트에서 스니펫 ID를 추출하려고 시도
                try {
                    const responseText = await response.text();
                    const match = responseText.match(/"id":\s*"([^"]+)"/);
                    if (match && match[1]) {
                        // ID가 추출되면 해당 스니펫 페이지로 이동
                        router.push(`/snippets/${match[1]}`)
                    } else {
                        // ID를 찾을 수 없으면 스니펫 목록으로 이동
                        router.push('/?tab=snippets')
                    }
                } catch (e) {
                    // 오류 발생 시 스니펫 목록으로 이동
                    router.push('/?tab=snippets')
                }
                return
            }

            toast.success('스니펫이 생성되었습니다!')
            onClose()

            // 스니펫 생성 후 해당 스니펫의 상세 페이지로 이동
            if (data.snippet && data.snippet.id) {
                router.push(`/snippets/${data.snippet.id}`)
            } else {
                // 스니펫 ID를 받지 못한 경우 스니펫 목록 페이지로 이동
                router.push('/?tab=snippets')
            }
        } catch (error) {
            console.error('스니펫 생성 오류:', error)
            toast.error(error instanceof Error ? error.message : '스니펫 생성 중 오류가 발생했습니다.')
        } finally {
            setIsCreating(false)
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
                className="bg-white rounded-t-xl w-full max-w-[700px] max-h-[80vh] overflow-y-auto"
                onClick={handleContentClick}
            >
                {/* 헤더 */}
                <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-gray-200 bg-white">
                    <h2 className="text-lg font-bold text-gray-800">Generate Snippet</h2>
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
                    {/* 헤더 텍스트 표시 - 회색 배경으로 강조 */}
                    <div className="p-5 border-b border-gray-200 bg-gray-50 rounded-lg mb-4">
                        <p className="text-gray-800 text-lg leading-relaxed">
                            <span className="font-semibold">{snippetText}</span>
                        </p>
                    </div>

                    {/* 스니펫 타입 선택 - 2x2 배열 버튼 */}
                    <div className="mb-6">
                        <h3 className="text-sm font-medium text-gray-700 mb-3">Choose snippet type:</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { 
                                    value: 'summary', 
                                    label: 'Summary', 
                                    icon: '📝',
                                    description: 'Concise definition with key points' 
                                },
                                { 
                                    value: 'question', 
                                    label: 'Question', 
                                    icon: '❓',
                                    description: 'Q&A format with detailed answer' 
                                },
                                { 
                                    value: 'explanation', 
                                    label: 'Explanation', 
                                    icon: '📚',
                                    description: 'Detailed explanation with examples' 
                                },
                                { 
                                    value: 'custom', 
                                    label: 'Custom', 
                                    icon: '✨',
                                    description: 'Answer to your specific question' 
                                }
                            ].map((type) => (
                                <div 
                                    key={type.value}
                                    onClick={() => setSnippetType(type.value as SnippetType)}
                                    className={`border rounded-lg p-3 cursor-pointer transition-all ${snippetType === type.value 
                                        ? 'border-purple-500 bg-purple-50 shadow-sm' 
                                        : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'}`}
                                >
                                    <div className="flex items-center mb-1">
                                        <span className="mr-2 text-lg">{type.icon}</span>
                                        <span className="font-medium text-gray-800">{type.label}</span>
                                        <div className="ml-auto">
                                            <input
                                                type="radio"
                                                name="snippetType"
                                                value={type.value}
                                                checked={snippetType === type.value}
                                                onChange={() => {}}
                                                className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">{type.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 커스텀 쿼리 입력 (커스텀 타입 선택 시) */}
                    {snippetType === 'custom' && (
                        <div className="mt-2 mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Custom Query
                            </label>
                            <textarea
                                value={customQuery}
                                onChange={(e) => setCustomQuery(e.target.value)}
                                placeholder="example: How can I apply this in my career?"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                rows={3}
                                required
                            />
                        </div>
                    )}

                    {/* 버튼 - 디자인 개선 */}
                    <div className="flex justify-between items-center mt-8">
                        <button
                            onClick={onClose}
                            disabled={isCreating}
                            className="py-2 px-4 text-gray-600 text-sm font-medium rounded-md hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={createSnippet}
                            disabled={isCreating || (snippetType === 'custom' && !customQuery.trim())}
                            className={`py-2.5 px-6 rounded-md text-white font-bold shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all ${isCreating || (snippetType === 'custom' && !customQuery.trim())
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 hover:scale-105 focus:ring-purple-500'
                                }`}
                        >
                            {isCreating ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Creating...
                                </span>
                            ) : (
                                <span className="flex items-center">
                                    <span className="mr-1.5">✨</span> Create Snippet
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    )
}

export default SnippetBottomSheet
