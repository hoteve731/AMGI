'use client'

import { useEffect, useState, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Dialog } from '@headlessui/react'
import { subscribeUserToPush } from '@/utils/pushNotification'

type ChunkProgress = {
    repetitions: number;
    easeFactor: number;
    interval: number;
    nextReviewDate: Date;
}

type Content = {
    id: string
    title: string
    chunks: Array<{ summary: string }>
    masked_chunks: Array<{ masked_text: string }>
    progress?: { [chunkIndex: number]: ChunkProgress }
}

function maskText(text: string | undefined, isFlipped: boolean) {
    if (!text) return ''
    return text.replace(/\*\*([^*]+)\*\*/g, (_, word) =>
        isFlipped
            ? `<span class="font-bold text-purple-600">${word}</span>`
            : '<span class="inline-block w-12 h-5 bg-black rounded align-text-bottom mx-1"></span>'
    )
}

function calculateNextReview(quality: number, prevProgress?: ChunkProgress): ChunkProgress {
    const progress = prevProgress || {
        repetitions: 0,
        easeFactor: 2.5,
        interval: 0,
        nextReviewDate: new Date()
    };

    // 연속 성공/실패 횟수에 따른 간격 조정
    if (quality >= 3) {  // 성공한 경우
        let newInterval: number;

        if (progress.repetitions === 0) {
            // 첫 복습: 기본 간격
            newInterval = quality === 5 ? 40 : quality === 4 ? 30 : 20;
        } else {
            // 이전 복습 간격의 easeFactor 배
            const baseInterval = progress.interval;
            newInterval = Math.ceil(baseInterval * progress.easeFactor);

            // 연속 성공에 따른 추가 간격 증가
            if (progress.repetitions > 2) {
                newInterval *= 1.5;  // 3회 이상 연속 성공시 50% 더 긴 간격
            }
        }

        // easeFactor 조정: 성공할수록 증가
        const newEaseFactor = progress.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

        return {
            repetitions: progress.repetitions + 1,
            easeFactor: Math.max(1.3, newEaseFactor),
            interval: newInterval,
            nextReviewDate: new Date(Date.now() + newInterval * 1000)  // 테스트용 초단위
        };
    } else {  // 실패한 경우
        // 실패시 간격 감소
        const newInterval = Math.max(10, progress.interval * 0.5);  // 최소 10초는 보장

        return {
            repetitions: 0,  // 실패시 반복 횟수 리셋
            easeFactor: Math.max(1.3, progress.easeFactor * 0.8),  // easeFactor 감소
            interval: newInterval,
            nextReviewDate: new Date(Date.now() + newInterval * 1000)
        };
    }
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
    const id = use(params).id
    const [content, setContent] = useState<Content | null>(null)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isFlipped, setIsFlipped] = useState(false)
    const router = useRouter()
    const supabase = createClientComponentClient()
    const [showNotificationRequest, setShowNotificationRequest] = useState(false);
    const [serviceWorkerRegistration, setServiceWorkerRegistration] = useState<ServiceWorkerRegistration | null>(null);

    // Supabase에 구독 정보 저장
    const saveSubscriptionToSupabase = useCallback(async (subscription: PushSubscription) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            const { error } = await supabase
                .from('push_subscriptions')
                .upsert({
                    user_id: user.id,
                    endpoint: subscription.endpoint,
                    p256dh_key: subscription.toJSON().keys?.p256dh,
                    auth_key: subscription.toJSON().keys?.auth,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'endpoint'
                });

            if (error) throw error;
            console.log('푸시 구독 정보가 저장되었습니다.');
        } catch (error) {
            console.error('구독 정보 저장 실패:', error);
        }
    }, [supabase]);

    useEffect(() => {
        if (!id) return

        const fetchContent = async () => {
            const { data, error } = await supabase
                .from('contents')
                .select('*')
                .eq('id', id)
                .single()

            if (error) {
                console.error('Error fetching content:', error)
                router.push('/')
                return
            }

            setContent(data)
        }

        fetchContent()
    }, [id, router, supabase])

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
        // 즉시 권한 상태 확인
        const checkNotificationPermission = () => {
            console.log('현재 알림 권한 상태:', Notification.permission); // 디버깅용

            if ('Notification' in window) {
                if (Notification.permission === 'default') {
                    console.log('알림 권한 요청 모달 표시'); // 디버깅용
                    setShowNotificationRequest(true);
                } else {
                    console.log('알림 권한 상태:', Notification.permission); // 디버깅용
                }
            } else {
                console.log('이 브라우저는 알림을 지원하지 않습니다.'); // 디버깅용
            }
        };

        // 컴포넌트 마운트 시 즉시 실행
        checkNotificationPermission();

        // 1초 후에도 한 번 더 체크 (브라우저 초기화 지연 대응)
        const timer = setTimeout(checkNotificationPermission, 1000);

        return () => clearTimeout(timer);
    }, []);

    // 알림 권한 요청 및 구독 처리
    const requestNotificationPermission = async () => {
        try {
            console.log('알림 권한 요청 시작');

            if (!('Notification' in window)) {
                console.error('이 브라우저는 알림을 지원하지 않습니다.');
                alert('이 브라우저는 알림을 지원하지 않습니다.');
                return;
            }

            console.log('현재 알림 권한 상태:', Notification.permission);

            // 이미 거부된 상태라면 안내 메시지 표시
            if (Notification.permission === 'denied') {
                alert('알림이 차단되어 있습니다. 브라우저 설정에서 알림을 허용해주세요.\n\nChrome: 설정 > 개인정보 및 보안 > 사이트 설정 > 알림');
                return;
            }

            const permission = await Notification.requestPermission();
            console.log('알림 권한 요청 결과:', permission);

            if (permission === 'granted') {
                console.log('알림 권한이 허용되었습니다.');
                setShowNotificationRequest(false);

                if (serviceWorkerRegistration) {
                    console.log('Service Worker 등록 상태:', serviceWorkerRegistration);
                    const subscription = await subscribeUserToPush(serviceWorkerRegistration);
                    console.log('푸시 구독 결과:', subscription);

                    if (subscription) {
                        await saveSubscriptionToSupabase(subscription);
                        console.log('구독 정보가 Supabase에 저장되었습니다.');

                        // 테스트 알림 발송
                        new Notification('알림 설정 완료', {
                            body: '이제 복습 알림을 받을 수 있습니다.',
                            icon: '/icons/icon-192x192.png'
                        });
                    }
                } else {
                    console.error('Service Worker가 등록되지 않았습니다.');
                }
            } else {
                console.log('알림 권한이 거부되었습니다:', permission);
                alert('알림이 차단되었습니다. 브라우저 설정에서 알림을 허용해주세요.\n\nChrome: 설정 > 개인정보 및 보안 > 사이트 설정 > 알림');
            }
        } catch (error) {
            console.error('알림 권한 요청 중 오류 발생:', error);
            alert('알림 설정 중 오류가 발생했습니다. 브라우저 설정을 확인해주세요.');
        }
    };

    // URL에서 chunk 파라미터 가져오기
    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const chunkParam = searchParams.get('chunk');
        if (chunkParam) {
            setCurrentIndex(parseInt(chunkParam));
            setIsFlipped(true);
        }
    }, []);

    const handleQualitySelect = async (quality: number) => {
        if (!content) return;

        const newProgress = calculateNextReview(quality, content.progress?.[currentIndex]);
        const updatedProgress = {
            ...content.progress,
            [currentIndex]: newProgress
        };

        // id 사용
        await supabase
            .from('contents')
            .update({ progress: updatedProgress })
            .eq('id', id);

        setContent(prev => prev ? { ...prev, progress: updatedProgress } : null);

        // scheduleNotification 함수 호출
        if (serviceWorkerRegistration) {
            const notificationData = {
                title: '기억을 꺼낼 시간이에요 🧠',
                body: `${content.title}의 ${currentIndex + 1}번째 카드, 지금이 기억할 타이밍이에요.`,
                contentId: content.id,
                chunkIndex: currentIndex
            };

            const delay = newProgress.nextReviewDate.getTime() - Date.now();
            if (delay > 0) {
                console.log('알림 예약:', {
                    title: notificationData.title,
                    body: notificationData.body,
                    delay: delay,
                    scheduledTime: new Date(Date.now() + delay).toISOString()
                });
                setTimeout(async () => {
                    if (Notification.permission === 'granted') {
                        try {
                            const existingSubscription = await serviceWorkerRegistration.pushManager.getSubscription();
                            if (existingSubscription) {
                                await fetch('/api/push', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        subscription: existingSubscription,
                                        notification: notificationData
                                    }),
                                });
                                console.log('푸시 알림 전송 요청 완료');
                            } else {
                                console.error('푸시 구독이 없습니다.');
                            }
                        } catch (error) {
                            console.error('푸시 알림 전송 실패:', error);
                        }
                    }
                }, delay);
            }
        }

        handleNext();
    };

    const handleNext = () => {
        if (!content) return;

        if (currentIndex === content.chunks.length - 1) {
            setCurrentIndex(0)
        } else {
            setCurrentIndex(prev => prev + 1)
        }
        setIsFlipped(false)
    }

    if (!content) return null

    const totalCards = content.chunks.length

    return (
        <>
            <main className="flex min-h-screen flex-col">
                <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
                    <button
                        onClick={() => router.back()}
                        className="text-gray-600"
                    >
                        ←
                    </button>
                    <h1 className="text-lg font-bold">{content.title}</h1>
                    <button
                        onClick={() => setShowNotificationRequest(true)}
                        className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                        알림 설정
                    </button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center p-4">
                    <div className="text-center mb-4">
                        {currentIndex + 1}/{totalCards}
                    </div>

                    <div
                        onClick={() => setIsFlipped(!isFlipped)}
                        className="w-full max-w-2xl min-h-[200px] p-6 bg-gray-50 rounded-lg cursor-pointer transition-all duration-300 hover:bg-gray-100 flex items-center"
                    >
                        <p
                            className="text-left leading-relaxed"
                            dangerouslySetInnerHTML={{
                                __html: maskText(content.masked_chunks[currentIndex]?.masked_text, isFlipped)
                            }}
                        />
                    </div>

                    <div className="mt-8 space-x-4">
                        {isFlipped ? (
                            <>
                                <button
                                    onClick={() => handleQualitySelect(1)}
                                    className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg"
                                >
                                    다시 (10초)
                                </button>
                                <button
                                    onClick={() => handleQualitySelect(3)}
                                    className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg"
                                >
                                    어려움 (20초)
                                </button>
                                <button
                                    onClick={() => handleQualitySelect(4)}
                                    className="px-4 py-2 text-sm bg-green-500 text-white rounded-lg"
                                >
                                    알맞음 (30초)
                                </button>
                                <button
                                    onClick={() => handleQualitySelect(5)}
                                    className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg"
                                >
                                    쉬움 (40초)
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setIsFlipped(true)}
                                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                정답 보기
                            </button>
                        )}
                    </div>

                    {content.progress?.[currentIndex]?.nextReviewDate && (
                        <div className="mt-4 text-sm text-purple-600 font-medium">
                            {formatTimeRemaining(new Date(content.progress[currentIndex].nextReviewDate))}
                        </div>
                    )}

                    <div className="mt-4 text-sm text-gray-500">
                        화면을 클릭하면 카드가 뒤집힙니다
                    </div>
                </div>
            </main>

            {/* 알림 권한 요청 모달 */}
            <Dialog
                open={showNotificationRequest}
                onClose={() => setShowNotificationRequest(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />

                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="w-full max-w-sm rounded bg-white p-6">
                        <Dialog.Title className="text-lg font-medium mb-4">
                            복습 알림 설정
                        </Dialog.Title>
                        <Dialog.Description className="text-sm text-gray-500 mb-6">
                            효과적인 학습을 위해 복습 알림을 활성화해주세요.
                            복습 시간이 되면 알림을 보내드립니다.
                        </Dialog.Description>

                        <div className="flex justify-end space-x-4">
                            <button
                                onClick={() => setShowNotificationRequest(false)}
                                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                            >
                                나중에
                            </button>
                            <button
                                onClick={requestNotificationPermission}
                                className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                            >
                                알림 허용하기
                            </button>
                        </div>
                    </Dialog.Panel>
                </div>
            </Dialog>
        </>
    )
} 