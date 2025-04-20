'use client'

import { useEffect, useState, useRef } from 'react'
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

// 스켈레톤 로딩 컴포넌트
function SkeletonLoader({ type }: { type: 'group' | 'card' }) {
    return type === 'group' ? (
        <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center">
                    <div className="w-4 h-4 bg-gray-200 rounded-full mr-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
            ))}
        </div>
    ) : (
        <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
                <div key={i} className="p-2 bg-gray-100 rounded-md border border-gray-200">
                    <div className="h-3 bg-gray-200 rounded w-1/3 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                </div>
            ))}
        </div>
    );
}

export default function LoadingScreen({ progress, status, previewTitle, previewContent, processedGroups = [], onClose }: LoadingScreenProps) {
    const [seconds, setSeconds] = useState(0)
    const [timeDisplay, setTimeDisplay] = useState('00:00:00')
    const [prevStatus, setPrevStatus] = useState(status)
    const [animateStep, setAnimateStep] = useState<number | null>(null)

    // 실시간 생성되는 데이터를 추적하기 위한 상태 추가
    const [displayedGroups, setDisplayedGroups] = useState<any[]>([]);

    // 그룹이 새로 추가될 때마다 타이핑 효과로 표시하기 위한 상태
    const [newGroupsAdded, setNewGroupsAdded] = useState(false);

    // 실시간 업데이트를 위해 processedGroups 변경 감지
    useEffect(() => {
        if (processedGroups.length > displayedGroups.length) {
            // 새로 추가된 그룹이 있음
            setDisplayedGroups(processedGroups);
            setNewGroupsAdded(true);

            // 잠시 후 새 그룹 추가 효과 종료
            const timer = setTimeout(() => {
                setNewGroupsAdded(false);
            }, 1000);

            return () => clearTimeout(timer);
        }
    }, [processedGroups, displayedGroups]);

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

    // 현재 단계에 따라 다른 로딩 메시지 표시
    const getLoadingMessage = () => {
        switch (status) {
            case 'title': return '제목을 생성하는 중입니다...';
            case 'group': return `주제별 그룹을 생성하는 중입니다... ${processedGroups.length > 0 ? `(${processedGroups.length}개 생성됨)` : ''}`;
            case 'chunk': return '기억 카드를 생성하는 중입니다...';
            case 'complete': return '모든 처리가 완료되었습니다.';
            default: return '처리 중입니다...';
        }
    };

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
                    <p>생성이 완료되면 해당 페이지로 이동됩니다.</p>
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

                    {/* 생성 상태 디스플레이 */}
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
                                <p className="text-base font-medium text-gray-800 mb-3">
                                    <TypewriterText
                                        text={previewTitle}
                                        speed={50}
                                    />
                                </p>

                                {/* 실제 그룹 정보 - 실시간 업데이트 */}
                                {processedGroups && processedGroups.length > 0 ? (
                                    <>
                                        <h3 className="text-sm font-medium text-gray-500 mt-3 mb-1">
                                            생성된 그룹 ({processedGroups.length}):
                                        </h3>
                                        <div className="max-h-28 overflow-y-auto">
                                            {processedGroups.map((group, idx) => (
                                                <div
                                                    key={group.id || idx}
                                                    className={`mb-1 last:mb-0 ${idx >= displayedGroups.length - 1 && newGroupsAdded ? 'animate-pulse bg-blue-50 rounded p-1' : ''}`}
                                                >
                                                    <p className="text-xs text-gray-700">
                                                        {idx + 1}. {idx >= displayedGroups.length - 1 && newGroupsAdded ? (
                                                            <TypewriterText
                                                                text={group.title || `그룹 ${idx + 1}`}
                                                                speed={30}
                                                            />
                                                        ) : (
                                                            group.title || `그룹 ${idx + 1}`
                                                        )}
                                                    </p>

                                                    {/* 각 그룹의 카드 개수 표시 (있는 경우) */}
                                                    {group.chunks && group.chunks.length > 0 && (
                                                        <div className="ml-4 mt-0.5">
                                                            <p className="text-[10px] text-gray-500">
                                                                카드 {group.chunks.length}개
                                                            </p>

                                                            {/* 생성된 첫 번째 카드 미리보기 (카드 생성 단계일 때) */}
                                                            {status === 'chunk' && (
                                                                <div className="mt-1 text-[10px] text-gray-600 bg-gray-50 rounded p-1 border border-gray-100">
                                                                    <TypewriterText
                                                                        text={group.chunks[0]?.summary || ''}
                                                                        speed={15}
                                                                        className="line-clamp-1"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* 그룹 생성 중 스켈레톤 로더 - 그룹 단계일 때만 표시 */}
                                        {(status === 'group' || status === 'content') && (
                                            <>
                                                <h3 className="text-sm font-medium text-gray-500 mt-3 mb-2">
                                                    그룹 생성 중...
                                                </h3>
                                                <SkeletonLoader type="group" />
                                            </>
                                        )}

                                        {/* 카드 생성 중 스켈레톤 로더 - 카드 단계일 때만 표시 */}
                                        {status === 'chunk' && (
                                            <>
                                                <h3 className="text-sm font-medium text-gray-500 mt-3 mb-2">
                                                    기억 카드 생성 중...
                                                </h3>
                                                <SkeletonLoader type="card" />
                                            </>
                                        )}
                                    </>
                                )}

                                {/* 진행 상태 표시 (그룹 또는 카드 정보 아래에 표시) */}
                                {status !== 'complete' && processedGroups.length > 0 && (
                                    <div className="mt-3 px-2 py-1.5 bg-blue-50 rounded-md text-xs text-blue-700 flex items-center justify-between">
                                        <div className="flex items-center">
                                            <svg className="animate-spin h-3 w-3 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            {status === 'group' ? '그룹' : '카드'} 생성 진행 중...
                                        </div>
                                        <span className="text-blue-800 font-medium">{timeDisplay}</span>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* 상태 메시지 */}
                    <div className="mt-4 text-center">
                        <p className="text-sm text-gray-600">{getLoadingMessage()}</p>
                        <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-[#7969F7]"
                                initial={{ width: '0%' }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.5 }}
                            />
                        </div>
                    </div>

                    {/* 경고 메시지 */}
                    <div className="mt-4 py-2 flex items-center text-xs text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                </div>
            </motion.div>
        </div>
    )
} 