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
    position: number
}

type ContentGroup = {
    id: string
    title: string
    original_text: string
    chunks: Chunk[]
    position: number
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

export default function GroupDetail({ content, group: initialGroup }: { content: Content; group: ContentGroup }) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [groups, setGroups] = useState<ContentGroup[]>([])
    const [currentGroup, setCurrentGroup] = useState<ContentGroup | null>(initialGroup)
    const [showOriginalText, setShowOriginalText] = useState(false)
    const [notifications, setNotifications] = useState<NotificationInfo[]>([])
    const [fcmToken, setFcmToken] = useState<string | null>(null)
    const [showGroupSelector, setShowGroupSelector] = useState(false)
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

    // 그룹 데이터 가져오기
    useEffect(() => {
        async function fetchGroups() {
            setIsLoading(true)
            try {
                const { data, error } = await supabase
                    .from('content_groups')
                    .select('*, chunks:content_chunks(*)')
                    .eq('content_id', content.id)
                    .order('id')

                if (error) {
                    console.error('Error fetching groups:', error)
                    return
                }

                if (data && data.length > 0) {
                    setGroups(data)

                    // 저장된 그룹 ID가 있는지 확인
                    const savedGroupId = localStorage.getItem(`content_${content.id}_selected_group`)

                    if (savedGroupId) {
                        // 저장된 그룹 ID가 현재 그룹 목록에 있는지 확인
                        const savedGroup = data.find(g => g.id.toString() === savedGroupId)
                        if (savedGroup) {
                            setCurrentGroup(savedGroup)
                        }
                    }
                }
            } catch (error) {
                console.error('Error:', error)
            } finally {
                setIsLoading(false)
            }
        }

        fetchGroups()
    }, [content.id, supabase, initialGroup?.id])

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
            const promises = currentGroup?.chunks?.map(async (chunk: Chunk, index: number) => {
                if (!currentGroup) return null;
                const scheduledTime = new Date(Date.now() + (index + 1) * 10 * 1000)
                const notificationBody = `${currentGroup.title}의 카드 ${index + 1}을 복습할 시간입니다.`

                const result = await scheduleNotification(
                    content.id,
                    chunk.id,
                    '기억을 꺼낼 시간이에요 ',
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
                                title: '기억을 꺼낼 시간이에요 ',
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
                        title: '기억을 꺼낼 시간이에요 ',
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

    // 그룹 선택 핸들러
    const handleGroupSelect = (group: ContentGroup) => {
        setCurrentGroup(group);
        setShowGroupSelector(false);

        // 선택한 그룹 ID를 localStorage에 저장
        localStorage.setItem(`content_${content.id}_selected_group`, group.id.toString());
    };

    const [isDeletingGroup, setIsDeletingGroup] = useState(false)

    const handleDeleteGroup = async () => {
        if (!currentGroup) return;

        if (!confirm('정말로 이 그룹을 삭제하시겠습니까? 모든 기억 카드가 삭제되며, 이 작업은 되돌릴 수 없습니다.')) {
            return;
        }

        setIsDeletingGroup(true);
        try {
            const response = await fetch('/api/groups', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: currentGroup.id }),
            });

            if (!response.ok) {
                throw new Error('그룹 삭제 중 오류가 발생했습니다.');
            }

            // 콘텐츠 페이지로 이동
            router.push(`/content/${content.id}`);
        } catch (error) {
            console.error('그룹 삭제 중 오류:', error);
            alert('그룹 삭제 중 오류가 발생했습니다.');
        } finally {
            setIsDeletingGroup(false);
        }
    };

    const [isDeletingContent, setIsDeletingContent] = useState(false)

    const handleDeleteContent = async () => {
        if (!confirm('정말로 이 콘텐츠를 삭제하시겠습니까? 모든 그룹과 기억 카드가 삭제되며, 이 작업은 되돌릴 수 없습니다.')) {
            return
        }

        setIsDeletingContent(true)
        try {
            const response = await fetch('/api/contents', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: content.id }),
            })

            if (!response.ok) {
                throw new Error('콘텐츠 삭제 중 오류가 발생했습니다.')
            }

            // 홈으로 이동
            router.push('/')
        } catch (error) {
            console.error('콘텐츠 삭제 중 오류:', error)
            alert('콘텐츠 삭제 중 오류가 발생했습니다.')
        } finally {
            setIsDeletingContent(false)
        }
    }

    // Helper function to format text with double asterisks (**) as bold text
    const formatBoldText = (text: string) => {
        if (!text) return '';

        // Split the text by the pattern **text** and preserve the delimiters
        const parts = text.split(/(\*\*[^*]+\*\*)/g);

        return parts.map((part, index) => {
            // Check if the part matches the pattern **text**
            if (part.startsWith('**') && part.endsWith('**')) {
                // Extract the text between ** and **
                const boldText = part.slice(2, -2);
                return <strong key={index}>{boldText}</strong>;
            }
            return part;
        });
    };

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
                    <div className="p-8 text-center">
                        <h2 className="text-xl font-semibold text-gray-700 mb-2">그룹 정보를 불러올 수 없습니다</h2>
                        <p className="text-gray-600">잠시 후 다시 시도해주세요.</p>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
            {isLoading && <LoadingOverlay />}
            <AnimatePresence>
                {showGroupSelector && (
                    <>
                        <motion.div
                            className="fixed inset-0 bg-white/70 backdrop-blur-sm z-40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowGroupSelector(false)}
                        />
                        <motion.div
                            className="fixed inset-x-0 top-12 p-4 bg-white shadow-lg rounded-b-xl z-50"
                            initial={{ y: "-100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "-100%" }}
                            transition={{
                                type: "spring",
                                stiffness: 300,
                                damping: 30
                            }}
                        >
                            <div className="max-w-2xl mx-auto">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-lg font-semibold text-gray-800">그룹 선택</h3>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {groups.map((group: ContentGroup) => (
                                        <button
                                            key={group.id}
                                            onClick={() => handleGroupSelect(group)}
                                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex flex-col items-start h-auto min-h-[70px] w-[calc(50%-0.5rem)] ${currentGroup?.id === group.id
                                                ? 'bg-[#E8D9C5] font-bold'
                                                : 'bg-white/60 text-gray-700 hover:bg-white/80 border border-gray-200'
                                                }`}
                                        >
                                            <div className="line-clamp-2 text-left mb-1 w-full">
                                                {group.title}
                                            </div>
                                            <div className="flex items-center text-xs mt-1">
                                                <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                                <span>기억카드 <span className="font-bold">{group.chunks?.length || 0}</span></span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
            <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] h-12 z-50">
                <button
                    onClick={() => router.push(`/content/${content.id}/groups`)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center text-gray-600 hover:text-gray-900 transition-all duration-200 group"
                >
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="ml-2 font-medium group-hover:font-semibold transition-all duration-200">그룹</span>
                </button>

                <button
                    onClick={handleDeleteGroup}
                    disabled={isDeletingGroup}
                    className="absolute right-16 top-1/2 -translate-y-1/2 h-8 w-8 bg-[#8B4513]/60 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-red-500/90 transition-colors disabled:opacity-50"
                    aria-label="그룹 삭제"
                >
                    {isDeletingGroup ? (
                        <div className="flex space-x-1">
                            {[0, 1, 2, 3, 4].map((i) => (
                                <motion.div
                                    key={i}
                                    className="w-1.5 h-1.5 bg-white rounded-full"
                                    animate={{
                                        y: ["0%", "-100%"],
                                    }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 300,
                                        damping: 15,
                                        mass: 0.8,
                                        repeat: Infinity,
                                        repeatType: "reverse",
                                        delay: i * 0.1,
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    )}
                </button>

                {groups.length > 1 && (
                    <button
                        onClick={() => setShowGroupSelector(!showGroupSelector)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 h-8 w-8 bg-[#8B4513]/60 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-[#8B4513]/90 transition-colors"
                        aria-label={showGroupSelector ? "닫기" : "그룹 리스트"}
                    >
                        <motion.div
                            animate={{ rotate: showGroupSelector ? 90 : 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                {showGroupSelector ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                                )}
                            </svg>
                        </motion.div>
                    </button>
                )}
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4">
                {/* 그룹 개수 서브타이틀 및 탭 */}
                <div className="mt-4 mb-6">
                    {/* 현재 그룹 제목 (크게 표시) */}
                    <div>
                        <div className="flex justify-between items-center">
                            <h2 className="text-3xl font-bold text-gray-800">{currentGroup?.title}</h2>
                        </div>
                    </div>
                </div>

                {/* 소스 텍스트 토글 - 탭 아래로 이동 */}
                <div className="flex flex-col mb-8">
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
                            <span className="text-lg font-medium text-gray-800">원본 텍스트</span>
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
                                    <p className="text-gray-600 text-sm whitespace-pre-wrap">
                                        {currentGroup.original_text || '원본 텍스트를 불러올 수 없습니다.'}
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                {/* 메모리 카드 */}
                <div className="space-y-4 mb-6">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center">
                            <svg
                                className="w-5 h-5 mr-1 text-gray-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                            </svg>
                            <h3 className="text-xl font-bold text-gray-800">기억카드<span className="text-sm font-normal text-gray-500 ml-1">({currentGroup.chunks?.length || 0})</span></h3>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {currentGroup.chunks?.map((chunk: Chunk, index: number) => {
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
                                        {notification && (
                                            <div className="text-sm font-medium text-purple-600">
                                                {formatTimeRemaining(notification.scheduledFor)} 알림
                                            </div>
                                        )}
                                    </div>
                                    <p className="mt-2 text-gray-600">{formatBoldText(chunk.summary)}</p>
                                    <div className="mt-3 p-3 bg-gray-100 rounded-lg">
                                        <p className="text-gray-700 whitespace-pre-wrap">{formatBoldText(chunk.masked_text)}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

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
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3.197-2.132a1 1 0 000-1.664z" />
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