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
    status?: 'active' | 'inactive'
    card_state?: 'new' | 'learning' | 'relearning' | 'review' | 'graduated'
    repetition_count?: number
    last_result?: string
}

type ContentGroup = {
    id: string
    title: string
    original_text: string
    chunks?: Chunk[]
    position: number
}

type Content = {
    id: string
    title: string
    user_id: string
    original_text: string
    created_at: string
}

type NotificationInfo = {
    chunkId: string;
    scheduledFor: Date;
    status: 'pending' | 'sent' | 'failed';
}

export default function GroupDetail({
    content,
    group: initialGroup,
    hideHeader = false,
    hideCardCount = false,
    onChunkUpdate
}: {
    content: Content;
    group: ContentGroup;
    hideHeader?: boolean;
    hideCardCount?: boolean;
    onChunkUpdate?: () => void;
}) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [isNavigating, setIsNavigating] = useState(false)
    const [groups, setGroups] = useState<ContentGroup[]>([])
    const [currentGroup, setCurrentGroup] = useState<ContentGroup | null>(null)
    const [showOriginalText, setShowOriginalText] = useState(false)
    const [notifications, setNotifications] = useState<NotificationInfo[]>([])
    const [fcmToken, setFcmToken] = useState<string | null>(null)
    const [showGroupSelector, setShowGroupSelector] = useState(false)
    const supabase = createClientComponentClient()

    // Add state for editing functionality
    const [editingChunkId, setEditingChunkId] = useState<string | null>(null)
    const [editSummary, setEditSummary] = useState('')
    const [editMaskedText, setEditMaskedText] = useState('')

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

    // 그룹 데이터 가져오기 및 currentGroup 설정 useEffect (기존 로직 수정)
    useEffect(() => {
        // hideHeader가 true일 경우 (ContentGroups 내에서 사용될 때)
        if (hideHeader) {
            // initialGroup prop으로 직접 currentGroup 설정
            setCurrentGroup(initialGroup);
            setGroups([]); // 다른 그룹 목록은 필요 없으므로 초기화
            return; // 내부 fetch 로직 실행 안 함
        }

        // hideHeader가 false일 경우 (독립 그룹 페이지)
        async function fetchGroupsAndSetCurrent() {
            setIsLoading(true);
            let determinedGroup: ContentGroup | null = initialGroup; // 기본값으로 initialGroup 사용

            try {
                const { data, error } = await supabase
                    .from('content_groups')
                    .select('*, chunks:content_chunks(*)')
                    .eq('content_id', content.id)
                    .order('id');

                if (error) {
                    console.error('Error fetching groups:', error);
                    // 오류 발생 시에도 determinedGroup은 initialGroup 유지
                } else if (data && data.length > 0) {
                    setGroups(data); // 그룹 선택기를 위해 전체 그룹 목록 저장

                    // localStorage에서 저장된 그룹 ID 확인
                    const savedGroupId = localStorage.getItem(`content_${content.id}_selected_group`);
                    const savedGroup = savedGroupId ? data.find(g => g.id.toString() === savedGroupId) : null;

                    if (savedGroup) {
                        determinedGroup = savedGroup; // 저장된 그룹 사용
                    } else if (!initialGroup && data.length > 0) {
                        // 저장된 그룹 없고, initialGroup도 없으면 첫 번째 그룹 사용
                        determinedGroup = data[0];
                    }
                    // 그 외의 경우 (initialGroup이 있거나, 저장된 그룹이 없으면) determinedGroup은 initialGroup 유지
                } else {
                    // 데이터가 없는 경우
                    setGroups([]);
                    // determinedGroup은 initialGroup 유지
                }
            } catch (error) {
                console.error('Error in fetchGroups logic:', error);
                // 오류 발생 시에도 determinedGroup은 initialGroup 유지
            } finally {
                setCurrentGroup(determinedGroup); // 최종적으로 결정된 그룹을 currentGroup으로 설정
                setIsLoading(false);
            }
        }

        fetchGroupsAndSetCurrent();

        // 의존성 배열: content.id 또는 hideHeader 변경 시 재실행
    }, [content.id, supabase, hideHeader, initialGroup]); // initialGroup도 의존성에 추가하여 prop 변경 시 대응

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
        router.push(`/content/${content.id}/learning?chunk=${chunkId}&group=${currentGroup?.id}`)
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
                if (!currentGroup || !currentGroup.chunks) return null;
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
    const activeNotificationsCount = notifications?.filter(n => n.status === 'pending').length || 0;

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

            // localStorage에서 삭제된 그룹 ID 제거
            const savedGroupId = localStorage.getItem(`content_${content.id}_selected_group`);
            if (savedGroupId === currentGroup.id.toString()) {
                localStorage.removeItem(`content_${content.id}_selected_group`);
            }

            // 그룹 목록 상태 업데이트 (삭제된 그룹 제거)
            if (groups) {
                const updatedGroups = groups.filter(g => g.id !== currentGroup.id);
                setGroups(updatedGroups);

                // 다른 그룹이 있으면 첫 번째 그룹 선택, 없으면 null로 설정
                if (updatedGroups.length > 0) {
                    setCurrentGroup(updatedGroups[0]);
                    localStorage.setItem(`content_${content.id}_selected_group`, updatedGroups[0].id.toString());
                } else {
                    setCurrentGroup(null);
                }
            }

            // 상태 업데이트 후 그룹 리스트 페이지로 이동
            router.push(`/content/${content.id}/groups`);
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

        // First handle the {{masked}} text pattern
        const maskedPattern = /\{\{([^{}]+)\}\}/g;
        const textWithMaskedFormatting = text.replace(maskedPattern,
            '<span class="bg-black text-white px-1 py-0.5 rounded">$1</span>');

        // Then handle the **bold** text pattern
        // Split the text by the pattern **text** and preserve the delimiters
        const parts = textWithMaskedFormatting.split(/(\*\*[^*]+\*\*)|(<span class="bg-black text-white px-1 py-0.5 rounded">[^<]+<\/span>)/g);

        return parts.map((part, index) => {
            // Check if the part is already a masked span
            if (part && part.startsWith('<span class="bg-black text-white px-1 py-0.5 rounded">')) {
                return <span key={index} dangerouslySetInnerHTML={{ __html: part }} />;
            }
            // Check if the part matches the bold pattern **text**
            else if (part && part.startsWith('**') && part.endsWith('**')) {
                // Extract the text between ** and **
                const boldText = part.slice(2, -2);
                return <strong key={index}>{boldText}</strong>;
            }
            return part;
        });
    };

    // Add function to toggle chunk active status
    const toggleChunkActive = async (e: React.MouseEvent, chunkId: string, newStatus: 'active' | 'inactive') => {
        e.stopPropagation() // Prevent card click event

        if (!currentGroup) return

        try {
            // Find the chunk and set its status
            const updatedChunks = currentGroup.chunks?.map(chunk => {
                if (chunk.id === chunkId) {
                    return { ...chunk, status: newStatus }
                }
                return chunk
            })

            // Update the current group with the updated chunks
            setCurrentGroup({
                ...currentGroup,
                chunks: updatedChunks ? updatedChunks as Chunk[] : []
            })

            // Update the database
            const { error } = await supabase
                .from('content_chunks')
                .update({
                    status: newStatus
                })
                .eq('id', chunkId)

            if (error) {
                console.error('Error updating chunk status:', error)
                throw error
            }

            onChunkUpdate?.();

        } catch (error) {
            console.error('Error toggling chunk status:', error)
            alert('상태 변경 중 오류가 발생했습니다.')
        }
    }

    // Add function to handle edit button click
    const handleEditClick = (e: React.MouseEvent, chunk: Chunk) => {
        e.stopPropagation() // Prevent card click event
        setEditingChunkId(chunk.id)
        setEditSummary(chunk.summary)
        setEditMaskedText(chunk.masked_text)
    }

    // Add function to save edited chunk
    const saveEditedChunk = async (chunkId: string) => {
        if (!currentGroup) return

        setIsLoading(true)

        try {
            // Update the chunk in the current group
            const updatedChunks = currentGroup.chunks?.map(chunk => {
                if (chunk.id === chunkId) {
                    return { ...chunk, summary: editSummary, masked_text: editMaskedText }
                }
                return chunk
            })

            // Update the current group with the updated chunks
            setCurrentGroup({
                ...currentGroup,
                chunks: updatedChunks
            })

            // Update the database
            const { error } = await supabase
                .from('content_chunks')
                .update({
                    summary: editSummary,
                    masked_text: editMaskedText
                })
                .eq('id', chunkId)

            if (error) {
                console.error('Error updating chunk:', error)
                throw error
            }

            onChunkUpdate?.();

            // Reset editing state
            setEditingChunkId(null)
            setEditSummary('')
            setEditMaskedText('')
        } catch (error) {
            console.error('Error saving edited chunk:', error)
            alert('변경사항 저장 중 오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    // Add function to cancel editing
    const cancelEditing = () => {
        setEditingChunkId(null)
        setEditSummary('')
        setEditMaskedText('')
    }

    // Add function to delete chunk
    const deleteChunk = async (e: React.MouseEvent, chunkId: string) => {
        e.stopPropagation() // Prevent card click event

        if (!currentGroup || !currentGroup.chunks || !confirm('정말로 이 기억카드를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
            return
        }

        setIsLoading(true)

        try {
            // Remove the chunk from the current group
            const updatedChunks = currentGroup.chunks.filter(chunk => chunk.id !== chunkId)

            // Update the current group with the updated chunks
            setCurrentGroup({
                ...currentGroup,
                chunks: updatedChunks
            })

            // Delete from the database
            const { error } = await supabase
                .from('content_chunks')
                .delete()
                .eq('id', chunkId)

            if (error) {
                console.error('Error deleting chunk:', error)
                throw error
            }

            onChunkUpdate?.();

        } catch (error) {
            console.error('Error deleting chunk:', error)
            alert('기억카드 삭제 중 오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleGoBack = () => {
        setIsNavigating(true)
        router.push(`/content/${content.id}/groups`)
    }

    const [activeTab, setActiveTab] = useState<'memory' | 'group' | 'text'>('memory')
    if (!currentGroup) {
        return (
            <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
                {isNavigating && <LoadingOverlay />}
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
        <main className={`flex flex-col ${!hideHeader ? 'min-h-screen bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]' : ''}`}>
            {isNavigating && <LoadingOverlay />}
            {!hideHeader && (
                <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] h-12 z-50">
                    <button
                        onClick={handleGoBack}
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
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50"
                        aria-label="그룹 삭제"
                    >
                        {isDeletingGroup ? (
                            <div className="flex space-x-1">
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <motion.div
                                        key={i}
                                        className="w-1.5 h-1.5 bg-gray-500 rounded-full"
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
                </div>
            )}

            <div className={`flex-1 max-w-2xl mx-auto w-full ${!hideHeader ? 'p-4' : ''}`}>
                {!hideHeader && (
                    <div className="mt-4 mb-6">
                        {/* 현재 그룹 제목 (크게 표시) */}
                        <div>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-3xl font-bold text-gray-800">{currentGroup?.title}</h2>
                                </div>
                                {/* 첨부 이미지 스타일 토글 */}
                                {currentGroup?.original_text && (
                                    <>
                                        <div
                                            className="mt-2 mb-2 bg-white/70 backdrop-blur-sm rounded-xl border border-white/20 overflow-hidden"
                                        >
                                            <button
                                                type="button"
                                                className="flex items-center justify-between w-full px-4 py-3 text-sm text-gray-700 hover:bg-white/30 transition-colors"
                                                onClick={() => setShowOriginalText(v => !v)}
                                                aria-expanded={showOriginalText}
                                            >
                                                <span className="font-medium">
                                                    {showOriginalText ? "접기" : "원본 문단 보기"}
                                                </span>
                                                <motion.div
                                                    animate={{ rotate: showOriginalText ? 180 : 0 }}
                                                    transition={{ duration: 0.3, ease: "easeInOut" }}
                                                >
                                                    <svg
                                                        className="w-5 h-5 text-gray-500"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M19 9l-7 7-7-7"
                                                        />
                                                    </svg>
                                                </motion.div>
                                            </button>
                                            <AnimatePresence>
                                                {showOriginalText && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.3, ease: "easeInOut" }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap border-t border-gray-100">
                                                            {currentGroup.original_text}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 기억카드 리스트 */}
                <div className="space-y-4">
                    <div className="space-y-4">
                        {!hideCardCount && (
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
                        )}

                        {currentGroup.chunks && currentGroup.chunks.length > 0 ? (
                            <div className="space-y-4">
                                {currentGroup.chunks.map((chunk: Chunk, index: number) => (
                                    <div
                                        key={chunk.id}
                                        onClick={editingChunkId === chunk.id ? undefined : (e) => handleEditClick(e, chunk)}
                                        className={`
                                        relative
                                        p-4 
                                        bg-white/60 
                                        backdrop-blur-md 
                                        rounded-xl 
                                        shadow-md
                                        border
                                        border-white/20
                                        transition-all
                                        duration-300
                                        ${chunk.status === 'inactive' ? 'opacity-50' : ''}
                                        ${editingChunkId === chunk.id ? 'ring-2 ring-[#7969F7]' : ''}
                                    `}
                                    >
                                        <div className="flex justify-between items-start mb-6">
                                            {/* Review status tag - TOP LEFT */}
                                            <div className="flex items-center flex-wrap gap-2">
                                                {/* Combined Card State and Repetition Count */}
                                                {chunk.card_state && (
                                                    <div className="inline-flex items-center justify-center bg-white rounded-full px-3 py-1 border border-gray-200">
                                                        <div className="flex items-center">
                                                            <div className={`w-2 h-2 rounded-full mr-2 ${chunk.card_state === 'new' ? 'bg-[#FDFF8C]' :
                                                                chunk.card_state === 'learning' || chunk.card_state === 'relearning' ? 'bg-[#B4B6E4]' :
                                                                    chunk.card_state === 'review' || chunk.card_state === 'graduated' ? 'bg-[#5F4BB6]' :
                                                                        'bg-gray-400'
                                                                }`}></div>
                                                            <div className="text-sm font-medium text-gray-800">
                                                                {chunk.card_state === 'new' ? '새 카드' :
                                                                    chunk.card_state === 'learning' ? '학습 중' :
                                                                        chunk.card_state === 'relearning' ? '재학습' :
                                                                            chunk.card_state === 'graduated' || chunk.card_state === 'review' ? '복습' :
                                                                                '미설정'}
                                                                {chunk.repetition_count !== undefined &&
                                                                    <span className="opacity-70"> (반복 {chunk.repetition_count}회)</span>
                                                                }
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Styled Last Result Tag */}
                                                {chunk.last_result && (
                                                    <div className="inline-flex items-center justify-center bg-white rounded-full px-3 py-1 border border-gray-200">
                                                        <div className="flex items-center">
                                                            {/* Updated color mapping based on review page buttons */}
                                                            <div className={`w-2 h-2 rounded-full mr-2 ${chunk.last_result === 'again' ? 'bg-red-500' : // Using text color for dot, assuming button bg is light
                                                                chunk.last_result === 'hard' ? 'bg-orange-500' : // Using text color for dot
                                                                    chunk.last_result === 'good' ? 'bg-green-500' : // Using text color for dot
                                                                        chunk.last_result === 'easy' ? 'bg-blue-500' : // Using text color for dot
                                                                            'bg-gray-400' // Default/fallback color
                                                                }`}></div>
                                                            <div className="text-sm font-medium text-gray-800">
                                                                난이도 {chunk.last_result}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {getNotificationForChunk(chunk.id) && (
                                                <div className="text-sm font-medium text-purple-600">
                                                    {formatTimeRemaining(getNotificationForChunk(chunk.id)?.scheduledFor || new Date())} 알림
                                                </div>
                                            )}
                                        </div>

                                        {editingChunkId === chunk.id ? (
                                            <>
                                                <div className="mt-2">
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">앞면</label>
                                                    <textarea
                                                        value={editSummary}
                                                        onChange={(e) => setEditSummary(e.target.value)}
                                                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900"
                                                        rows={3}
                                                    />
                                                </div>
                                                <div className="mt-3">
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">뒷면</label>
                                                    <textarea
                                                        value={editMaskedText}
                                                        onChange={(e) => setEditMaskedText(e.target.value)}
                                                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900"
                                                        rows={5}
                                                    />
                                                </div>
                                                {/* Edit mode buttons - at the bottom */}
                                                <div className="flex justify-end space-x-2 mt-4" onClick={e => e.stopPropagation()}>
                                                    {/* Save button */}
                                                    <button
                                                        onClick={() => saveEditedChunk(chunk.id)}
                                                        className="px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors font-medium text-sm"
                                                        aria-label="저장"
                                                    >
                                                        저장
                                                    </button>

                                                    {/* Cancel button */}
                                                    <button
                                                        onClick={cancelEditing}
                                                        className="px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors font-medium text-sm"
                                                        aria-label="취소"
                                                    >
                                                        취소
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <p className="mt-2 text-gray-600">{formatBoldText(chunk.summary)}</p>
                                                <div className="mt-3 p-3 bg-gray-100 rounded-lg">
                                                    <p className="text-gray-700 whitespace-pre-wrap">{formatBoldText(chunk.masked_text)}</p>
                                                </div>

                                                {/* Action buttons - MOVED TO BOTTOM */}
                                                <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                                                    {/* Edit/Delete buttons */}
                                                    <div className="flex space-x-3">
                                                        {/* Edit button */}
                                                        <button
                                                            onClick={(e) => handleEditClick(e, chunk)}
                                                            className="p-1 text-gray-600 hover:text-[#7969F7] transition-colors"
                                                            aria-label="수정"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                            </svg>
                                                        </button>

                                                        {/* Delete button */}
                                                        <button
                                                            onClick={(e) => deleteChunk(e, chunk.id)}
                                                            className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                                                            aria-label="삭제"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </div>

                                                    {/* Active/Inactive buttons */}
                                                    <div className="flex space-x-0">
                                                        {/* Active button */}
                                                        <button
                                                            onClick={(e) => toggleChunkActive(e, chunk.id, 'active')}
                                                            className={`p-1 transition-colors ${chunk.status === 'active' ? 'text-green-600' : 'text-gray-400 hover:text-green-600'}`}
                                                            aria-label="활성화"
                                                        >
                                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                        </button>

                                                        {/* Inactive button */}
                                                        <button
                                                            onClick={(e) => toggleChunkActive(e, chunk.id, 'inactive')}
                                                            className={`p-1 transition-colors ${chunk.status === 'inactive' ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
                                                            aria-label="비활성화"
                                                        >
                                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-4 bg-white/80 backdrop-blur-md rounded-xl border border-white/20">
                                <p className="text-gray-500 text-center">이 그룹에는 아직 기억카드가 없습니다.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}