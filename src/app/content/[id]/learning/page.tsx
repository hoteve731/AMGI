'use client'

import { useEffect, useState, use, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClientComponentClient, Session } from '@supabase/auth-helpers-nextjs'
import { Dialog } from '@headlessui/react'
import { subscribeUserToPush } from '@/utils/pushNotification'

type ChunkProgress = {
    repetitions: number;
    easeFactor: number;
    interval: number;
    nextReviewDate: Date;
}

type Chunk = {
    id: string;
    group_id: string;
    summary: string;
    masked_text: string;
    order: number;
}

type ContentGroup = {
    id: string;
    content_id: string;
    title: string;
    original_text: string;
    chunks: Chunk[];
}

type Content = {
    id: string;
    title: string;
    user_id: string;
    original_text: string;
    created_at: string;
    status: string;
    progress?: { [chunkIndex: number]: ChunkProgress };
    groups?: ContentGroup[];
}

function formatTimeRemaining(date: Date): string {
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    if (diff <= 0) return '지금 복습';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}일 후 알림`;
    if (hours > 0) return `${hours}시간 후 알림`;
    return `${minutes}분 후 알림`;
}

export default function LearningPage({ params }: { params: Promise<{ id: string }> }) {
    const id = use(params).id;
    const searchParams = useSearchParams();
    const chunkId = searchParams.get('chunk'); // URL에서 청크 ID 가져오기

    const [content, setContent] = useState<Content | null>(null);
    const [currentChunk, setCurrentChunk] = useState<Chunk | null>(null);
    const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isFlipped, setIsFlipped] = useState(false);
    const router = useRouter();
    const supabase = createClientComponentClient();
    const [session, setSession] = useState<Session | null>(null);
    const [showNotificationRequest, setShowNotificationRequest] = useState(false);
    const [serviceWorkerRegistration, setServiceWorkerRegistration] = useState<ServiceWorkerRegistration | null>(null);

    // Supabase에 구독 정보 저장
    const saveSubscriptionToSupabase = useCallback(async (subscription: PushSubscription) => {
        try {
            // 인증 세션 오류 방지를 위한 처리
            let userId = null;

            try {
                const { data, error } = await supabase.auth.getUser();

                if (!error && data.user && data.user.id) {
                    userId = data.user.id;
                    console.log('인증된 사용자 ID:', userId);

                    // 인증된 사용자만 Supabase에 구독 정보 저장
                    const { error: upsertError } = await supabase
                        .from('push_subscriptions')
                        .upsert({
                            user_id: userId,
                            endpoint: subscription.endpoint,
                            p256dh_key: subscription.toJSON().keys?.p256dh,
                            auth_key: subscription.toJSON().keys?.auth,
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'endpoint'
                        });

                    if (upsertError) {
                        console.error('구독 정보 저장 실패:', upsertError);
                    } else {
                        console.log('푸시 구독 정보가 저장되었습니다.');
                    }
                } else {
                    console.log('인증된 사용자 정보가 없습니다. 로컬에만 구독 정보를 저장합니다.');
                    // 로컬 스토리지에 구독 정보 저장
                    localStorage.setItem('push_subscription', JSON.stringify(subscription.toJSON()));
                }
            } catch (authError) {
                console.log('인증 세션 오류 (무시됨):', authError);
                // 로컬 스토리지에 구독 정보 저장
                localStorage.setItem('push_subscription', JSON.stringify(subscription.toJSON()));
            }
        } catch (error) {
            console.error('구독 정보 처리 실패:', error);
            // 오류가 발생해도 학습 페이지는 계속 사용할 수 있도록 함
        }
    }, [supabase]);

    // 세션 변경 감지 및 콘텐츠 로드 트리거
    useEffect(() => {
        const { data: authListener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('Auth state changed:', event, session);
                setSession(session);

                if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
                    await fetchContentAndChunk();
                }
            }
        );

        return () => {
            authListener?.subscription.unsubscribe();
        };
    }, [id, chunkId, supabase]);

    // 콘텐츠 및 특정 청크 데이터 로드 함수
    const fetchContentAndChunk = useCallback(async () => {
        if (!id) return;

        setIsLoading(true);
        console.log(`Fetching content ${id} and chunk ${chunkId}`);
        let contentData: Content | null = null;
        let fetchError: Error | null = null;

        try {
            // 먼저 로컬 스토리지 확인
            const localContent = localStorage.getItem(`content_${id}`);
            if (localContent) {
                console.log('로컬 스토리지에서 콘텐츠 로드 시도.');
                contentData = JSON.parse(localContent);
                setContent(contentData); // 먼저 로컬 데이터로 UI 업데이트
            }

            // Supabase 클라이언트 준비 및 세션 확인
            console.log('Supabase 세션 확인 중...');
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

            if (sessionError) {
                console.error('세션 확인 오류:', sessionError);
                if (!contentData) {
                    fetchError = sessionError;
                }
            } else {
                console.log('현재 세션:', sessionData.session);

                // 이제 Supabase에서 콘텐츠 가져오기
                console.log('Supabase에서 콘텐츠 가져오기 시도...');

                // 콘텐츠 기본 정보 가져오기
                const { data: contentResult, error: contentError } = await supabase
                    .from('contents')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (contentError) {
                    console.error('콘텐츠 가져오기 오류:', contentError);
                    if (!contentData) fetchError = contentError;
                } else if (contentResult) {
                    contentData = contentResult as Content;

                    // 그룹 정보 가져오기
                    const { data: groupsData, error: groupsError } = await supabase
                        .from('content_groups')
                        .select('*, chunks:content_chunks(*)')
                        .eq('content_id', id)
                        .order('id');

                    if (groupsError) {
                        console.error('그룹 정보 가져오기 오류:', groupsError);
                    } else if (groupsData) {
                        contentData.groups = groupsData as ContentGroup[];
                        console.log('그룹 정보 로드 완료:', contentData.groups);

                        // 현재 청크 찾기
                        if (chunkId && contentData.groups) {
                            let foundChunk: Chunk | null = null;
                            let groupIndex = -1;

                            for (let i = 0; i < contentData.groups.length; i++) {
                                const group = contentData.groups[i];
                                const chunk = group.chunks.find(c => c.id === chunkId);
                                if (chunk) {
                                    foundChunk = chunk;
                                    groupIndex = i;
                                    break;
                                }
                            }

                            if (foundChunk) {
                                setCurrentChunk(foundChunk);
                                setCurrentGroupIndex(groupIndex);
                                console.log(`청크 ${chunkId} 찾음, 그룹 인덱스: ${groupIndex}`);
                            } else if (contentData.groups.length > 0 && contentData.groups[0].chunks.length > 0) {
                                // 청크를 찾지 못했지만 첫 번째 그룹의 첫 번째 청크가 있으면 사용
                                setCurrentChunk(contentData.groups[0].chunks[0]);
                                setCurrentGroupIndex(0);
                                console.log(`청크 ${chunkId} 찾지 못함, 첫 번째 청크 사용`);
                            }
                        } else if (contentData.groups && contentData.groups.length > 0 && contentData.groups[0].chunks.length > 0) {
                            // 청크 ID가 없으면 첫 번째 그룹의 첫 번째 청크 사용
                            setCurrentChunk(contentData.groups[0].chunks[0]);
                            setCurrentGroupIndex(0);
                            console.log('청크 ID 없음, 첫 번째 청크 사용');
                        }
                    }

                    setContent(contentData);
                    localStorage.setItem(`content_${id}`, JSON.stringify(contentData));
                    console.log('콘텐츠 및 그룹 정보 저장 완료');
                }
            }
        } catch (err: any) {
            console.error('fetchContentAndChunk 실행 중 예외 발생:', err);
            if (!contentData) fetchError = err;
        } finally {
            setIsLoading(false);
        }

        // 최종 오류 처리
        if (fetchError && !contentData) {
            console.error('최종 콘텐츠/청크 로드 실패:', fetchError);
            alert('콘텐츠를 불러올 수 없습니다. 홈으로 이동합니다.');
            router.push('/');
        } else if (!currentChunk && chunkId && contentData) {
            console.error(`청크 ${chunkId} 찾지 못함`);
            alert(`요청한 청크를 찾을 수 없습니다. 첫 번째 청크를 표시합니다.`);
            if (contentData.groups && contentData.groups.length > 0 && contentData.groups[0].chunks.length > 0) {
                setCurrentChunk(contentData.groups[0].chunks[0]);
                setCurrentGroupIndex(0);
            } else {
                router.push('/');
            }
        }
    }, [id, chunkId, router, supabase]);

    // Service Worker 등록 및 푸시 구독
    useEffect(() => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('푸시 알림이 지원되지 않는 브라우저입니다.');
            return;
        }

        async function setupPushNotification() {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js');
                console.log('ServiceWorker 등록 성공:', registration.scope);
                setServiceWorkerRegistration(registration);

                // 기존 구독 확인
                const existingSubscription = await registration.pushManager.getSubscription();
                if (existingSubscription) {
                    console.log('기존 푸시 구독이 있습니다:', existingSubscription);
                    await saveSubscriptionToSupabase(existingSubscription);
                }
            } catch (err) {
                console.error('ServiceWorker 등록 실패:', err);
            }
        }

        setupPushNotification();
    }, [saveSubscriptionToSupabase]);

    // 알림 권한 상태 확인 및 요청
    useEffect(() => {
        const checkNotificationPermission = () => {
            console.log('현재 알림 권한 상태:', Notification.permission);

            if ('Notification' in window) {
                if (Notification.permission === 'default') {
                    console.log('알림 권한 요청 모달 표시');
                    setShowNotificationRequest(true);
                } else {
                    console.log('알림 권한 상태:', Notification.permission);
                }
            }
        };

        checkNotificationPermission();
    }, []);

    // 알림 권한 요청 처리
    const handleRequestNotification = async () => {
        setShowNotificationRequest(false);

        try {
            const permission = await Notification.requestPermission();
            console.log('알림 권한 요청 결과:', permission);

            if (permission === 'granted') {
                // 권한이 허용되면 푸시 구독 진행
                if (serviceWorkerRegistration) {
                    const subscription = await subscribeUserToPush(serviceWorkerRegistration);
                    if (subscription) {
                        await saveSubscriptionToSupabase(subscription);
                    }
                }
            }
        } catch (error) {
            console.error('알림 권한 요청 오류:', error);
        }
    };

    // 카드 뒤집기 핸들러
    const handleFlip = () => {
        setIsFlipped(!isFlipped);
    };

    // 난이도 버튼 핸들러
    const handleDifficulty = (level: 'easy' | 'medium' | 'hard') => {
        if (!content || !currentChunk) return;

        console.log(`난이도 선택: ${level}, 청크 ID: ${currentChunk.id}`);

        // 다음 청크로 이동
        handleNextChunk();
    };

    // 다음 청크로 이동
    const handleNextChunk = () => {
        if (!content || !content.groups || !currentChunk) return;

        const currentGroup = content.groups[currentGroupIndex];
        if (!currentGroup) return;

        // 현재 그룹에서 현재 청크의 인덱스 찾기
        const currentChunkIndex = currentGroup.chunks.findIndex(c => c.id === currentChunk.id);

        if (currentChunkIndex < currentGroup.chunks.length - 1) {
            // 같은 그룹의 다음 청크로 이동
            const nextChunk = currentGroup.chunks[currentChunkIndex + 1];
            router.push(`/content/${id}/learning?chunk=${nextChunk.id}`);
            setCurrentChunk(nextChunk);
            setIsFlipped(false);
        } else if (currentGroupIndex < content.groups.length - 1) {
            // 다음 그룹의 첫 번째 청크로 이동
            const nextGroup = content.groups[currentGroupIndex + 1];
            if (nextGroup.chunks.length > 0) {
                const nextChunk = nextGroup.chunks[0];
                router.push(`/content/${id}/learning?chunk=${nextChunk.id}`);
                setCurrentChunk(nextChunk);
                setCurrentGroupIndex(currentGroupIndex + 1);
                setIsFlipped(false);
            }
        } else {
            // 모든 청크를 학습 완료
            alert('모든 카드를 학습했습니다!');
            router.push('/');
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!content || !currentChunk) {
        return (
            <div className="p-4 text-center">
                <p className="text-red-500">콘텐츠를 표시할 수 없습니다.</p>
                <button
                    onClick={() => router.push('/')}
                    className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                    홈으로 돌아가기
                </button>
            </div>
        );
    }

    const currentGroup = content.groups?.[currentGroupIndex];
    const currentChunkIndex = currentGroup?.chunks.findIndex(c => c.id === currentChunk.id) ?? -1;

    return (
        <div className="p-4 max-w-md mx-auto">
            <h1 className="text-xl font-bold mb-2">{content.title}</h1>
            {currentGroup && (
                <h2 className="text-lg mb-4">{currentGroup.title}</h2>
            )}

            <div className="text-sm text-gray-600 mb-4">
                카드: {currentChunkIndex + 1} / {currentGroup?.chunks.length || 0}
            </div>

            {/* 카드 표시 영역 */}
            <div
                className="relative w-full h-64 border rounded-lg p-4 mb-4 cursor-pointer"
                onClick={handleFlip}
                style={{ perspective: '1000px' }}
            >
                <div
                    className="absolute inset-0 w-full h-full transition-transform duration-700"
                    style={{
                        transformStyle: 'preserve-3d',
                        transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                    }}
                >
                    {/* 앞면 (마스킹된 텍스트) */}
                    <div
                        className="absolute inset-0 w-full h-full bg-white flex items-center justify-center p-4"
                        style={{ backfaceVisibility: 'hidden' }}
                    >
                        <p>{currentChunk.masked_text}</p>
                    </div>

                    {/* 뒷면 (요약) */}
                    <div
                        className="absolute inset-0 w-full h-full bg-gray-100 flex items-center justify-center p-4"
                        style={{
                            backfaceVisibility: 'hidden',
                            transform: 'rotateY(180deg)'
                        }}
                    >
                        <p>{currentChunk.summary || '내용 없음'}</p>
                    </div>
                </div>
            </div>

            {/* 난이도 버튼 (카드 뒷면 표시될 때 활성화) */}
            {isFlipped && (
                <div className="flex justify-around mb-4">
                    <button
                        onClick={() => handleDifficulty('hard')}
                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
                    >
                        어려움
                    </button>
                    <button
                        onClick={() => handleDifficulty('medium')}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded"
                    >
                        보통
                    </button>
                    <button
                        onClick={() => handleDifficulty('easy')}
                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
                    >
                        쉬움
                    </button>
                </div>
            )}

            {/* 다음 카드로 이동 버튼 */}
            <button
                onClick={handleNextChunk}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded mt-4"
            >
                다음 카드
            </button>

            {/* 홈으로 돌아가기 버튼 */}
            <button
                onClick={() => router.push('/')}
                className="w-full bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded mt-2"
            >
                학습 종료
            </button>

            {/* 알림 권한 요청 다이얼로그 */}
            <Dialog
                open={showNotificationRequest}
                onClose={() => setShowNotificationRequest(false)}
                className="fixed z-10 inset-0 overflow-y-auto"
            >
                <div className="flex items-center justify-center min-h-screen">
                    {/* Dialog.Overlay 대신 일반 div 사용 */}
                    <div className="fixed inset-0 bg-black opacity-30" />

                    <div className="relative bg-white rounded max-w-md mx-auto p-6">
                        <Dialog.Title className="text-lg font-medium mb-2">
                            알림 권한 요청
                        </Dialog.Title>
                        <Dialog.Description className="mb-4">
                            복습 알림을 받으려면 알림 권한을 허용해주세요.
                        </Dialog.Description>

                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => setShowNotificationRequest(false)}
                                className="px-4 py-2 bg-gray-300 rounded"
                            >
                                나중에
                            </button>
                            <button
                                onClick={handleRequestNotification}
                                className="px-4 py-2 bg-blue-500 text-white rounded"
                            >
                                허용하기
                            </button>
                        </div>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}