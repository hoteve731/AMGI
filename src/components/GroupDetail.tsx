'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import LoadingOverlay from './LoadingOverlay'
import { motion, AnimatePresence } from 'framer-motion'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { requestFCMPermission, scheduleNotification } from '@/utils/firebase'

type Chunk = {
    id: string
    group_id: string
    summary: string
    masked_text: string
    order: number
}

type ContentGroup = {
    id: string
    title: string
    original_text: string
    chunks: Chunk[]
}

type Content = {
    id: string
    title: string
    user_id: string
    original_text: string
    created_at: string
    status: string
}

type NotificationInfo = {
    chunkId: string;
    scheduledFor: Date;
    status: 'pending' | 'sent' | 'failed';
}

export default function GroupDetail({ content, group }: { content: Content; group: ContentGroup }) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [groups, setGroups] = useState<ContentGroup[]>([])
    const [currentGroup, setCurrentGroup] = useState<ContentGroup>(group) // Initialize with the group prop
    const [showOriginalText, setShowOriginalText] = useState(false)
    const [notifications, setNotifications] = useState<NotificationInfo[]>([])
    const [fcmToken, setFcmToken] = useState<string | null>(null)
    const supabase = createClientComponentClient()

    // 세션 상태 관리 추가
    const [session, setSession] = useState<any>(null)

    // 세션 초기화 및 감시
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                const { data: { session: currentSession }, error } = await supabase.auth.getSession()
                if (error) throw error
                setSession(currentSession)
            } catch (error) {
                console.error('세션 초기화 오류:', error)
            }
        }

        initializeAuth()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [supabase])

    // 그룹 정보 로드
    useEffect(() => {
        const fetchGroups = async () => {
            if (!content.id) return

            setIsLoading(true)
            try {
                const { data, error } = await supabase
                    .from('content_groups')
                    .select('*, chunks:content_chunks(*)')
                    .eq('content_id', content.id)
                    .order('id')

                if (error) {
                    console.error('그룹 정보 가져오기 오류:', error)
                    return
                }

                if (data && data.length > 0) {
                    setGroups(data)

                    // 이미 props로 전달된 group이 있으면 그것을 사용
                    // 없으면 첫 번째 그룹을 사용
                    if (group && group.id) {
                        // 전달된 그룹과 일치하는 그룹을 찾아 설정
                        const matchedGroup = data.find(g => g.id === group.id)
                        if (matchedGroup) {
                            setCurrentGroup(matchedGroup)
                        } else {
                            setCurrentGroup(data[0])
                        }
                    } else {
                        setCurrentGroup(data[0])
                    }
                }
            } catch (err) {
                console.error('그룹 정보 가져오기 중 예외 발생:', err)
            } finally {
                setIsLoading(false)
            }
        }

        fetchGroups()
    }, [content.id, group, supabase])

    // FCM 토큰 요청 및 알림 권한 획득
    useEffect(() => {
        const setupFCM = async () => {
            try {
                const token = await requestFCMPermission();
                if (token) {
                    setFcmToken(token);
                    console.log('FCM 토큰 획득 성공:', token);
                }
            } catch (error) {
                console.error('FCM 설정 오류:', error);
            }
        };

        setupFCM();
    }, []);

    // 알림 정보 가져오기
    useEffect(() => {
        const fetchNotifications = async () => {
            if (!content.id) return

            try {
                let userId = null
                const { data: { user }, error } = await supabase.auth.getUser()

                if (!error && user) {
                    userId = user.id
                    console.log('인증된 사용자:', userId)

                    const { data: notificationData, error: notificationError } = await supabase
                        .from('notifications')
                        .select('*')
                        .eq('user_id', userId)
                        .eq('content_id', content.id)
                        .order('scheduled_time', { ascending: true })

                    if (notificationError) {
                        console.error('알림 정보 가져오기 실패:', notificationError)
                    } else if (notificationData) {
                        const notificationsMap = notificationData.map(notification => ({
                            chunkId: notification.chunk_id,
                            scheduledFor: new Date(notification.scheduled_time),
                            status: notification.status || 'pending'
                        }))
                        setNotifications(notificationsMap)
                    }
                } else {
                    // 인증되지 않은 사용자는 로컬 스토리지에서 확인
                    const localNotifications = JSON.parse(localStorage.getItem('notifications') || '[]')
                    const contentNotifications = localNotifications
                        .filter((n: any) => n.content_id === content.id)
                        .map((n: any) => ({
                            chunkId: n.chunk_id,
                            scheduledFor: new Date(n.scheduled_time),
                            status: 'pending'
                        }))
                    setNotifications(contentNotifications)
                }
            } catch (error) {
                console.error('알림 정보 처리 중 오류:', error)
            }
        }

        fetchNotifications()
    }, [content.id, supabase])

    const handleChunkClick = (chunkId: string) => {
        setIsLoading(true)
        router.push(`/content/${content.id}/learning?chunk=${chunkId}`)
    }

    const toggleOriginalText = () => {
        setShowOriginalText(!showOriginalText)
    }

    // 알림 스케줄링 함수
    const scheduleNotifications = async () => {
        if (!currentGroup || !currentGroup.chunks || currentGroup.chunks.length === 0) {
            alert('학습할 내용이 없습니다.')
            return
        }

        if (!fcmToken) {
            try {
                const token = await requestFCMPermission()
                if (!token) {
                    alert('알림을 보내기 위해 알림 권한이 필요합니다.')
                    return
                }
                setFcmToken(token)
            } catch (error) {
                console.error('FCM 설정 오류:', error)
                alert('알림 권한을 설정할 수 없습니다.')
                return
            }
        }

        setIsLoading(true)
        try {
            // 로컬 스토리지의 기존 알림 삭제
            const existingNotifications = JSON.parse(localStorage.getItem('notifications') || '[]')
            const filteredNotifications = existingNotifications.filter(
                (notification: any) => notification.content_id !== content.id
            )
            localStorage.setItem('notifications', JSON.stringify(filteredNotifications))

            // 사용자 인증 정보 확인
            const { data: { user }, error: userError } = await supabase.auth.getUser()

            if (userError) {
                console.error('사용자 인증 오류:', userError)
                throw userError
            }

            const userId = user?.id

            if (userId) {
                // 기존 알림 삭제
                const { error: deleteError } = await supabase
                    .from('notifications')
                    .delete()
                    .eq('user_id', userId)
                    .eq('content_id', content.id)

                if (deleteError) {
                    console.error('기존 알림 삭제 오류:', deleteError)
                }
            }

            // 각 청크별로 알림 스케줄링
            const promises = currentGroup.chunks.map(async (chunk, index) => {
                const scheduledTime = new Date(Date.now() + (index + 1) * 10 * 1000)
                const notificationBody = `${currentGroup.title}의 카드 ${index + 1}을 복습할 시간입니다.`

                const result = await scheduleNotification(
                    content.id,
                    chunk.id,
                    '기억을 꺼낼 시간이에요 🧠',
                    notificationBody,
                    scheduledTime
                )

                if (!result) {
                    console.log(`청크 ${index + 1} 알림 설정 실패`)
                    return null
                }

                if (userId) {
                    try {
                        const { error: insertError } = await supabase
                            .from('notifications')
                            .insert({
                                user_id: userId,
                                content_id: content.id,
                                chunk_id: chunk.id,
                                title: '기억을 꺼낼 시간이에요 🧠',
                                body: notificationBody,
                                scheduled_time: scheduledTime.toISOString(),
                                status: 'pending'
                            })

                        if (insertError) {
                            console.error('알림 정보 저장 실패:', insertError)
                        }
                    } catch (dbError) {
                        console.error('알림 정보 저장 중 오류:', dbError)
                    }
                } else {
                    const localNotifications = JSON.parse(localStorage.getItem('notifications') || '[]')
                    localNotifications.push({
                        content_id: content.id,
                        chunk_id: chunk.id,
                        title: '기억을 꺼낼 시간이에요 🧠',
                        body: notificationBody,
                        scheduled_time: scheduledTime.toISOString()
                    })
                    localStorage.setItem('notifications', JSON.stringify(localNotifications))
                }

                return {
                    chunkId: chunk.id,
                    scheduledFor: scheduledTime,
                    status: 'pending' as const
                }
            })

            const newNotifications = (await Promise.all(promises)).filter(Boolean) as NotificationInfo[]
            setNotifications(newNotifications)

            if (currentGroup.chunks.length > 0) {
                router.push(`/content/${content.id}/learning?chunk=${currentGroup.chunks[0].id}`)
            }
        } catch (error) {
            console.error('알림 스케줄링 실패:', error)
            alert('알림 설정 중 오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    // 학습 시작 핸들러 (알림 설정 없이 바로 학습 페이지로 이동)
    const handleStartLearning = () => {
        if (!currentGroup || !currentGroup.chunks || currentGroup.chunks.length === 0) {
            alert('학습할 내용이 없습니다.');
            return;
        }

        const firstChunk = currentGroup.chunks[0];
        console.log('학습 시작:', { contentId: content.id, chunkId: firstChunk.id, groupId: currentGroup.id });

        // 라우팅 전에 로딩 상태 설정
        setIsLoading(true);

        // 라우팅 시도
        try {
            router.push(`/content/${content.id}/learning?chunk=${firstChunk.id}&group=${currentGroup.id}`);
        } catch (error) {
            console.error('라우팅 오류:', error);
            alert('페이지 이동 중 오류가 발생했습니다.');
            setIsLoading(false);
        }
    };

    // 남은 시간 포맷팅 함수
    const formatTimeRemaining = (date: Date): string => {
        const now = new Date();
        const diff = date.getTime() - now.getTime();

        if (diff <= 0) return '지금 복습';

        const seconds = Math.floor(diff / 1000);

        if (seconds < 60) return `${seconds}초 후`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}분 후`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}시간 후`;
        const days = Math.floor(hours / 24);
        return `${days}일 후`;
    };

    // 특정 청크의 알림 정보 찾기
    const getNotificationForChunk = (chunkId: string) => {
        return notifications.find(n => n.chunkId === chunkId);
    };

    // 활성화된 알림 개수
    const activeNotificationsCount = notifications.filter(n => n.status === 'pending').length;

    if (!currentGroup) {
        return (
            <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
                {isLoading && <LoadingOverlay />}
                <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] h-12 z-50">
                    <button
                        onClick={() => router.push('/')}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <button
                        onClick={() => router.push('/')}
                        className="absolute left-10 top-1/2 -translate-y-1/2 text-gray-800 font-medium hover:text-gray-600"
                    >
                        홈
                    </button>
                </div>

                <div className="flex-1 max-w-2xl mx-auto w-full p-4">
                    {/* Content title and timestamp */}
                    <div className="space-y-2 mb-6">
                        <h1 className="text-3xl font-bold text-gray-800">{content.title}</h1>
                        <div className="text-sm text-gray-500">
                            {new Date(content.created_at).toLocaleDateString('ko-KR')} 시작
                        </div>
                    </div>

                    {/* Group count subtitle and tabs */}
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-xl font-semibold text-gray-700">기억 카드 그룹 {groups.length}개</h2>
                        </div>

                        {/* Group tabs */}
                        {groups.length > 1 && (
                            <div className="mb-4">
                                <div className="flex flex-wrap gap-2">
                                    {groups.map((group) => (
                                        <button
                                            key={group.id}
                                            onClick={() => setCurrentGroup(group)}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentGroup?.id === group.id
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-white/60 text-gray-700 hover:bg-white/80'
                                                }`}
                                        >
                                            {group.title}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Source text toggle - moved below tabs */}
                        {currentGroup && (
                            <div className="flex flex-col">
                                <button
                                    onClick={toggleOriginalText}
                                    className={`w-full bg-white/60 backdrop-blur-md rounded-xl p-4 flex items-center justify-between border border-white/20 ${showOriginalText ? 'rounded-b-none border-b-0' : ''
                                        }`}
                                >
                                    <div className="flex items-center">
                                        <svg
                                            className={`w-5 h-5 text-gray-600 transition-transform mr-2 ${showOriginalText ? 'transform rotate-90' : ''
                                                }`}
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M9 5l7 7-7 7"
                                            />
                                        </svg>
                                        <span className="text-lg font-medium text-gray-800">소스 텍스트</span>
                                    </div>
                                    <div></div>
                                </button>

                                <AnimatePresence>
                                    {showOriginalText && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.3 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="bg-white/40 backdrop-blur-md rounded-xl rounded-t-none p-4 border border-white/20 border-t-0">
                                                <p className="text-gray-600 text-sm whitespace-pre-wrap">{currentGroup.original_text}</p>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>

                    {/* Memory cards */}
                    {currentGroup && (
                        <div className="space-y-4 mb-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-semibold text-gray-700">기억 카드</h3>
                                <div className="text-sm text-gray-500">총 {currentGroup.chunks?.length || 0}개</div>
                            </div>

                            <div className="space-y-4">
                                {currentGroup.chunks?.map((chunk, index) => {
                                    const notification = getNotificationForChunk(chunk.id);
                                    return (
                                        <div
                                            key={chunk.id}
                                            onClick={() => handleChunkClick(chunk.id)}
                                            className="
                                                p-4 
                                                bg-white/80
                                                backdrop-blur-md 
                                                rounded-xl
                                                border
                                                border-white/20
                                                hover:bg-white/90
                                                transition-colors
                                                [-webkit-backdrop-filter:blur(20px)]
                                                [backdrop-filter:blur(20px)]
                                                relative
                                                z-0
                                                cursor-pointer
                                            "
                                        >
                                            <div className="flex justify-between items-center">
                                                <h4 className="text-lg font-medium text-gray-800">카드 {index + 1}</h4>
                                                {notification && (
                                                    <div className="text-sm font-medium text-purple-600">
                                                        {formatTimeRemaining(notification.scheduledFor)} 알림
                                                    </div>
                                                )}
                                            </div>
                                            <p className="mt-2 text-gray-600">{chunk.summary}</p>
                                            <div className="mt-3 p-3 bg-gray-100 rounded-lg">
                                                <p className="text-gray-700 whitespace-pre-wrap">{chunk.masked_text}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Notification schedule */}
                    <div className="mb-6 p-4 bg-white/80 backdrop-blur-md rounded-xl border border-white/20">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-lg font-semibold text-gray-700">알림 스케줄</h3>
                            <div className="text-sm font-medium px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                                {activeNotificationsCount}개 예약됨
                            </div>
                        </div>
                        <p className="text-gray-600 text-sm mb-4">
                            {activeNotificationsCount > 0
                                ? '아래 카드들의 알림이 예약되어 있습니다. 각 카드에 표시된 시간에 알림을 받게 됩니다.'
                                : '아직 예약된 알림이 없습니다. 학습 시작 버튼을 눌러 알림을 설정하세요.'}
                        </p>
                        <div className="flex flex-col space-y-3">
                            <button
                                onClick={handleStartLearning}
                                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
                            >
                                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                지금 학습 시작하기
                            </button>
                            <button
                                onClick={scheduleNotifications}
                                className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
                            >
                                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                                복습 알림 설정
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
            {isLoading && <LoadingOverlay />}
            <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] h-12 z-50">
                <button
                    onClick={() => router.push('/')}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <button
                    onClick={() => router.push('/')}
                    className="absolute left-10 top-1/2 -translate-y-1/2 text-gray-800 font-medium hover:text-gray-600"
                >
                    홈
                </button>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4">
                {/* 콘텐츠 제목 및 타임스탬프 */}
                <div className="space-y-2 mb-6">
                    <h1 className="text-3xl font-bold text-gray-800">{content.title}</h1>
                    <div className="text-sm text-gray-500">
                        {new Date(content.created_at).toLocaleDateString('ko-KR')} 시작
                    </div>
                </div>

                {/* 그룹 개수 서브타이틀 및 탭 */}
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-xl font-semibold text-gray-700">기억 카드 그룹 <span className="font-bold">{groups.length}</span>개</h2>
                    </div>

                    {/* 그룹 탭 */}
                    {groups.length > 1 && (
                        <div className="mb-4">
                            <div className="flex flex-wrap gap-2">
                                {groups.map((group) => (
                                    <button
                                        key={group.id}
                                        onClick={() => setCurrentGroup(group)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentGroup?.id === group.id
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-white/60 text-gray-700 hover:bg-white/80'
                                            }`}
                                    >
                                        {group.title}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 소스 텍스트 토글 - 탭 아래로 이동 */}
                    {currentGroup && (
                        <div className="flex flex-col">
                            <button
                                onClick={toggleOriginalText}
                                className={`w-full bg-white/60 backdrop-blur-md rounded-xl p-4 flex items-center justify-between border border-white/20 ${showOriginalText ? 'rounded-b-none border-b-0' : ''
                                    }`}
                            >
                                <div className="flex items-center">
                                    <svg
                                        className={`w-5 h-5 text-gray-600 transition-transform mr-2 ${showOriginalText ? 'transform rotate-90' : ''
                                            }`}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M9 5l7 7-7 7"
                                        />
                                    </svg>
                                    <span className="text-lg font-medium text-gray-800">소스 텍스트 보기</span>
                                </div>
                                <div></div>
                            </button>

                            <AnimatePresence>
                                {showOriginalText && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="bg-white/40 backdrop-blur-md rounded-xl rounded-t-none p-4 border border-white/20 border-t-0">
                                            <p className="text-gray-600 text-sm whitespace-pre-wrap">{currentGroup.original_text}</p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                {/* 메모리 카드 */}
                {currentGroup && currentGroup.chunks && (
                    <div className="space-y-4 mb-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-semibold text-gray-700">기억 카드</h3>
                            <div className="text-sm text-gray-500">총 <span className="font-bold">{currentGroup.chunks.length}</span>개</div>
                        </div>

                        <div className="space-y-4">
                            {currentGroup.chunks.map((chunk, index) => {
                                const notification = getNotificationForChunk(chunk.id);
                                return (
                                    <div
                                        key={chunk.id}
                                        onClick={() => handleChunkClick(chunk.id)}
                                        className="
                                            p-4 
                                            bg-white/80
                                            backdrop-blur-md 
                                            rounded-xl
                                            border
                                            border-white/20
                                            hover:bg-white/90
                                            transition-colors
                                            [-webkit-backdrop-filter:blur(20px)]
                                            [backdrop-filter:blur(20px)]
                                            relative
                                            z-0
                                            cursor-pointer
                                        "
                                    >
                                        <div className="flex justify-between items-center">
                                            <h4 className="text-lg font-medium text-gray-800">카드 {index + 1}</h4>
                                            {notification && (
                                                <div className="text-sm font-medium text-purple-600">
                                                    {formatTimeRemaining(notification.scheduledFor)} 알림
                                                </div>
                                            )}
                                        </div>
                                        <p className="mt-2 text-gray-600">{chunk.summary}</p>
                                        <div className="mt-3 p-3 bg-gray-100 rounded-lg">
                                            <p className="text-gray-700 whitespace-pre-wrap">{chunk.masked_text}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 알림 스케줄 */}
                <div className="mb-6 p-4 bg-white/80 backdrop-blur-md rounded-xl border border-white/20">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-semibold text-gray-700">알림 스케줄</h3>
                        <div className="text-sm font-medium px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                            <span className="font-bold">{activeNotificationsCount}</span>개 예약됨
                        </div>
                    </div>
                    <p className="text-gray-600 text-sm mb-4">
                        {activeNotificationsCount > 0
                            ? '아래 카드들의 알림이 예약되어 있습니다. 각 카드에 표시된 시간에 알림을 받게 됩니다.'
                            : '아직 예약된 알림이 없습니다. 학습 시작 버튼을 눌러 알림을 설정하세요.'}
                    </p>
                    <div className="flex flex-col space-y-3">
                        <button
                            onClick={handleStartLearning}
                            className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
                        >
                            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            지금 학습 시작하기
                        </button>
                        <button
                            onClick={scheduleNotifications}
                            className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
                        >
                            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            복습 알림 설정
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
}