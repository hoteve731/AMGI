'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LoadingScreen from './LoadingScreen'
import { useRouter } from 'next/navigation'
import { ContentLimitManager } from '../App'

// 토스트 타입 정의
type ToastType = 'info' | 'success' | 'error' | 'warning';

// 토스트 메시지 인터페이스
interface ToastMessage {
    id: string;
    title: string;
    description?: string;
    type: ToastType;
    duration?: number;
    onClose?: () => void;
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
                                    'bg-blue-100 text-blue-800'
                            }`}
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-semibold text-sm">{toast.title}</h4>
                                {toast.description && (
                                    <p className="text-xs mt-1">{toast.description}</p>
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

    return { toast: addToast, ToastContainer };
}

const MIN_LENGTH = 50;
const MAX_LENGTH = 1500;

export default function BottomSheet() {
    const router = useRouter()
    const [text, setText] = useState('')
    const [additionalMemory, setAdditionalMemory] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [loadingUIType, setLoadingUIType] = useState<'title' | 'content' | 'group' | 'chunk' | 'complete'>('title')
    const [processingStatus, setProcessingStatus] = useState<string | null>(null)
    const [processingError, setProcessingError] = useState<string | null>(null)
    const [processedGroups, setProcessedGroups] = useState<any[]>([])
    const [processedChunks, setProcessedChunks] = useState<Record<string, any[]>>({})
    const [loadingStatusMessage, setLoadingStatusMessage] = useState('제목 생성 중...')
    const [loadingProgress, setLoadingProgress] = useState(0)
    const [generatedTitle, setGeneratedTitle] = useState('')
    const [isExpanded, setIsExpanded] = useState(false)
    const [showAdditionalMemoryInput, setShowAdditionalMemoryInput] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const additionalMemoryRef = useRef<HTMLTextAreaElement>(null)

    const textLength = text.length; // 글자 수 계산
    const isLengthValid = textLength >= MIN_LENGTH && textLength <= MAX_LENGTH;
    const isLengthUnderMin = textLength > 0 && textLength < MIN_LENGTH; // 0보다 클 때만 미만으로 간주
    const isLengthOverMax = textLength > MAX_LENGTH;

    // 토스트 기능 추가
    const { toast, ToastContainer } = useToast();

    // 전역 상태로 사용할 컨텍스트나 상태 관리 라이브러리로 이동하는 것이 좋을 수 있음
    const [pollingContentId, setPollingContentId] = useState<string | null>(null)
    const [showLoadingScreen, setShowLoadingScreen] = useState(false)
    const [isBgProcessing, setIsBgProcessing] = useState(false)

    // 그룹 생성과 카드 생성 단계 추적을 위한 상태 추가
    const [groupProcessingStarted, setGroupProcessingStarted] = useState(false);
    const [firstGroupDetected, setFirstGroupDetected] = useState(false);
    const [isRedirecting, setIsRedirecting] = useState(false);

    // 폴링 카운터 추가
    const pollCount = useRef(0);

    // 글자 수에 따른 카운터 텍스트 스타일 결정 함수
    const getCounterColor = () => {
        if (isLengthUnderMin) return 'text-yellow-600'; // 최소 미만일 때 노란색 경고
        if (isLengthOverMax) return 'text-red-600'; // 최대 초과일 때 빨간색 경고
        return 'text-gray-500'; // 유효 범위일 때 회색
    };

    const getCounterText = () => {
        if (textLength === 0) return `${MAX_LENGTH}자까지 입력 가능`;
        if (isLengthUnderMin) return `${MIN_LENGTH}자 이상 입력해주세요. (${textLength}/${MAX_LENGTH})`;
        if (isLengthOverMax) return `글자 수 초과 (${textLength}/${MAX_LENGTH})`;
        return `${textLength}/${MAX_LENGTH}`;
    }

    const handlePollingComplete = (data: any) => {
        console.log('폴링 완료 처리 - 콘텐츠 ID:', data.content_id);

        if (!isRedirecting) {
            setIsRedirecting(true);
        }

        // 리다이렉트 경로 생성 및 로그 추가
        const targetUrl = `/content/${data.content_id}/groups`;
        console.log('리다이렉트 경로:', targetUrl);

        // 로딩 메시지 최종 업데이트 
        setLoadingUIType('complete');
        setLoadingProgress(100);
        setLoadingStatusMessage('처리가 완료되었습니다. 결과 페이지로 이동합니다...');

        // 리다이렉트 실행
        setTimeout(() => {
            window.location.href = targetUrl;
        }, 1000);
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
        setProcessedChunks({})
        setIsBgProcessing(false)
    }

    const resetForm = () => {
        setText('')
        setAdditionalMemory('')
        setShowAdditionalMemoryInput(false)
        setGeneratedTitle('')
        resetLoadingStates()
    }

    // 에러 처리 함수 수정
    const handleError = (error: string) => {
        console.error('오류 발생:', error);
        alert(`오류가 발생했습니다: ${error}. 홈페이지로 이동합니다.`);
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

        // 사용자에게 알림
        toast({
            title: "백그라운드에서 처리 중",
            description: "기억 카드가 백그라운드에서 계속 생성됩니다. 완료 후 확인하실 수 있습니다.",
            type: "info",
            duration: 5000,
            onClose: () => {
                // 콘텐츠 ID가 없으면 리다이렉션 하지 않음
                if (!pollingContentId) return;

                // 완료 후 상태 초기화 및 리다이렉션
                resetLoadingStates();
                handlePollingComplete(pollingContentId);
            }
        });
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
                    // 3번 이상 연속 실패하면 오류 처리
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
                    setLoadingStatusMessage('그룹 생성 중...');
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
                    handleError('폴링 중 알 수 없는 오류 발생');
                }
            }
        }
    }, [isLoading, pollingContentId, generatedTitle, handlePollingComplete, handleError]);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!showAdditionalMemoryInput) {
            setShowAdditionalMemoryInput(true);
            setTimeout(() => { additionalMemoryRef.current?.focus() }, 300);
            return;
        }

        // 즉시 로딩 상태 설정 (검증 전에 UI 먼저 업데이트)
        setIsLoading(true);
        setShowLoadingScreen(true); // 로딩 화면 표시
        setIsBgProcessing(false);   // 백그라운드 처리 아님
        setLoadingProgress(0);      // 0%에서 시작
        setLoadingUIType('title');  // 첫 단계는 제목 생성
        setLoadingStatusMessage('제목 생성 중...');
        setPollingContentId(null);
        setProcessingStatus('pending');
        setProcessingError(null);
        setProcessedGroups([]);
        setProcessedChunks({});
        setGeneratedTitle('');

        // 입력 길이 검증
        const trimmedText = text.trim();
        if (trimmedText.length < 50) { // 최소 50자 필요
            // 검증 실패 시 로딩 상태 해제
            setIsLoading(false);
            setShowLoadingScreen(false);
            alert('텍스트가 너무 짧습니다. 최소 50자 이상 입력해주세요.');
            return;
        }

        // 입력 텍스트 품질 검사 - 의미 없는 반복 문자 검사
        const repeatedCharsPattern = /(.)\1{15,}/;  // 같은 문자가 15개 이상 연속되는 패턴
        if (repeatedCharsPattern.test(trimmedText)) {
            // 검증 실패 시 로딩 상태 해제
            setIsLoading(false);
            setShowLoadingScreen(false);
            alert('의미 없는 반복 문자가 포함되어 있습니다. 유효한 텍스트를 입력해주세요.');
            return;
        }

        // 의미 없는 문자열 패턴 검사
        const meaninglessPatterns = [
            /^[a-zA-Z0-9\s]{100,}$/,  // 랜덤 문자/숫자만 있는 경우
            /[^\w\s\uAC00-\uD7A3.,?!;:()\-'"\[\]]{20,}/  // 특수문자가 20개 이상 연속되는 경우
        ];

        for (const pattern of meaninglessPatterns) {
            if (pattern.test(trimmedText)) {
                // 검증 실패 시 로딩 상태 해제
                setIsLoading(false);
                setShowLoadingScreen(false);
                alert('의미 없는 텍스트 패턴이 감지되었습니다. 유효한 텍스트를 입력해주세요.');
                return;
            }
        }

        try {
            // 콘텐츠 제한 확인 (비동기 작업이므로 로딩 상태 유지)
            const isAllowed = await ContentLimitManager.handleBottomSheetOpen();
            if (!isAllowed) {
                // 제한에 도달하면 바텀시트를 닫고 구독 모달이 표시됨
                setIsLoading(false);
                setShowLoadingScreen(false);
                collapseSheet();
                return;
            }

            // 축소된 바텀시트 (사용자 입력 화면)
            setIsExpanded(false);

            const generateResponse = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: trimmedText, additionalMemory }),
            });
            let generateData;
            let responseText;

            try {
                responseText = await generateResponse.text();

                // HTML 응답 감지
                if (responseText.trim().toLowerCase().startsWith('<!doctype html>') ||
                    responseText.trim().toLowerCase().startsWith('<html')) {
                    console.error('[Submit] Received HTML instead of JSON:', responseText.substring(0, 100));
                    throw new Error('서버에서 유효하지 않은 응답 형식이 반환되었습니다.');
                }

                try {
                    generateData = JSON.parse(responseText);
                } catch (parseError) {
                    console.error('JSON 파싱 오류:', parseError, '응답:', responseText.substring(0, 100));
                    throw new Error(`응답 파싱 오류: ${responseText.substring(0, 100)}...`);
                }
            } catch (textError) {
                console.error('응답 읽기 오류:', textError);
                // 에러 처리 - contentId는 아직 없음
                handleError('서버 응답 읽기 오류');
                return;
            }

            if (!generateResponse.ok) {
                throw new Error(generateData.error || '콘텐츠 생성 요청 실패');
            }

            const contentId = generateData.content_id;
            if (!contentId) {
                throw new Error('생성된 콘텐츠 ID가 없습니다.');
            }

            // 제목 업데이트
            setGeneratedTitle(generateData.title || '제목 없음');
            setLoadingUIType('group');
            setLoadingProgress(90);
            setLoadingStatusMessage('콘텐츠 분석 및 그룹 생성 중...');

            // 콘텐츠가 준비될 때까지 폴링 실행
            pollReadyStatus(contentId);

        } catch (error) {
            console.error('Error during submission:', error);
            // 콘텐츠 ID가 없으므로 삭제 요청 없이 에러 처리
            handleError(error instanceof Error ? error.message : '콘텐츠 생성 시작 중 오류 발생');
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
        const maxRetries = 30; // 최대 시도 횟수 증가 (30번 = 약 60초)
        const pollInterval = 2000; // 2초마다 체크

        // 데이터 완전성 확인 카운터
        let dataConsistencyCounter = 0;
        const requiredConsistentChecks = 2; // 연속 2번 동일한 완료 상태 확인 필요

        const checkReadyStatus = async () => {
            try {
                retryCount++;
                console.log(`[데이터 확인] ${retryCount}번째 시도...`);

                const checkResponse = await fetch(`/api/check-content?id=${contentId}`);
                if (!checkResponse.ok) {
                    throw new Error(`API 응답 오류: ${checkResponse.status}`);
                }

                const checkData = await checkResponse.json();
                console.log('[데이터 확인 결과]:', checkData);

                // 백엔드 상태에 따른 UI 업데이트
                if (checkData.processingStatus) {
                    setProcessingStatus(checkData.processingStatus);

                    switch (checkData.processingStatus) {
                        case 'pending':
                        case 'received':
                        case 'title_generated':
                            if (loadingUIType !== 'title') {
                                setLoadingUIType('title');
                                setLoadingProgress(30);
                                setLoadingStatusMessage('제목 생성 중...');
                            }
                            // 제목이 있으면 표시
                            if (checkData.title) {
                                setGeneratedTitle(checkData.title);
                            }
                            break;

                        case 'groups_generating':
                        case 'groups_generated':
                            if (loadingUIType !== 'group') {
                                setLoadingUIType('group');
                                setLoadingProgress(50);
                                setLoadingStatusMessage('그룹 생성 중...');
                            }
                            // 제목이 있으면 표시
                            if (checkData.title) {
                                setGeneratedTitle(checkData.title);
                            }
                            break;

                        case 'chunks_generating':
                            if (loadingUIType !== 'chunk') {
                                setLoadingUIType('chunk');
                                setLoadingProgress(70);
                                setLoadingStatusMessage('기억 카드 생성 중...');
                            }
                            // 청크 수에 따른 진행률 업데이트
                            if (checkData.totalChunksCount > 0) {
                                const progress = Math.min(90, 70 + Math.min(checkData.totalChunksCount * 2, 20));
                                setLoadingProgress(progress);
                            }
                            break;

                        case 'completed':
                            // 완료 상태 확인 로직 (아래에서 처리)
                            break;

                        case 'failed':
                            setLoadingStatusMessage('처리 중 오류가 발생했습니다. 홈으로 이동합니다...');
                            setTimeout(() => {
                                window.location.href = '/';
                            }, 3000);
                            return;
                    }
                }

                // 그룹 정보 가져오기 (그룹이 있는 경우)
                if (checkData.groupsCount > 0) {
                    try {
                        // 그룹 정보 가져오기
                        const groupsResponse = await fetch(`/api/content-groups?contentId=${contentId}`);
                        if (groupsResponse.ok) {
                            const groupsData = await groupsResponse.json();
                            if (groupsData.groups && groupsData.groups.length > 0) {
                                setProcessedGroups(groupsData.groups);
                            }
                        } else if (groupsResponse.status === 404) {
                            // 404 오류는 조용히 무시 (API가 아직 배포 중일 수 있음)
                            console.log('[그룹 정보] API가 아직 준비되지 않았습니다. 다음 폴링에서 다시 시도합니다.');
                        } else {
                            console.warn(`[그룹 정보] 응답 오류: ${groupsResponse.status}`);
                        }
                    } catch (groupError) {
                        // 네트워크 오류 등은 로깅만 하고 폴링은 계속 진행
                        console.warn('그룹 정보 가져오기 오류 (폴링은 계속 진행):', groupError);
                    }
                }

                // 완료 상태 확인
                if (checkData.processingStatus === 'completed' && checkData.groupsCount > 0 && checkData.chunksExist) {
                    // 데이터 일관성 확인 카운터 증가
                    dataConsistencyCounter++;
                    console.log(`[완료 확인] 데이터 일관성 체크: ${dataConsistencyCounter}/${requiredConsistentChecks}`);

                    // 연속으로 일정 횟수 이상 완료 상태 확인 시 진짜 완료로 간주
                    if (dataConsistencyCounter >= requiredConsistentChecks) {
                        console.log('[데이터 준비 완료] 리다이렉트 준비');

                        // 완료 UI로 전환
                        setLoadingUIType('complete');
                        setLoadingProgress(100);
                        setLoadingStatusMessage('처리 완료! 결과 페이지로 이동합니다...');

                        // 추가 데이터 검증
                        try {
                            // 모든 그룹에 청크가 있는지 확인
                            const allGroupsResult = await fetch(`/api/content-groups?contentId=${contentId}&includeChunks=true`);
                            if (!allGroupsResult.ok) {
                                throw new Error(`그룹 데이터 확인 오류: ${allGroupsResult.status}`);
                            }

                            const allGroupsData = await allGroupsResult.json();

                            let allGroupsComplete = true;
                            if (allGroupsData.groups) {
                                for (const group of allGroupsData.groups) {
                                    if (!group.chunks || group.chunks.length === 0) {
                                        allGroupsComplete = false;
                                        break;
                                    }
                                }
                            }

                            if (allGroupsComplete) {
                                // 데이터가 완전히 준비된 경우에만 리다이렉트
                                setTimeout(() => {
                                    const targetUrl = `/content/${contentId}/groups`;
                                    console.log('[리다이렉트] 결과 페이지로 이동:', targetUrl);
                                    window.location.href = targetUrl;
                                }, 1500); // 1.5초 후 리다이렉트
                                return;
                            } else {
                                // 일부 그룹에 청크가 없는 경우 계속 폴링
                                console.log('[데이터 불완전] 일부 그룹에 청크가 없음, 계속 폴링');
                                dataConsistencyCounter = 0; // 카운터 리셋
                            }
                        } catch (error) {
                            console.error('데이터 검증 오류:', error);
                            // 오류 발생 시 기본 로직으로 진행
                            setTimeout(() => {
                                const targetUrl = `/content/${contentId}/groups`;
                                window.location.href = targetUrl;
                            }, 2000);
                            return;
                        }
                    }
                } else {
                    // 완료 상태가 아닌 경우 카운터 리셋
                    dataConsistencyCounter = 0;
                }

                // 최대 시도 횟수 도달 확인
                if (retryCount >= maxRetries) {
                    console.log('[최대 시도 횟수 도달] 로딩 상태 업데이트 중지, 결과 페이지로 이동');

                    setLoadingUIType('chunk');
                    setLoadingProgress(95);
                    setLoadingStatusMessage('데이터 처리 시간이 예상보다 길어지고 있습니다. 결과 페이지로 이동합니다.');

                    toast({
                        title: "처리 시간 지연",
                        description: "백그라운드에서 계속 처리됩니다. 결과 페이지에서 잠시 후 확인해주세요.",
                        type: "info",
                        duration: 3000,
                        onClose: () => {
                            const targetUrl = `/content/${contentId}/groups`;
                            console.log('타임아웃 리다이렉트 경로:', targetUrl);
                            window.location.href = targetUrl;
                        }
                    });
                    return;
                }

                // 계속 폴링
                setTimeout(checkReadyStatus, pollInterval);
            } catch (error) {
                console.error('[데이터 확인 오류]', error);

                // 오류 발생 시에도 최대 5번 시도
                if (retryCount >= 5) {
                    console.log('[오류 발생] 결과 페이지로 이동');

                    setLoadingUIType('chunk');
                    setLoadingProgress(90);
                    setLoadingStatusMessage('상태 확인 중 오류 발생. 결과 페이지로 이동하여 확인해주세요.');

                    toast({
                        title: "상태 확인 오류",
                        description: "결과 페이지로 이동하여 처리 상태를 확인해주세요.",
                        type: "warning",
                        duration: 3000,
                        onClose: () => {
                            const targetUrl = `/content/${contentId}/groups`;
                            console.log('오류 발생 리다이렉트 경로:', targetUrl);
                            window.location.href = targetUrl;
                        }
                    });
                    return;
                }

                // 오류 발생 시 재시도
                setTimeout(checkReadyStatus, pollInterval);
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

    if (showLoadingScreen) {
        return <LoadingScreen
            status={loadingUIType}
            progress={loadingProgress}
            previewTitle={generatedTitle}
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
                            className="fixed inset-0 bg-black/30 z-40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={collapseSheet}
                        />
                    )}
                </AnimatePresence>

                <div className="bg-white rounded-t-xl shadow-lg/60 overflow-hidden z-[70] relative pb-[env(safe-area-inset-bottom,16px)]">
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
                        {!isExpanded && (
                            <div
                                className="p-4 h-[80px] cursor-pointer flex items-center"
                                onClick={expandSheet}
                            >
                                <div className="w-full">
                                    <div className="text-[#7C6FFB] font-medium text-sm mb-1">
                                        기억하고 싶은 텍스트
                                    </div>
                                    <div className="text-gray-400 text-base truncate">
                                        {text ? text : '여기에 타이핑하거나 붙여넣으세요...'}
                                    </div>
                                </div>
                                <div className="flex-shrink-0 ml-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#7969F7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                            </div>
                        )}

                        {isExpanded && (
                            <div className="h-full flex flex-col">
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
                                    <h2 className="text-lg font-medium text-gray-700 flex-grow text-center">새 기억 카드 생성</h2>
                                    <motion.button
                                        type="button"
                                        onClick={handleSubmit}
                                        disabled={isLoading || (!showAdditionalMemoryInput && (text.trim().length === 0 || !isLengthValid))}
                                        className="px-4 py-1.5 bg-[#7969F7] text-white rounded-full shadow-lg/60 text-sm font-bold absolute right-4 disabled:opacity-50 disabled:cursor-not-allowed"
                                        whileHover={{ scale: (isLoading || (!showAdditionalMemoryInput && (text.trim().length === 0 || !isLengthValid))) ? 1 : 1.05 }}
                                        whileTap={{ scale: (isLoading || (!showAdditionalMemoryInput && (text.trim().length === 0 || !isLengthValid))) ? 1 : 0.95 }}
                                    >
                                        {showAdditionalMemoryInput ? '생성하기' : '다음'}
                                    </motion.button>
                                </div>

                                {isLoading ? (
                                    <div className="p-6 flex-1 flex flex-col items-center justify-center">
                                        <LoadingScreen
                                            status={loadingUIType}
                                            progress={loadingProgress}
                                            previewTitle={generatedTitle}
                                            processedGroups={processedGroups}
                                        />
                                        <p className="mt-4 text-sm text-gray-500">{loadingStatusMessage}</p>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSubmit} className="flex-1 flex flex-col p-4 overflow-y-auto">
                                        <div className="text-[#7C6FFB] font-medium text-sm mb-2">
                                            기억하고 싶은 텍스트
                                        </div>
                                        <AnimatePresence mode="wait" initial={false}>
                                            {showAdditionalMemoryInput ? (
                                                <motion.div key="additional-memory-view" className="flex flex-col mb-3">
                                                    <textarea
                                                        ref={additionalMemoryRef}
                                                        value={additionalMemory}
                                                        onChange={(e) => setAdditionalMemory(e.target.value)}
                                                        placeholder="(선택) 특별히 기억하고 싶은 부분을 알려주세요."
                                                        className="w-full h-20 resize-none rounded-lg p-2 focus:outline-none text-base border border-gray-200 focus:border-[#A99BFF] focus:border-2 mb-2"
                                                        disabled={isLoading}
                                                    />
                                                    <div
                                                        className="w-full border border-gray-200 rounded-lg p-3 bg-gray-50 text-base cursor-pointer"
                                                        style={{ minHeight: "80px" }}
                                                        onClick={() => setShowAdditionalMemoryInput(false)}
                                                    >
                                                        <div className="mb-2 text-xs text-[#7969F7] flex items-center">
                                                            수정
                                                        </div>
                                                        <p className="text-gray-700 whitespace-pre-wrap text-base">{text}</p>
                                                    </div>
                                                </motion.div>
                                            ) : (
                                                <motion.div key="text-input-view" className="flex-1 flex flex-col">
                                                    <textarea
                                                        ref={textareaRef}
                                                        value={text}
                                                        onChange={(e) => setText(e.target.value)}
                                                        placeholder="여기에 타이핑하거나 붙여넣으세요..."
                                                        className={`flex-grow w-full p-3 border ${isLengthOverMax ? 'border-red-300' : 'border-gray-200'} rounded-lg resize-none focus:outline-none focus:ring-2 ${isLengthOverMax ? 'focus:ring-red-500/50' : 'focus:ring-[#9488f7]/50'} focus:border-transparent transition-shadow duration-150 text-base leading-relaxed`}
                                                        disabled={isLoading}
                                                    />
                                                    <div className={`text-right text-xs mt-1.5 ${getCounterColor()}`}>
                                                        {getCounterText()}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
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