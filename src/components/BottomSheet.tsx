'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LoadingScreen from './LoadingScreen'

export default function BottomSheet() {
    const [text, setText] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [loadingStatus, setLoadingStatus] = useState<'title' | 'content' | 'group' | 'chunk' | 'complete'>('title')
    const [loadingProgress, setLoadingProgress] = useState(0)
    const [generatedTitle, setGeneratedTitle] = useState('')
    const [isExpanded, setIsExpanded] = useState(false)
    const [preview, setPreview] = useState<{
        title: string
        chunks: { summary: string }[]
    } | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setLoadingProgress(0)
        setLoadingStatus('title')
        setIsExpanded(false)

        try {
            // 콘텐츠 생성 (제목, 내용, 그룹 모두 포함)
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text }),
            })

            // 응답이 JSON이 아닌 경우를 처리
            let data;
            try {
                const textData = await response.text();
                try {
                    data = JSON.parse(textData);
                } catch (parseError) {
                    console.error('JSON 파싱 오류:', parseError);
                    console.error('응답 내용:', textData);
                    throw new Error(`응답을 파싱할 수 없습니다: ${textData.substring(0, 100)}...`);
                }
            } catch (textError) {
                console.error('응답 텍스트 읽기 오류:', textError);
                throw new Error('서버 응답을 읽을 수 없습니다.');
            }

            if (!response.ok) {
                throw new Error(data.error || '콘텐츠 생성에 실패했습니다.')
            }

            // 제목 생성 완료 (약 20%)
            setLoadingProgress(20)

            // 내용이 처리 중인 상태인 경우 폴링 시작
            if (data.status === 'processing') {
                // 내용 생성 중 (약 40%)
                setLoadingProgress(40)
                setLoadingStatus('content')

                // 그룹 생성 중 (약 60%)
                setLoadingProgress(60)

                // 폴링을 통해 콘텐츠 처리 상태 확인
                await pollContentStatus(data.content_id);
                return;
            }

            // API 응답 처리 과정에 따라 프로그레스 바 업데이트
            // 내용 생성 중 (약 40%)
            setLoadingProgress(40)
            setLoadingStatus('content')

            // 그룹 생성 중 (약 60%)
            setLoadingProgress(60)

            // 청크 생성 중 (약 80%)
            setLoadingProgress(80)
            setLoadingStatus('group')

            // 마스킹 처리 중 (약 90%)
            setLoadingProgress(90)

            // 완료 (100%)
            setLoadingProgress(100)

            // 콘텐츠 생성 후 홈으로 이동하기 전에 백그라운드 처리가 완료될 때까지 기다림
            await pollContentStatus(data.content_id)
        } catch (error) {
            console.error('Error:', error)
            alert(error instanceof Error ? error.message : '오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
            setLoadingProgress(0)
            setText('')
        }
    }

    // 콘텐츠 처리 상태를 주기적으로 확인하는 폴링 함수
    const pollContentStatus = async (contentId: string) => {
        try {
            // 청크 생성 중 (약 80%)
            setLoadingProgress(80)
            setLoadingStatus('group')

            // 잠시 대기 후 청크 생성 단계로 진행
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 청크 생성 중 (약 95%)
            setLoadingProgress(95)
            setLoadingStatus('chunk')

            // 잠시 대기 후 완료 단계로 진행
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 완료 (100%)
            setLoadingProgress(100)
            setLoadingStatus('complete')

            // 완료 메시지 표시를 위해 잠시 대기
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 완료되면 홈으로 이동
            window.location.href = '/'
        } catch (error) {
            console.error('Error:', error)
            // 오류 발생 시 홈으로 이동
            window.location.href = '/'
        }
    };

    const handleConfirm = () => {
        setPreview(null)

        // Force a complete page reload to ensure fresh data
        window.location.href = '/'
    }

    const expandSheet = () => {
        setIsExpanded(true)
        // Focus the textarea after expansion animation completes
        setTimeout(() => {
            textareaRef.current?.focus()
        }, 300)
    }

    const collapseSheet = () => {
        setIsExpanded(false)
    }

    // Close sheet on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isExpanded) {
                collapseSheet()
            }
        }

        window.addEventListener('keydown', handleEscape)
        return () => window.removeEventListener('keydown', handleEscape)
    }, [isExpanded])

    if (isLoading) {
        return <LoadingScreen
            progress={loadingProgress}
            status={loadingStatus}
        />
    }

    if (preview) {
        return (
            <motion.div
                className="fixed inset-0 bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5] z-40 overflow-y-auto p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <div className="max-w-2xl mx-auto">
                    <h1 className="text-2xl font-bold mb-4 text-[#7969F7]">{preview.title}</h1>
                    <div className="space-y-4">
                        {preview.chunks.map((chunk, index) => (
                            <motion.div
                                key={index}
                                className="p-4 bg-white/70 backdrop-blur-md rounded-lg border border-[#D4C4B7] shadow-sm"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                            >
                                <p>{chunk.summary}</p>
                            </motion.div>
                        ))}
                    </div>
                    <motion.button
                        onClick={handleConfirm}
                        className="fixed bottom-4 left-1/2 transform -translate-x-1/2 px-8 py-3.5 bg-gradient-to-r from-[#7969F7] to-[#A99BFF] text-white rounded-full shadow-lg"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        홈으로 가기
                    </motion.button>
                </div>
            </motion.div>
        )
    }

    return (
        <>
            <motion.div
                className="fixed inset-x-0 bottom-0 z-[60]"
                initial={{ y: 0 }}
                animate={{ y: 0 }}
            >
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[65]"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            onClick={collapseSheet}
                        />
                    )}
                </AnimatePresence>

                {/* 외부 컨테이너: 세이프 에리어 패딩 적용 */}
                <div className="bg-white rounded-t-xl shadow-lg overflow-hidden z-[70] relative pb-[env(safe-area-inset-bottom,16px)]">
                    {/* 내부 컨텐츠 컨테이너: 애니메이션 적용 */}
                    <motion.div
                        initial={{ height: "80px" }}
                        animate={{
                            height: isExpanded ? "calc(80vh - env(safe-area-inset-bottom, 16px))" : "80px",
                            boxShadow: isExpanded ? "0 -10px 30px rgba(0, 0, 0, 0.15)" : "0 -2px 10px rgba(0, 0, 0, 0.05)"
                        }}
                        transition={{
                            type: 'spring',
                            damping: 25,
                            stiffness: 300
                        }}
                    >
                        {/* Collapsed state - shows a preview */}
                        {!isExpanded && (
                            <div
                                className="p-4 h-[80px] cursor-pointer flex items-center"
                                onClick={expandSheet}
                            >
                                <div className="w-full">
                                    <div className="text-[#7C6FFB] font-medium text-sm mb-1">내 것으로 만들고 싶은 아이디어</div>
                                    <div className="text-gray-400 text-base">
                                        {text ? text.substring(0, 50) + (text.length > 50 ? '...' : '') : '여기에 타이핑하거나 붙여넣으세요...'}
                                    </div>
                                </div>
                                <div className="flex-shrink-0 ml-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#7969F7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                            </div>
                        )}

                        {/* Expanded state - full form */}
                        {isExpanded && (
                            <div className="h-full flex flex-col">
                                <div className="flex justify-between items-center p-4 border-b border-gray-100">
                                    <button
                                        onClick={collapseSheet}
                                        className="text-gray-500 hover:text-gray-700"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                    <h2 className="text-lg font-medium text-gray-700">새 기억 조각 만들기</h2>
                                    <motion.button
                                        type="button"
                                        onClick={handleSubmit}
                                        disabled={!text.trim() || isLoading}
                                        className="text-[#7969F7] disabled:text-gray-300 disabled:cursor-not-allowed"
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </motion.button>
                                </div>

                                <form onSubmit={handleSubmit} className="flex-1 flex flex-col p-4">
                                    <div className="text-[#7C6FFB] font-medium text-sm mb-2">내 것으로 만들고 싶은 아이디어</div>
                                    <textarea
                                        ref={textareaRef}
                                        value={text}
                                        onChange={(e) => setText(e.target.value)}
                                        placeholder="여기에 타이핑하거나 붙여넣으세요..."
                                        className="flex-1 w-full resize-none border-none focus:outline-none focus:ring-0 text-base"
                                        disabled={isLoading}
                                    />
                                </form>
                            </div>
                        )}
                    </motion.div>
                </div>
            </motion.div>
        </>
    )
}