'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LoadingScreen from './LoadingScreen'
import { useRouter } from 'next/navigation'
import { ContentLimitManager } from '../App'
import { useSWRConfig } from 'swr';
import { SparklesIcon } from "@heroicons/react/24/solid";
import BottomSheetShortcuts from './BottomSheetShortcuts';

// 토스트 타입 정의
type ToastType = 'info' | 'success' | 'error' | 'warning' | 'bg-processing';

// 토스트 메시지 인터페이스
interface ToastMessage {
    id: string;
    title: string;
    description?: string;
    type: ToastType;
    duration?: number;
    onClose?: () => void;
    data?: any; // 추가 데이터를 위한 필드
}

// 토스트 훅
function useToast() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = (toast: Omit<ToastMessage, 'id'>) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newToast = { ...toast, id };
        setToasts(prev => [...prev, newToast]);

        // 자동 제거
        if (toast.duration !== 0) {
            setTimeout(() => {
                removeToast(id);
                toast.onClose?.();
            }, toast.duration || 5000);
        }

        return id;
    };

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    };

    // 컴포넌트
    const ToastContainer = () => (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
            <AnimatePresence>
                {toasts.map(toast => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, y: -20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className={`p-4 rounded-lg shadow-lg max-w-sm ${toast.type === 'success' ? 'bg-green-100 text-green-800' :
                            toast.type === 'error' ? 'bg-red-100 text-red-800' :
                                toast.type === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                                    toast.type === 'bg-processing' ? 'bg-white text-gray-800 border border-gray-200' :
                                        'bg-blue-100 text-blue-800'
                            }`}
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-semibold text-sm">{toast.title}</h4>
                                {toast.description && (
                                    <p className="text-xs mt-1">{toast.description}</p>
                                )}
                                {toast.type === 'bg-processing' && toast.data?.isCompleted && (
                                    <button
                                        onClick={() => {
                                            if (toast.data?.contentId) {
                                                window.location.href = `/content/${toast.data.contentId}/groups`;
                                            }
                                        }}
                                        className="mt-2 text-xs text-[#7969F7] font-medium flex items-center"
                                    >
                                        생성이 완료되었습니다. 바로가기
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    removeToast(toast.id);
                                    toast.onClose?.();
                                }}
                                className="ml-2 text-gray-500 hover:text-gray-700"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );

    return { toast: addToast, removeToast, ToastContainer };
}

const MIN_LENGTH = 50;
const MAX_LENGTH = 20000;
// 최대 무료 콘텐츠 수 상수 정의
const MAX_FREE_CONTENTS = 3;

export default function BottomSheet() {
    const router = useRouter()
    const [text, setText] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [loadingUIType, setLoadingUIType] = useState<'title' | 'group' | 'chunk' | 'complete'>('title')
    const [processingStatus, setProcessingStatus] = useState<string | null>(null)
    const [processingError, setProcessingError] = useState<string | null>(null)
    const [processedGroups, setProcessedGroups] = useState<any[]>([])
    const [loadingProgress, setLoadingProgress] = useState(0)
    const [loadingStatusMessage, setLoadingStatusMessage] = useState('')
    const [showLoadingScreen, setShowLoadingScreen] = useState(false)
    const [isBgProcessing, setIsBgProcessing] = useState(false)
    const [pollingContentId, setPollingContentId] = useState<string | null>(null)
    const [generatedTitle, setGeneratedTitle] = useState<string | null>(null)
    const [bgProcessingToastId, setBgProcessingToastId] = useState<string | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [isRedirecting, setIsRedirecting] = useState(false)
    const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const [selectedLanguage, setSelectedLanguage] = useState<string>('English')
    // 구독 모달 상태 추가
    const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
    // 콘텐츠 개수 캐싱을 위한 상태 추가
    const [cachedContentCount, setCachedContentCount] = useState<number | null>(null)
    const { mutate } = useSWRConfig();

    // 언어 선택 저장을 위한 로컬 스토리지 키
    const LANGUAGE_STORAGE_KEY = 'amgi_selected_language'

    // 컴포넌트 마운트 시 저장된 언어 설정 불러오기 및 콘텐츠 개수 확인
    useEffect(() => {
        try {
            const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY)
            if (savedLanguage) {
                setSelectedLanguage(savedLanguage)
            }
        } catch (error) {
            console.error('언어 설정 불러오기 실패:', error)
        }

        // 콘텐츠 개수 미리 확인
        fetchContentCount();
    }, [])

    // 바텀시트가 열릴 때 콘텐츠 개수 확인
    useEffect(() => {
        const handleBottomSheetOpen = () => {
            fetchContentCount();
        };

        window.addEventListener('openBottomSheet', handleBottomSheetOpen);
        return () => {
            window.removeEventListener('openBottomSheet', handleBottomSheetOpen);
        };
    }, []);

    // 콘텐츠 개수를 가져오는 함수
    const fetchContentCount = async () => {
        try {
            const response = await fetch('/api/contents');
            if (response.ok) {
                const data = await response.json();
                const count = data.contents?.length || 0;
                setCachedContentCount(count);
                console.log('콘텐츠 개수 캐싱 완료:', count);
            }
        } catch (error) {
            console.error('콘텐츠 개수 확인 중 오류:', error);
            // 오류 발생 시 null로 설정하여 handleSubmit에서 재확인하도록 함
            setCachedContentCount(null);
        }
    };

    // 언어 변경 시 로컬 스토리지에 저장
    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLanguage = e.target.value
        setSelectedLanguage(newLanguage)
        try {
            localStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage)
        } catch (error) {
            console.error('언어 설정 저장 실패:', error)
        }
    }

    // 토스트 기능 추가
    const { toast, removeToast, ToastContainer } = useToast();

    // 전역 상태로 사용할 컨텍스트나 상태 관리 라이브러리로 이동하는 것이 좋을 수 있음
    const [isExpanded, setIsExpanded] = useState(false)

    // 그룹 생성과 카드 생성 단계 추적을 위한 상태 추가
    const [groupProcessingStarted, setGroupProcessingStarted] = useState(false);
    const [firstGroupDetected, setFirstGroupDetected] = useState(false);

    // 폴링 카운터 추가
    const pollCount = useRef(0);

    // 글자 수에 따른 카운터 텍스트 스타일 결정 함수
    const getCounterColor = () => {
        if (isLengthUnderMin) return 'text-yellow-600'; // 최소 미만일 때 노란색 경고
        if (isLengthOverMax) return 'text-red-600'; // 최대 초과일 때 빨간색 경고
        return 'text-gray-500'; // 유효 범위일 때 회색
    };

    const getCounterText = () => {
        if (textLength === 0) return `${MAX_LENGTH} characters allowed`;
        if (isLengthUnderMin) return `${MIN_LENGTH} characters minimum. (${textLength}/${MAX_LENGTH})`;
        if (isLengthOverMax) return `Character limit exceeded (${textLength}/${MAX_LENGTH})`;
        return `${textLength}/${MAX_LENGTH}`;
    }

    // 리다이렉션 처리 함수
    const handleRedirect = useCallback((contentId: string) => {
        if (isRedirecting) return;

        setIsRedirecting(true);
        setLoadingUIType('complete');
        setLoadingProgress(100);
        setLoadingStatusMessage('처리가 완료되었습니다. 결과 페이지로 이동합니다...');

        // 이전 타임아웃 정리
        if (redirectTimeoutRef.current) {
            clearTimeout(redirectTimeoutRef.current);
        }

        // 리다이렉트 실행
        redirectTimeoutRef.current = setTimeout(() => {
            const targetUrl = `/content/${contentId}/groups`;
            console.log('리다이렉트 경로:', targetUrl);
            window.location.href = targetUrl;
        }, 1500);
    }, [isRedirecting]);

    // 컴포넌트 언마운트 시 타임아웃 정리
    useEffect(() => {
        return () => {
            if (redirectTimeoutRef.current) {
                clearTimeout(redirectTimeoutRef.current);
            }
        };
    }, []);

    // handlePollingComplete 함수 수정
    const handlePollingComplete = (data: any) => {
        console.log('폴링 완료 처리 - 콘텐츠 ID:', data.content_id);
        handleRedirect(data.content_id);
    };

    const resetLoadingStates = () => {
        setIsLoading(false)
        setShowLoadingScreen(false)
        setLoadingProgress(0)
        setLoadingUIType('title')
        setLoadingStatusMessage('제목 생성 중...')
        setPollingContentId(null)
        setProcessingStatus(null)
        setProcessingError(null)
        setProcessedGroups([])
        setIsBgProcessing(false)
    }

    const resetForm = () => {
        setText('')
        setGeneratedTitle('')
        resetLoadingStates()
    }

    // 에러 처리 함수 수정
    const handleError = (error: string) => {
        console.error('오류 발생:', error);
        setIsLoading(false);
        setLoadingStatusMessage('');
        setLoadingProgress(0);
        router.push('/');
    };

    // 로딩 화면 닫기 처리 (백그라운드 처리로 전환)
    const handleCloseLoadingScreen = () => {
        setShowLoadingScreen(false);
        setIsLoading(false);
        setIsBgProcessing(true);

        // 사용자에게 알림 (자동으로 사라지지 않음)
        const toastId = toast({
            title: "백그라운드에서 생성 중",
            description: "기억 카드가 백그라운드에서 생성되고 있습니다. 완료되는 즉시 자동으로 이동합니다.",
            type: "bg-processing",
            duration: 0, // 자동으로 사라지지 않음
            data: {
                contentId: pollingContentId,
                isCompleted: false
            }
        });

        // 토스트 ID 저장
        setBgProcessingToastId(toastId);
    };

    const pollStatus = useCallback(async () => {
        if (isLoading && pollingContentId) {
            try {
                pollCount.current += 1;
                console.log(`[Polling] 시도 #${pollCount.current} for ${pollingContentId}`);

                const res = await fetch(`/api/status?id=${pollingContentId}`, {
                    method: 'GET',
                });

                // HTTP 상태 코드 확인
                if (!res.ok) {
                    console.error(`[Polling] HTTP 오류: ${res.status} ${res.statusText}`);
                    // 404 오류는 무시하고 계속 진행 (API가 아직 준비되지 않았을 수 있음)
                    if (res.status === 404) {
                        console.log('[Polling] API가 아직 준비되지 않았습니다. 다음 폴링에서 다시 시도합니다.');
                        return;
                    }

                    // 3번 이상 연속 실패하면 오류 처리 (404 아닌 경우에만)
                    if (pollCount.current > 3) {
                        handleError(`서버 응답 오류: ${res.status} ${res.statusText}`);
                        return;
                    }
                    // 일시적 오류면 다음 폴링에서 다시 시도
                    return;
                }

                // HTML 응답 체크 (에러 페이지)
                const contentType = res.headers.get('content-type');
                if (contentType && contentType.includes('text/html')) {
                    console.error('HTML 응답을 받았습니다 (JSON 아님)');

                    // 3번 이상 연속 HTML 응답 받으면 에러 처리
                    if (pollCount.current > 3) {
                        handleError('서버 오류가 발생했습니다. HTML 응답을 받았습니다.');
                        return;
                    }
                    // 일시적 오류면 다음 폴링에서 다시 시도
                    return;
                }

                // 응답 텍스트 미리 확인
                const responseText = await res.text();
                // 빈 응답이거나 HTML로 시작하는 응답 체크
                if (!responseText.trim() ||
                    responseText.trim().toLowerCase().startsWith('<!doctype') ||
                    responseText.trim().toLowerCase().startsWith('<html')) {
                    console.error('[Polling] 유효하지 않은 응답:', responseText.substring(0, 100));

                    // 3번 이상 연속 실패하면 오류 처리
                    if (pollCount.current > 3) {
                        handleError('유효하지 않은 서버 응답을 받았습니다.');
                        return;
                    }
                    // 일시적 오류면 다음 폴링에서 다시 시도
                    return;
                }

                let data;
                try {
                    data = JSON.parse(responseText);
                    console.log(`[Polling] 응답 데이터:`, data);

                    // 성공하면 폴링 카운터 초기화
                    pollCount.current = 0;
                } catch (error) {
                    console.error('JSON 파싱 오류:', error, '응답:', responseText.substring(0, 100));

                    // 3번 이상 연속 실패하면 오류 처리
                    if (pollCount.current > 3) {
                        handleError('응답 데이터를 파싱할 수 없습니다.');
                        return;
                    }
                    // 일시적 오류면 다음 폴링에서 다시 시도
                    return;
                }

                // 데이터 상태 업데이트
                if (data.status === 'processing_title') {
                    setLoadingUIType('title');
                    setLoadingProgress(10);
                    setLoadingStatusMessage('제목 생성 중...');
                } else if (data.status === 'processing_groups') {
                    setLoadingUIType('group');
                    setLoadingProgress(30);
                    setLoadingStatusMessage('기억 그룹 생성 중...');
                    if (data.title && !generatedTitle) setGeneratedTitle(data.title);
                    // 여기서 그룹 데이터 업데이트
                    setProcessedGroups(data.groups || []);
                    console.log('[Polling] setProcessedGroups called with:', data.groups || []); // 상태 업데이트 직후 확인
                } else if (data.status === 'processing_chunks') {
                    setLoadingUIType('chunk');
                    setLoadingProgress(60);
                    setLoadingStatusMessage('기억 카드 생성 중...');
                    if (data.title && !generatedTitle) setGeneratedTitle(data.title);
                    // 여기서도 그룹 데이터 (청크 포함) 업데이트
                    setProcessedGroups(data.groups || []);
                } else if (data.status === 'completed') {
                    setLoadingUIType('complete');
                    setLoadingProgress(100);
                    setLoadingStatusMessage('처리가 완료되었습니다.');
                    setProcessedGroups(data.groups || []);
                    handlePollingComplete({ content_id: pollingContentId });
                } else if (data.status === 'failed') {
                    handleError('처리 실패');
                }

                // 성공적인 응답 후 폴링 카운터 초기화
                pollCount.current = 0;

            } catch (error) {
                console.error('[Polling] 에러:', error);
                if (pollCount.current > 3) {
                    setIsLoading(false);
                    setLoadingStatusMessage('');
                    setLoadingProgress(0);
                    router.push('/');
                }
            }
        }
    }, [isLoading, pollingContentId, generatedTitle, handlePollingComplete]);

    // 폴링 시작
    useEffect(() => {
        if (isLoading && pollingContentId) {
            const interval = setInterval(pollStatus, 3000); // 3초마다 상태 확인
            return () => clearInterval(interval);
        }
    }, [isLoading, pollingContentId, pollStatus]);

    // 로딩 관련 상태 변화 감지용 useEffect 추가
    useEffect(() => {
        console.log('[State Change] Loading States Updated:', {
            progress: loadingProgress,
            message: loadingStatusMessage,
            uiType: loadingUIType,
            isLoading: isLoading,
            showLoadingScreen: showLoadingScreen,
            bgProcessing: isBgProcessing,
            status: processingStatus
        });
    }, [loadingProgress, loadingStatusMessage, loadingUIType, isLoading, showLoadingScreen, isBgProcessing, processingStatus]);

    const textLength = text.length; // 글자 수 계산
    const isLengthValid = textLength >= MIN_LENGTH && textLength <= MAX_LENGTH;
    const isLengthUnderMin = textLength > 0 && textLength < MIN_LENGTH; // 0보다 클 때만 미만으로 간주
    const isLengthOverMax = textLength > MAX_LENGTH;

    // 폼 제출 처리
    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        // 로딩 중이거나 유효하지 않은 텍스트인 경우 처리하지 않음
        if (isLoading || text.trim().length === 0 || !isLengthValid) {
            return;
        }

        // 캐싱된 콘텐츠 개수 확인
        if (cachedContentCount !== null && cachedContentCount >= MAX_FREE_CONTENTS) {
            setShowSubscriptionModal(true);
            return;
        }

        // 캐싱된 값이 없는 경우에만 API 호출로 확인
        if (cachedContentCount === null) {
            try {
                const response = await fetch('/api/contents');
                if (response.ok) {
                    const data = await response.json();
                    const contentCount = data.contents?.length || 0;
                    setCachedContentCount(contentCount);

                    // 무료 콘텐츠 제한 초과 시 구독 모달 표시
                    if (contentCount >= MAX_FREE_CONTENTS) {
                        setShowSubscriptionModal(true);
                        return;
                    }
                }
            } catch (error) {
                console.error('콘텐츠 개수 확인 중 오류:', error);
                // 오류 발생 시 계속 진행 (제한 체크 실패 시 사용자 경험 방해 방지)
            }
        }

        // 로딩 상태 설정
        setIsLoading(true);
        setLoadingUIType('title');
        setLoadingProgress(5);
        setLoadingStatusMessage('제목 생성 중...');

        try {
            // 임시 콘텐츠 생성 (UI 즉시 업데이트용)
            const tempContentId = `temp-${Date.now()}`;
            const tempContent = {
                id: tempContentId,
                title: 'Processing...',
                status: 'paused',
                created_at: new Date().toISOString(),
                user_id: 'temp',
                original_text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                content_groups: []
            };

            // 임시 콘텐츠 로컬 스토리지에 저장
            localStorage.setItem('temp_content', JSON.stringify(tempContent));

            // SWR 캐시 업데이트 (UI 즉시 반영)
            mutate('/api/contents', (data: any) => {
                if (data && Array.isArray(data.contents)) {
                    return {
                        ...data,
                        contents: [tempContent, ...data.contents]
                    };
                }
                return data;
            }, false);

            // API 호출
            const generateResponse = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    language: selectedLanguage
                }),
            });

            // 응답 처리
            let generateData;
            try {
                const responseText = await generateResponse.text();
                try {
                    generateData = JSON.parse(responseText);
                } catch (parseError) {
                    console.error('JSON 파싱 오류:', parseError, '응답:', responseText.substring(0, 100));
                    throw new Error(`응답 파싱 오류: ${responseText.substring(0, 100)}...`);
                }
            } catch (textError) {
                console.error('응답 읽기 오류:', textError);
                // 에러 처리 - contentId는 아직 없음
                setIsLoading(false);

                // 임시 콘텐츠 제거
                localStorage.removeItem('temp_content');
                mutate('/api/contents'); // 데이터 다시 가져오기

                router.push('/');
                return;
            }

            if (!generateResponse.ok) {
                throw new Error(generateData.error || '콘텐츠 생성 요청 실패');
            }

            const contentId = generateData.content_id;
            if (!contentId) {
                throw new Error('생성된 콘텐츠 ID가 없습니다.');
            }

            console.log('콘텐츠 생성 완료, 홈으로 리디렉션:', contentId);

            // 폼 초기화
            resetForm();

            // 바텀시트 닫기
            collapseSheet();

            // 임시 콘텐츠 ID와 실제 콘텐츠 ID 매핑 저장
            localStorage.setItem('real_content_id', contentId);

            // 데이터 다시 가져오기 - 임시 콘텐츠를 실제 콘텐츠로 대체
            mutate('/api/contents');

            // 홈으로 리디렉션
            router.push('/');

        } catch (error) {
            console.error('Error during submission:', error);
            // 콘텐츠 ID가 없으므로 삭제 요청 없이 에러 처리
            setIsLoading(false);

            // 임시 콘텐츠 제거
            localStorage.removeItem('temp_content');
            mutate('/api/contents'); // 데이터 다시 가져오기

            router.push('/');
        }
    };

    // 콘텐츠 준비 상태 폴링 함수
    const pollReadyStatus = async (contentId: string) => {
        console.log('콘텐츠 준비 상태 체크 시작:', contentId);

        // 폴링 상태 초기화
        setPollingContentId(contentId);
        setLoadingStatusMessage('제목 생성 중...');
        setLoadingUIType('title');
        setLoadingProgress(10);

        let retryCount = 0;
        const maxRetries = 30; // 최대 시도 횟수
        const pollInterval = 1500; // 1.5초마다 체크 (기존 2초에서 단축)

        // 응답 순서 추적을 위한 변수
        let lastResponseTimestamp = 0;
        let lastProcessingStatus = '';

        // 데이터 완전성 확인 카운터
        let dataConsistencyCounter = 0;
        const requiredConsistentChecks = 2; // 연속 2번 동일한 완료 상태 확인 필요 (기존 3번에서 단축)

        // API 오류 카운터
        let consecutiveErrorCount = 0;
        const maxConsecutiveErrors = 5; // 최대 연속 오류 허용 횟수

        const checkReadyStatus = async () => {
            try {
                retryCount++;
                console.log(`[데이터 확인] ${retryCount}번째 시도...`);

                const startTime = Date.now();
                const checkResponse = await fetch(`/api/check-content?id=${contentId}`);
                if (!checkResponse.ok) {
                    // API 응답 오류 카운터 증가
                    consecutiveErrorCount++;
                    console.warn(`[API 오류] ${consecutiveErrorCount}번째 연속 오류: ${checkResponse.status}`);

                    // 최대 연속 오류 횟수를 초과한 경우에만 심각한 오류로 처리
                    if (consecutiveErrorCount >= maxConsecutiveErrors) {
                        throw new Error(`서버 응답 오류: ${checkResponse.status} ${checkResponse.statusText}`);
                    }

                    // 아직 허용 범위 내의 오류는 다음 폴링에서 다시 시도
                    setTimeout(checkReadyStatus, pollInterval);
                    return;
                }

                // 성공적인 응답을 받으면 오류 카운터 리셋
                consecutiveErrorCount = 0;

                const checkData = await checkResponse.json();
                console.log('[데이터 확인 결과]:', checkData);

                // 응답에 타임스탬프가 있는지 확인
                const responseTimestamp = checkData.timestamp || Date.now();

                // 이전 응답보다 오래된 응답은 무시 (네트워크 지연으로 인한 순서 꼬임 방지)
                if (responseTimestamp < lastResponseTimestamp) {
                    console.log('[오래된 응답 무시]', responseTimestamp, '<', lastResponseTimestamp);
                    setTimeout(checkReadyStatus, pollInterval);
                    return;
                }

                // 응답 타임스탬프 업데이트
                lastResponseTimestamp = responseTimestamp;

                // 처리 상태 확인 - 상태가 이전 상태보다 뒤로 가는 경우 무시
                const processingStatus = checkData.processingStatus || 'pending';
                const statusOrder: Record<string, number> = {
                    'pending': 0,
                    'received': 1,
                    'title_generated': 2,
                    'groups_generating': 3,
                    'groups_generated': 4,
                    'chunks_generating': 5,
                    'completed': 6,
                    'failed': -1
                };

                // 상태가 뒤로 가는 경우 무시 (예: completed -> chunks_generating)
                if (lastProcessingStatus &&
                    statusOrder[processingStatus] < statusOrder[lastProcessingStatus]) {
                    console.log('[상태 역행 무시]', processingStatus, '<', lastProcessingStatus);
                    setTimeout(checkReadyStatus, pollInterval);
                    return;
                }

                // 현재 처리 상태 업데이트
                lastProcessingStatus = processingStatus;

                // 백엔드 상태에 따른 UI 업데이트
                if (checkData.processingStatus) {
                    setProcessingStatus(checkData.processingStatus);

                    switch (checkData.processingStatus) {
                        case 'pending':
                        case 'received':
                            setLoadingUIType('title');
                            setLoadingProgress(20);
                            setLoadingStatusMessage('제목 생성 중...');
                            break;

                        case 'title_generated':
                            setLoadingUIType('title');
                            setLoadingProgress(30);
                            setLoadingStatusMessage('제목 생성 완료...');
                            // 제목이 있으면 표시
                            if (checkData.title) {
                                setGeneratedTitle(checkData.title);
                            }
                            break;

                        case 'groups_generating':
                            setLoadingUIType('group');
                            setLoadingProgress(40);
                            setLoadingStatusMessage('기억 그룹 생성 중...');
                            break;

                        case 'groups_generated':
                            setLoadingUIType('group');
                            setLoadingProgress(50);
                            setLoadingStatusMessage('기억 그룹 생성 완료...');

                            // 제목이 있으면 표시
                            if (checkData.title) {
                                setGeneratedTitle(checkData.title);
                            }

                            // 그룹 정보 가져오기 (있는 경우)
                            await loadGroupsInfo(contentId);
                            break;

                        case 'chunks_generating':
                            setLoadingUIType('chunk');
                            setLoadingProgress(70);
                            setLoadingStatusMessage('기억 카드 생성 중...');

                            // 청크 수에 따른 진행률 업데이트
                            if (checkData.totalChunksCount > 0) {
                                // 50%~90% 사이에서 청크 생성 진행률 표시
                                const baseProgress = 50;
                                const maxProgress = 90;
                                const progressRange = maxProgress - baseProgress;

                                // 청크 생성 진행률 계산
                                const chunkProgress = checkData.totalChunksCount > 0
                                    ? (checkData.completedChunksCount / checkData.totalChunksCount) * progressRange
                                    : 0;

                                setLoadingProgress(Math.min(baseProgress + chunkProgress, maxProgress));
                            }
                            break;

                        case 'completed':
                            setLoadingUIType('complete');
                            setLoadingProgress(100);
                            setLoadingStatusMessage('처리가 완료되었습니다. 결과 페이지로 이동합니다...');
                            break;

                        case 'failed':
                            setLoadingStatusMessage('처리 중 오류가 발생했습니다. 홈으로 이동합니다...');
                            setTimeout(() => {
                                window.location.href = '/';
                            }, 2000);
                            return;
                    }
                }

                // 완료 상태 확인 - 단순화된 조건
                // 프로세싱 상태가 'completed'이면 완료로 간주
                if (checkData.processingStatus === 'completed') {
                    // 데이터 일관성 확인 카운터 증가
                    dataConsistencyCounter++;
                    console.log(`[완료 확인] 데이터 일관성 체크: ${dataConsistencyCounter}/${requiredConsistentChecks}`);

                    // 연속으로 일정 횟수 이상 완료 상태 확인 시 진짜 완료로 간주
                    if (dataConsistencyCounter >= requiredConsistentChecks) {
                        console.log('[데이터 준비 완료] 리다이렉트 준비');

                        // 완료 UI 표시 후 짧은 지연 후 리다이렉트
                        setTimeout(() => {
                            handleRedirect(contentId);
                        }, 1500);
                        return;
                    }
                } else {
                    // 완료 상태가 아닌 경우 카운터 리셋
                    dataConsistencyCounter = 0;
                }

                // 최대 시도 횟수 도달 확인
                if (retryCount >= maxRetries) {
                    console.log('[최대 시도 횟수 도달] 결과 페이지로 이동');
                    handleRedirect(contentId);
                    return;
                }

                // 응답 시간에 따른 적응형 폴링 간격 계산
                const responseTime = Date.now() - startTime;
                const adaptiveInterval = Math.max(1000, Math.min(pollInterval, 3000 - responseTime));

                // 계속 폴링
                setTimeout(checkReadyStatus, adaptiveInterval);
            } catch (error) {
                console.error('[데이터 확인 오류]', error);

                // 오류 발생 시에도 최대 5번 시도
                if (retryCount >= 5) {
                    console.log('[오류 발생] 결과 페이지로 이동');
                    handleRedirect(contentId);
                    return;
                }

                // 오류 발생 시 재시도
                setTimeout(checkReadyStatus, pollInterval);
            }
        };

        // 그룹 정보 로드 함수
        const loadGroupsInfo = async (contentId: string) => {
            try {
                console.log('[그룹 정보 로드] 시작');
                const groupsResponse = await fetch(`/api/content-groups?contentId=${contentId}`);
                if (groupsResponse.ok) {
                    const groupsData = await groupsResponse.json();
                    if (groupsData.groups && groupsData.groups.length > 0) {
                        console.log('[그룹 정보 로드] 성공:', groupsData.groups.length, '개의 그룹');
                        setProcessedGroups(groupsData.groups);
                        return true;
                    }
                }
                console.log('[그룹 정보 로드] 그룹 정보 없음');
                return false;
            } catch (error) {
                console.error('[그룹 정보 로드] 오류:', error);
                return false;
            }
        };

        // 첫 번째 확인 시작
        await checkReadyStatus();
    };

    // 그룹 정보 가져오기 - 성능 개선을 위해 비활성화
    const fetchGroupsInfo = async (contentId: string) => {
        // 성능 최적화를 위해 그룹 정보 가져오기 비활성화
        return;
    };

    const expandSheet = () => {
        setIsExpanded(true);
        setTimeout(() => {
            textareaRef.current?.focus();
        }, 300);
    }

    const collapseSheet = () => {
        if (isLoading) return;
        setIsExpanded(false);
    }

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isExpanded && !isLoading) {
                collapseSheet();
            }
        }
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isExpanded, isLoading]);

    useEffect(() => {
        const handleOpenBottomSheet = (e: Event) => {
            console.log('바텀시트 열기 이벤트 수신됨');
            resetForm();
            expandSheet();
        }

        window.addEventListener('openBottomSheet', handleOpenBottomSheet);
        return () => window.removeEventListener('openBottomSheet', handleOpenBottomSheet);
    }, [isLoading]);

    // 이메일로 구독 신청 기능 추가
    const handleSubscriptionEmail = () => {
        const emailAddress = 'loopa.service@gmail.com';
        const subject = 'LOOPA Subscription Request';
        const body = 'Write your subscription request here:\n\n';

        window.location.href = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        setShowSubscriptionModal(false); // 모달 닫기
    };

    if (false) { // showLoadingScreen 조건을 false로 변경하여 모달이 절대 표시되지 않도록 함
        return <LoadingScreen
            status={loadingUIType}
            progress={loadingProgress}
            previewTitle={generatedTitle || ''}
            processedGroups={processedGroups}
            onClose={handleCloseLoadingScreen}
        />
    }

    return (
        <>
            <motion.div
                className="fixed inset-x-0 bottom-0 z-[60]"
            >
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={collapseSheet}
                        />
                    )}
                </AnimatePresence>

                <div className={`${!isExpanded ? 'bg-[#5F4BB6]/80 backdrop-blur-md' : 'bg-white'} rounded-t-xl shadow-lg/60 overflow-hidden z-[70] relative pb-[env(safe-area-inset-bottom,16px)] max-w-[700px] mx-auto w-full`}>
                    <motion.div
                        initial={{ height: "60px" }}
                        animate={{
                            height: isExpanded ? "calc(60vh - env(safe-area-inset-bottom, 16px))" : "60px",
                            boxShadow: isExpanded ? "0 -10px 30px rgba(0, 0, 0, 0.15)" : "0 -2px 10px rgba(0, 0, 0, 0.05)"
                        }}
                        transition={{
                            type: 'spring',
                            damping: 25,
                            stiffness: 300
                        }}
                    >
                        {!isExpanded && (
                            <div
                                className="h-[60px] cursor-pointer flex items-center justify-center px-4"
                                onClick={expandSheet}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <div className="font-semibold text-lg bg-gradient-to-r from-white to-[#E0DDFF] text-transparent bg-clip-text">
                                        New note
                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                            </div>
                        )}

                        {isExpanded && (
                            <div className="min-h-[50vh] flex flex-col">
                                <div className="flex items-center p-4 border-b border-gray-100 relative">
                                    <button
                                        onClick={collapseSheet}
                                        className="text-gray-500 hover:text-gray-700 absolute left-4 disabled:opacity-50"
                                        disabled={isLoading}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                    <h2 className="text-lg font-semibold text-gray-700 flex-grow text-center">Get instant notes</h2>
                                </div>

                                {isLoading ? (
                                    <div className="p-6 flex-1 flex flex-col items-center justify-center">
                                        <LoadingScreen
                                            status={loadingUIType}
                                            progress={loadingProgress}
                                            previewTitle={generatedTitle || ''}
                                            processedGroups={processedGroups}
                                        />
                                        <p className="mt-4 text-sm text-gray-500">{loadingStatusMessage}</p>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSubmit} className="flex-1 flex flex-col p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
                                        <BottomSheetShortcuts onClose={collapseSheet} />
                                    </form>
                                )}
                            </div>
                        )}
                    </motion.div>
                </div>
            </motion.div>

            {/* 토스트 컨테이너 표시 */}
            <ToastContainer />

        </>
    )
}