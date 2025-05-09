'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type LoadingScreenProps = {
    progress: number
    status: 'title' | 'content' | 'group' | 'chunk' | 'complete'
    previewTitle?: string
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

// 타이핑 애니메이션용 컴포넌트
function TypewriterText({
    text,
    speed = 30,
    delay = 0,
    className = ""
}: {
    text: string,
    speed?: number,
    delay?: number,
    className?: string
}) {
    const [displayText, setDisplayText] = useState("");
    const [isComplete, setIsComplete] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // 새 텍스트가 들어오면 초기화
        setDisplayText("");
        setCurrentIndex(0);
        setIsComplete(false);

        // 이전 인터벌 정리
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        // 딜레이 후 타이핑 시작
        const delayTimeout = setTimeout(() => {
            intervalRef.current = setInterval(() => {
                setCurrentIndex(prev => {
                    // 타이핑 완료
                    if (prev >= text.length) {
                        if (intervalRef.current) {
                            clearInterval(intervalRef.current);
                        }
                        setIsComplete(true);
                        return prev;
                    }
                    return prev + 1;
                });
            }, speed);
        }, delay);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            clearTimeout(delayTimeout);
        };
    }, [text, speed, delay]);

    // 인덱스가 변경될 때마다 표시 텍스트 업데이트
    useEffect(() => {
        setDisplayText(text.substring(0, currentIndex));
    }, [currentIndex, text]);

    return (
        <span className={className}>
            {displayText}
            {!isComplete && <span className="inline-block w-1 h-4 ml-0.5 bg-current animate-pulse" />}
        </span>
    );
}

export default function LoadingScreen({ progress, status, previewTitle, processedGroups = [], onClose }: LoadingScreenProps) {
    const [seconds, setSeconds] = useState(0)
    const [timeDisplay, setTimeDisplay] = useState('00:00:00')
    const [prevStatus, setPrevStatus] = useState(status)
    const [animateStep, setAnimateStep] = useState<number | null>(null)
    const [isRedirecting, setIsRedirecting] = useState(false)

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

    // 완료 상태 감지 및 리다이렉션 상태 설정
    useEffect(() => {
        if (status === 'complete' && !isRedirecting) {
            setIsRedirecting(true);
        }
    }, [status, isRedirecting]);

    // 상태에 따른 단계 결정 (4단계로 축소)
    const getSteps = (): ProcessStep[] => {
        const steps: ProcessStep[] = [
            {
                id: 1,
                label: 'Text analysis',
                status: 'completed',
                description: 'Analyzing text and generating title...'
            },
            {
                id: 2,
                label: 'Preparing generation',
                description: 'Preparing generation...',
                status: status === 'title' ? 'progress' :
                    (status === 'content' || status === 'group') ? 'progress' :
                        status === 'chunk' || status === 'complete' ? 'completed' : 'pending'
            },
            {
                id: 3,
                label: 'Card generation',
                description: 'Generating cards...',
                status: status === 'chunk' ? 'progress' :
                    status === 'complete' ? 'completed' : 'pending'
            },
            {
                id: 4,
                label: 'Complete',
                description: 'Processing complete. Redirecting to note...',
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
                <div className="w-full p-4 flex justify-center items-center border-b border-gray-100">
                    <h1 className="text-xl font-bold text-gray-800">
                        {isRedirecting ? 'Redirecting...' : 'Generating...'}
                    </h1>
                </div>

                {/* 안내 텍스트 상단에 추가 */}
                <div className="px-5 py-3 bg-blue-50 text-blue-800 text-sm border-b border-blue-100 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p>
                        {isRedirecting
                            ? 'Redirecting...'
                            : 'Processing...'}
                    </p>
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
                </div>
            </motion.div>
        </div>
    )
} 