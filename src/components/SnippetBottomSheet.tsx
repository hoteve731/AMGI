'use client'

import { useState, useMemo } from 'react'
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

    // 선택된 텍스트 길이 제한 (150자)
    const MAX_TEXT_LENGTH = 150;

    // 텍스트 길이 검사 및 경고 메시지
    const { isTextTooLong, textLengthWarning } = useMemo(() => {
        const textLength = snippetText.length;
        const isTextTooLong = textLength > MAX_TEXT_LENGTH;
        let textLengthWarning = '';

        if (isTextTooLong) {
            textLengthWarning = `Selected text is too long (${textLength}/${MAX_TEXT_LENGTH} characters). Please select a shorter text.`;
        }

        return { isTextTooLong, textLengthWarning };
    }, [snippetText]);

    // 임시 ID 생성 함수 (UUID v4 형식)
    const generateTempId = () => {
        return 'temp-' +
            ([1e7] as any + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g,
                (c: any) => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
            );
    }

    // 스니펫 생성 함수
    const createSnippet = async () => {
        try {
            setIsCreating(true)

            // 커스텀 타입인데 쿼리가 비어있는 경우 검증
            if (snippetType === 'custom' && !customQuery.trim()) {
                toast.error('Please enter a custom query.')
                return
            }

            // 스니펫 생성 요청 데이터
            const snippetData = {
                header_text: snippetText,
                content_id: contentId,
                snippet_type: snippetType,
                custom_query: snippetType === 'custom' ? customQuery : undefined
            }

            // 임시 ID 생성 및 로컬 스토리지에 요청 데이터 저장
            const tempId = generateTempId()
            localStorage.setItem(`snippet_request_${tempId}`, JSON.stringify({
                ...snippetData,
                timestamp: new Date().toISOString(),
                status: 'pending'
            }))

            // 스니펫 생성 중임을 표시
            toast.loading('Creating snippet...', { id: 'creating-snippet' })
            onClose()
            
            // 임시 ID로 먼저 리다이렉트
            router.replace(`/snippets/${tempId}`)

            // 백그라운드에서 API 호출 계속 진행
            try {
                const response = await fetch('/api/snippets', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(snippetData),
                })

                let snippetId = null

                // 응답 처리
                if (response.ok) {
                    try {
                        const data = await response.json()
                        if (data.snippet && data.snippet.id) {
                            snippetId = data.snippet.id
                            // 성공 시 로컬 스토리지 업데이트
                            localStorage.setItem(`snippet_request_${tempId}`, JSON.stringify({
                                ...snippetData,
                                id: snippetId,
                                timestamp: new Date().toISOString(),
                                status: 'success'
                            }))
                            // 성공 메시지 표시
                            toast.success('Snippet created successfully', { id: 'creating-snippet' })
                            // 이미 리다이렉트되었으므로 여기서는 URL만 조용히 업데이트
                            if (window.history && typeof window.history.replaceState === 'function') {
                                window.history.replaceState(null, '', `/snippets/${snippetId}`)
                            }
                        }
                    } catch (jsonError) {
                        console.error('Response JSON parsing error:', jsonError)
                        // 응답 텍스트에서 ID 추출 시도
                        try {
                            const responseText = await response.text()
                            const match = responseText.match(/"id":\s*"([^"]+)"/)
                            if (match && match[1]) {
                                snippetId = match[1]
                                // ID를 찾았으면 로컬 스토리지 업데이트
                                localStorage.setItem(`snippet_request_${tempId}`, JSON.stringify({
                                    ...snippetData,
                                    id: snippetId,
                                    timestamp: new Date().toISOString(),
                                    status: 'success'
                                }))
                                // 성공 메시지 표시
                                toast.success('Snippet created successfully', { id: 'creating-snippet' })
                                // URL만 조용히 업데이트
                                if (window.history && typeof window.history.replaceState === 'function') {
                                    window.history.replaceState(null, '', `/snippets/${snippetId}`)
                                }
                            }
                        } catch (e) {
                            console.error('응답 텍스트 읽기 오류:', e)
                        }
                    }
                } else {
                    // 오류 응답 처리
                    try {
                        const errorText = await response.text()
                        // 응답 텍스트에서 ID 추출 시도
                        const match = errorText.match(/"id":\s*"([^"]+)"/)
                        if (match && match[1]) {
                            snippetId = match[1]
                            // ID를 찾았으면 로컬 스토리지 업데이트
                            localStorage.setItem(`snippet_request_${tempId}`, JSON.stringify({
                                ...snippetData,
                                id: snippetId,
                                timestamp: new Date().toISOString(),
                                status: 'success'
                            }))
                            // 성공 메시지 표시
                            toast.success('Snippet created successfully', { id: 'creating-snippet' })
                            // URL만 조용히 업데이트
                            if (window.history && typeof window.history.replaceState === 'function') {
                                window.history.replaceState(null, '', `/snippets/${snippetId}`)
                            }
                        }

                        // 504 Gateway Timeout 오류인 경우에도 스니펫이 생성되었을 수 있음
                        if (response.status === 504) {
                            console.log('504 Gateway Timeout, but snippet might be created')
                        }
                    } catch (textError) {
                        console.error('응답 텍스트 읽기 오류:', textError)
                    }
                }
            } catch (apiError) {
                console.error('API 호출 오류:', apiError)
                // API 호출 실패 시에도 로컬 스토리지 상태 업데이트
                localStorage.setItem(`snippet_request_${tempId}`, JSON.stringify({
                    ...snippetData,
                    timestamp: new Date().toISOString(),
                    status: 'error',
                    error: apiError instanceof Error ? apiError.message : 'Unknown error'
                }))
                // 오류 메시지 표시
                toast.error('Failed to create snippet. Please try again.', { id: 'creating-snippet' })
            }
        } catch (error) {
            console.error('스니펫 생성 오류:', error)
            toast.error(error instanceof Error ? error.message : '스니펫 생성 중 오류가 발생했습니다.')
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

                        {/* 텍스트 길이 경고 메시지 */}
                        {isTextTooLong && (
                            <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-md">
                                <p className="text-amber-600 text-sm flex items-center">
                                    <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    {textLengthWarning}
                                </p>
                                <p className="text-amber-500 text-xs mt-1 ml-5">
                                    스니펫은 위키 항목처럼 짧고 정확한 정보를 담고 있어야 합니다.
                                </p>
                            </div>
                        )}
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
                                                onChange={() => { }}
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
                            disabled={isCreating || isTextTooLong || (snippetType === 'custom' && !customQuery.trim())}
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
