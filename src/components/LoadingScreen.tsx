'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type LoadingScreenProps = {
    progress: number
    status: 'title' | 'content' | 'group' | 'chunk' | 'complete'
    previewTitle?: string
    previewContent?: string
    processedGroups?: any[]
    onClose?: () => void
}

type ProcessStepStatus = 'completed' | 'progress' | 'pending'

interface ProcessStep {
    id: number
    label: string
    description?: string
    status: ProcessStepStatus
}

export default function LoadingScreen({ progress, status, previewTitle, previewContent, processedGroups = [], onClose }: LoadingScreenProps) {
    const [seconds, setSeconds] = useState(0)
    const [timeDisplay, setTimeDisplay] = useState('00:00:00')
    const [prevStatus, setPrevStatus] = useState(status)
    const [animateStep, setAnimateStep] = useState<number | null>(null)

    // 상태가 변경될 때마다 애니메이션 트리거
    useEffect(() => {
        if (prevStatus !== status) {
            // 현재 활성화된 단계 계산
            const activeStep = status === 'title' ? 1 :
                status === 'content' || status === 'group' ? 2 :
                    status === 'chunk' ? 3 : 4;

            setAnimateStep(activeStep);

            // 애니메이션 효과 후 리셋
            const timer = setTimeout(() => {
                setAnimateStep(null);
            }, 1000);

            setPrevStatus(status);
            return () => clearTimeout(timer);
        }
    }, [status, prevStatus]);

    // 상태에 따른 단계 결정 (4단계로 축소)
    const getSteps = (): ProcessStep[] => {
        const steps: ProcessStep[] = [
            {
                id: 1,
                label: '텍스트 분석 및 제목 생성',
                status: 'completed',
                description: '콘텐츠를 분석하여 적절한 제목을 생성하는 단계입니다.'
            },
            {
                id: 2,
                label: '그룹 생성',
                description: '콘텐츠를 주제별로 그룹화하여 학습 체계를 만드는 중입니다.',
                status: status === 'title' ? 'progress' :
                    (status === 'content' || status === 'group') ? 'progress' :
                        status === 'chunk' || status === 'complete' ? 'completed' : 'pending'
            },
            {
                id: 3,
                label: '기억 카드 생성',
                description: '각 그룹별 효과적인 기억 카드를 생성하여 학습 자료를 준비합니다.',
                status: status === 'chunk' ? 'progress' :
                    status === 'complete' ? 'completed' : 'pending'
            },
            {
                id: 4,
                label: '완료',
                description: '모든 처리가 완료되었습니다. 곧 결과 페이지로 이동합니다.',
                status: status === 'complete' ? 'completed' : 'pending'
            }
        ]
        return steps
    }

    // 현재 진행 중인 스텝 인덱스 구하기
    const getCurrentStepIndex = (): number => {
        switch (status) {
            case 'title': return 1
            case 'content':
            case 'group': return 2
            case 'chunk': return 3
            case 'complete': return 4
            default: return 1
        }
    }

    // 타이머 효과
    useEffect(() => {
        if (status === 'complete') return

        const timer = setInterval(() => {
            setSeconds(prev => prev + 1)
        }, 1000)

        return () => clearInterval(timer)
    }, [status])

    // 시간 포맷팅
    useEffect(() => {
        const minutes = Math.floor(seconds / 60)
        const remainingSeconds = seconds % 60

        const formattedTime = [
            minutes.toString().padStart(2, '0'),
            remainingSeconds.toString().padStart(2, '0')
        ].join(':')

        setTimeDisplay(formattedTime)
    }, [seconds])

    const steps = getSteps()
    const currentStepIndex = getCurrentStepIndex()

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-center justify-center">
            {/* 모달 창 */}
            <motion.div
                className="bg-white rounded-xl shadow-2xl w-[90%] max-w-md overflow-hidden mx-auto"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
            >
                {/* 헤더 영역 */}
                <div className="w-full p-4 flex justify-between items-center border-b border-gray-100">
                    <h1 className="text-xl font-bold text-gray-800">기억 카드 생성 중</h1>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* 안내 텍스트 상단에 추가 */}
                <div className="px-5 py-3 bg-blue-50 text-blue-800 text-sm border-b border-blue-100 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p>생성이 완료되면 자동으로 페이지 이동됩니다.</p>
                </div>

                <div className="p-5">
                    {/* 프로세스 타임라인 */}
                    <div className="relative pb-5">
                        {steps.map((step, index) => (
                            <div key={step.id} className="flex mb-5 relative">
                                {/* 연결선 - 상태에 따라 색상 변경 */}
                                {index < steps.length - 1 && (
                                    <motion.div
                                        className={`absolute top-6 left-4 w-0.5 h-full 
                                            ${step.status === 'completed' ? 'bg-[#7969F7]' : 'bg-gray-200'}`}
                                        initial={{
                                            height: 0,
                                            backgroundColor: step.status === 'completed' ? '#7969F7' : '#e5e7eb'
                                        }}
                                        animate={{
                                            height: '100%',
                                            backgroundColor: step.status === 'completed' ? '#7969F7' : '#e5e7eb'
                                        }}
                                        transition={{ duration: 0.5, delay: 0.2 * index }}
                                        style={{ zIndex: -1 }}
                                    />
                                )}

                                {/* 단계 아이콘 */}
                                <div className="relative flex-shrink-0 mr-3">
                                    <motion.div
                                        className={`
                                            w-8 h-8 rounded-full flex items-center justify-center text-base font-bold
                                            ${step.status === 'completed' ? 'bg-[#7969F7] text-white' :
                                                step.status === 'progress' ? 'bg-white border-2 border-[#7969F7] text-[#7969F7]' :
                                                    'bg-white border-2 border-gray-200 text-gray-400'}
                                        `}
                                        initial={{ scale: animateStep === step.id ? 0.8 : 1 }}
                                        animate={{
                                            scale: animateStep === step.id ? [0.8, 1.2, 1] : 1,
                                            backgroundColor: step.status === 'completed' ? '#7969F7' : 'white',
                                            borderColor: step.status === 'progress' ? '#7969F7' :
                                                step.status === 'pending' ? '#e5e7eb' : 'transparent'
                                        }}
                                        transition={{ duration: 0.5 }}
                                    >
                                        {step.status === 'completed' ? (
                                            <motion.svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                className="h-5 w-5"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                initial={{ pathLength: 0, opacity: 0 }}
                                                animate={{ pathLength: 1, opacity: 1 }}
                                                transition={{ duration: 0.5, delay: 0.2 }}
                                            >
                                                <motion.path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2.5}
                                                    d="M5 13l4 4L19 7"
                                                    initial={{ pathLength: 0 }}
                                                    animate={{ pathLength: 1 }}
                                                    transition={{ duration: 0.5 }}
                                                />
                                            </motion.svg>
                                        ) : step.status === 'progress' ? (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ duration: 0.3 }}
                                                className="w-full h-full flex items-center justify-center"
                                            >
                                                {/* 작은 점이 회전하는 애니메이션 */}
                                                <motion.div
                                                    className="w-4 h-4 rounded-full bg-[#7969F7]"
                                                    animate={{
                                                        scale: [0.5, 1, 0.5],
                                                        opacity: [0.5, 1, 0.5]
                                                    }}
                                                    transition={{
                                                        repeat: Infinity,
                                                        duration: 1.5,
                                                        ease: "easeInOut"
                                                    }}
                                                />
                                            </motion.div>
                                        ) : (
                                            step.id
                                        )}
                                    </motion.div>
                                </div>

                                {/* 단계 내용 */}
                                <motion.div
                                    className="flex-1"
                                    initial={{ x: animateStep === step.id ? -5 : 0, opacity: animateStep === step.id ? 0.7 : 1 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <div className="flex items-center">
                                        <h3 className="text-base font-medium text-gray-700 mr-2">
                                            {step.label}
                                        </h3>

                                        {/* 상태 표시 (아이콘만) */}
                                        {step.status === 'progress' && (
                                            <motion.div
                                                className="flex items-center"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ duration: 0.3 }}
                                            >
                                                <svg className="animate-spin h-4 w-4 text-[#7969F7] mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                <span className="text-sm text-[#7969F7]">{timeDisplay}</span>
                                            </motion.div>
                                        )}
                                    </div>

                                    {step.description && (
                                        <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                                    )}
                                </motion.div>
                            </div>
                        ))}
                    </div>

                    {/* 제목 및 그룹 미리보기 */}
                    <AnimatePresence>
                        {previewTitle && (
                            <motion.div
                                className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.3 }}
                            >
                                {/* 제목 정보 */}
                                <h3 className="text-sm font-medium text-gray-500 mb-1">생성된 제목:</h3>
                                <p className="text-base font-medium text-gray-800 mb-3">{previewTitle}</p>

                                {/* 그룹 정보 (있을 경우) */}
                                {processedGroups && processedGroups.length > 0 && (
                                    <>
                                        <h3 className="text-sm font-medium text-gray-500 mt-3 mb-1">
                                            생성된 그룹 ({processedGroups.length}):
                                        </h3>
                                        <div className="max-h-20 overflow-y-auto">
                                            {processedGroups.slice(0, 3).map((group, idx) => (
                                                <div key={idx} className="mb-1 last:mb-0">
                                                    <p className="text-xs text-gray-700">
                                                        {idx + 1}. {group.title || '그룹 ' + (idx + 1)}
                                                    </p>
                                                </div>
                                            ))}
                                            {processedGroups.length > 3 && (
                                                <p className="text-xs text-gray-500 italic mt-1">
                                                    ...외 {processedGroups.length - 3}개 그룹
                                                </p>
                                            )}
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* 경고 메시지 */}
                    <div className="mt-4 py-2 flex items-center text-xs text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p>기억 카드 생성은 콘텐츠 길이에 따라 5~10분 정도 소요될 수 있습니다.</p>
                    </div>
                </div>
            </motion.div>
        </div>
    )
} 