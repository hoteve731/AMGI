'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSWRConfig } from 'swr'
import LoadingOverlay from './LoadingOverlay'
import LoadingScreen from './LoadingScreen'
import { motion, AnimatePresence } from 'framer-motion'
import GroupDetail from './GroupDetail'
import DOMPurify from 'isomorphic-dompurify';
import EditNoteModal from './EditNoteModal'
import { PencilIcon } from '@heroicons/react/24/outline'
import { marked } from 'marked';
import SnippetBottomSheet from './SnippetBottomSheet'
import { renderMarkdownWithSnippetIcons, registerSnippetIconClickHandlers, removeSnippetIconClickHandlers } from '@/utils/markdown';
import toast from 'react-hot-toast';

type Content = {
    id: string
    title: string
    icon?: string
    created_at: string
    user_id: string
    original_text: string
    markdown_text?: string
}

type Chunk = {
    id: string
    summary: string
    masked_text: string
    group_id: string
    position: number
    status?: 'active' | 'inactive'
    card_state?: 'new' | 'learning' | 'relearning' | 'review' | 'graduated'
}

type ContentGroup = {
    id: string
    title: string
    content_id: string
    original_text: string
    chunks: Chunk[]
    chunks_count?: number
    position: number
}

type ContentWithGroups = Content & {
    groups: ContentGroup[]
    additional_memory?: string
}

export default function ContentGroups({ content }: { content: ContentWithGroups }) {
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState<'notes' | 'flashcards' | 'text'>('notes');
    const [showOriginalText, setShowOriginalText] = useState(false);
    const [showAdditionalMemory, setShowAdditionalMemory] = useState(false);
    const [editingChunkId, setEditingChunkId] = useState<string | null>(null);
    const [isDeletingChunk, setIsDeletingChunk] = useState<string | null>(null);
    const [groupOriginalTextVisibility, setGroupOriginalTextVisibility] = useState<Record<string, boolean>>({});
    const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
    const [isFlashcardFlipped, setIsFlashcardFlipped] = useState(false);
    const [slideDirection, setSlideDirection] = useState<'right-to-left' | 'flip'>('flip');
    const [allChunks, setAllChunks] = useState<Chunk[]>([]);
    const router = useRouter();
    const { mutate } = useSWRConfig();
    const [isLoading, setIsLoading] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [isDeletingContent, setIsDeletingContent] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [isGeneratingCards, setIsGeneratingCards] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showEditCardsModal, setShowEditCardsModal] = useState(false);
    const [showFullTranscriptModal, setShowFullTranscriptModal] = useState(false);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [generationStatus, setGenerationStatus] = useState<'title' | 'content' | 'group' | 'chunk' | 'complete'>('title');
    const [generationProgress, setGenerationProgress] = useState<number>(0);
    const [processedGroups, setProcessedGroups] = useState<any[]>([]);

    // 스니펫 관련 상태 추가
    const [showSnippetBottomSheet, setShowSnippetBottomSheet] = useState(false);
    const [selectedHeader, setSelectedHeader] = useState({ text: '', id: '' });

    // 선택된 텍스트 관련 상태 추가
    const [selectedText, setSelectedText] = useState('');
    const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null);
    const [showSelectionButton, setShowSelectionButton] = useState(false);
    const [selectedRange, setSelectedRange] = useState<Range | null>(null);

    // 현재 컨텐츠 ID를 저장하기 위한 상태
    const [currentContentId, setCurrentContentId] = useState<string | undefined>(content?.id);

    // 1. Add container ref and highlight state after existing state declarations
    const markdownContainerRef = useRef<HTMLDivElement | null>(null);
    const [highlightRects, setHighlightRects] = useState<{left:number;top:number;width:number;height:number;}[]>([]);
    const clearSelection = useCallback(() => {
      setHighlightRects([]);
      setShowSelectionButton(false);
      setSelectionPosition(null);
    }, []);

    console.log('ContentGroups rendering with content:', content);
    useEffect(() => {
        console.log('ContentGroups content prop updated:', content);
        // content 객체에서 ID 추출
        if (content?.id) {
            // content.id 사용 (직접 컨텐츠의 ID 사용)
            setCurrentContentId(content.id);
            console.log('Setting currentContentId to:', content.id);
        }
    }, [content]);

    useEffect(() => {
        setIsMounted(true);

        const loadedVisibility: Record<string, boolean> = {};

        if (typeof window !== 'undefined' && content?.groups) {
            content.groups.forEach(group => {
                const key = `show_original_${group.id}`;
                loadedVisibility[group.id] = localStorage.getItem(key) === 'true';
            });
        }

        setGroupOriginalTextVisibility(loadedVisibility);

        // 모든 그룹의 청크를 하나의 배열로 합치기
        const chunks: Chunk[] = [];
        if (content?.groups) {
            content.groups.forEach(group => {
                if (group.chunks && Array.isArray(group.chunks)) {
                    chunks.push(...group.chunks.filter(chunk => chunk.status !== 'inactive'));
                }
            });
        }
        setAllChunks(chunks);
    }, [content?.groups]);

    // URL 쿼리(tab) 또는 로컬스토리지에 저장된 탭 상태로 초기화
    useEffect(() => {
        const tabParam = searchParams.get('tab');
        const storedTab = typeof window !== 'undefined' ? localStorage.getItem(`content-${content.id}-activeTab`) : null;
        if (tabParam === 'flashcards') setActiveTab('flashcards');
        else if (storedTab === 'flashcards') setActiveTab('flashcards');
    }, [content.id, searchParams]);

    // Helper function to format bold text
    function formatBoldText(text: string): React.ReactNode {
        if (!text) return null;

        // Replace **text** with <strong>text</strong>
        const parts = text.split(/(\*\*.*?\*\*)/g);

        return parts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                const content = part.slice(2, -2);
                return <strong key={index}>{content}</strong>;
            }
            return part;
        });
    }

    const handleEditClick = (e: React.MouseEvent, chunk: Chunk) => {
        e.stopPropagation();
        setEditingChunkId(chunk.id);
    };

    const handleDeleteChunk = async (e: React.MouseEvent, chunkId: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this card?')) {
            return;
        }

        setIsDeletingChunk(chunkId);
        try {
            const response = await fetch('/api/chunks', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: chunkId }),
            });

            if (!response.ok) {
                throw new Error('기억카드 삭제 중 오류가 발생했습니다.');
            }

            mutate('/api/contents');
            router.refresh();
        } catch (error) {
            console.error('기억카드 삭제 중 오류:', error);
            alert('기억카드 삭제 중 오류가 발생했습니다.');
        } finally {
            setIsDeletingChunk(null);
        }
    };

    const handleToggleChunkActive = async (e: React.MouseEvent, chunkId: string, status: 'active' | 'inactive') => {
        e.stopPropagation();
        try {
            const response = await fetch('/api/chunks', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: chunkId,
                    status,
                }),
            });

            if (!response.ok) {
                throw new Error('기억카드 상태 변경 중 오류가 발생했습니다.');
            }

            mutate('/api/contents');
            router.refresh();
        } catch (error) {
            console.error('기억카드 상태 변경 중 오류:', error);
            alert('기억카드 상태 변경 중 오류가 발생했습니다.');
        }
    };

    const handleDelete = async (groupId: string) => {
        if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
            return
        }

        setIsDeleting(groupId)
        try {
            const response = await fetch('/api/groups', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: groupId }),
            })

            if (!response.ok) {
                throw new Error('그룹 삭제 중 오류가 발생했습니다.')
            }

            // SWR 캐시 업데이트
            mutate('/api/contents')
            router.refresh()
        } catch (error) {
            console.error('그룹 삭제 중 오류:', error)
            alert('그룹 삭제 중 오류가 발생했습니다.')
        } finally {
            setIsDeleting(null)
        }
    }

    const handleDeleteContent = async () => {
        if (!confirm('Are you sure you want to delete this content? This action cannot be undone.')) {
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

            // SWR 캐시 업데이트
            mutate('/api/contents')

            // 홈으로 이동
            router.push('/')

            // 홈으로 이동한 후 새로고침
            setTimeout(() => {
                window.location.href = '/'
            }, 300)
        } catch (error) {
            console.error('콘텐츠 삭제 중 오류:', error)
            alert('콘텐츠 삭제 중 오류가 발생했습니다.')
        } finally {
            setIsDeletingContent(false)
        }
    }

    const handleGoBack = () => {
        setIsNavigating(true)
        router.push('/')
    }

    const handleChunkUpdate = async () => {
        console.log('handleChunkUpdate triggered in ContentGroups');
        try {
            const updatedData = await mutate('/api/contents');
            console.log('Data after mutate in ContentGroups:', updatedData);
        } catch (error) {
            console.error('Error during mutate in handleChunkUpdate:', error);
        }
    };

    // 기억카드 생성 함수
    const handleGenerateMemoryCards = async () => {
        if (!content.id || isGeneratingCards) return;

        setIsGeneratingCards(true);
        setGenerationError(null);
        setGenerationStatus('title'); // 초기 상태: 제목 생성 (이미 완료됨)
        setGenerationProgress(10);

        try {
            // 1. 그룹 생성 API 호출
            setGenerationStatus('group'); // 그룹 생성 단계로 변경
            setGenerationProgress(30);

            const groupsResponse = await fetch('/api/process-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contentId: content.id,
                    useMarkdownText: true
                }),
            });

            if (!groupsResponse.ok) {
                throw new Error('그룹 생성 중 오류가 발생했습니다.');
            }

            const groupsData = await groupsResponse.json();
            console.log('Groups generated:', groupsData);

            // 2. 백엔드 처리 상태 폴링 시작
            // 그룹 생성 완료 및 청크 생성 진행 상태를 확인하는 함수
            const pollProcessingStatus = async () => {
                let isCompleted = false;
                let currentStatus = '';
                let currentStage = '';
                let groups = [];
                let chunks = [];

                // 폴링 간격 (밀리초)
                const POLLING_INTERVAL = 1000;

                while (!isCompleted) {
                    try {
                        // 처리 상태 확인 API 호출
                        const statusResponse = await fetch(`/api/check-content?id=${content.id}`);
                        if (!statusResponse.ok) {
                            throw new Error('처리 상태 확인 중 오류가 발생했습니다.');
                        }

                        const statusData = await statusResponse.json();
                        console.log('Current processing status:', statusData);

                        // 현재 처리 상태 업데이트 (API 응답 구조에 맞게 수정)
                        currentStatus = statusData.processingStatus || '';
                        currentStage = statusData.currentStage || '';

                        console.log(`현재 상태: ${currentStatus}, 현재 단계: ${currentStage}`);

                        // 그룹 정보 가져오기 (그룹이 생성된 경우)
                        if (currentStatus === 'groups_generated' ||
                            currentStatus === 'chunks_generating' ||
                            currentStatus === 'completed' ||
                            currentStage === 'group_creation' ||
                            currentStage === 'chunk_generation' ||
                            currentStage === 'completed') {
                            const groupsInfoResponse = await fetch(`/api/content-groups?contentId=${content.id}`);
                            if (groupsInfoResponse.ok) {
                                const groupsInfo = await groupsInfoResponse.json();
                                groups = groupsInfo.groups || [];
                                setProcessedGroups(groups);

                                // 그룹 생성 단계에서 청크 생성 단계로 전환
                                if (currentStatus === 'groups_generated' || currentStatus === 'chunks_generating' || currentStage === 'chunk_generation') {
                                    setGenerationStatus('chunk');
                                    setGenerationProgress(60);
                                }

                                // 청크 정보 가져오기 (청크가 생성 중이거나 완료된 경우)
                                if (currentStatus === 'chunks_generating' || currentStatus === 'completed' || currentStage === 'chunk_generation' || currentStage === 'completed') {
                                    // 각 그룹의 청크 수 확인하여 진행률 계산
                                    let totalChunks = 0;
                                    let completedChunks = 0;

                                    for (const group of groups) {
                                        const chunksResponse = await fetch(`/api/chunks?groupId=${group.id}`);
                                        if (chunksResponse.ok) {
                                            const chunksData = await chunksResponse.json();
                                            const groupChunks = chunksData.chunks || [];
                                            completedChunks += groupChunks.length;
                                            // 예상 청크 수 (그룹당 평균 3-4개 정도로 가정)
                                            totalChunks += 4;
                                        }
                                    }

                                    // 진행률 업데이트 (60%~90% 사이)
                                    if (totalChunks > 0) {
                                        const chunkProgress = Math.min(completedChunks / totalChunks, 1);
                                        setGenerationProgress(60 + Math.floor(chunkProgress * 30));
                                    }
                                }
                            }
                        }

                        // 완료 상태 확인
                        if (currentStatus === 'completed' || currentStage === 'completed') {
                            setGenerationStatus('complete');
                            setGenerationProgress(100);
                            isCompleted = true;

                            // 완료 후 페이지 새로고침 대신 전체 페이지 이동으로 변경
                            // 이렇게 하면 컴포넌트가 완전히 다시 마운트되어 모든 상태가 초기화됨
                            localStorage.setItem(`content-${content.id}-activeTab`, 'flashcards');

                            // 전체 페이지 이동 (window.location.href 사용)
                            setTimeout(() => {
                                window.location.href = `/content/${content.id}/groups`;
                            }, 1000);

                            break;
                        }

                        // 폴링 간격만큼 대기
                        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));

                    } catch (error) {
                        console.error('Status polling error:', error);
                        throw error;
                    }
                }
            };

            // 폴링 시작
            await pollProcessingStatus();

        } catch (error) {
            console.error('Memory card generation error:', error);
            setGenerationError(error instanceof Error ? error.message : '기억카드 생성 중 오류가 발생했습니다.');
            setIsGeneratingCards(false);
            setGenerationProgress(0);
            setGenerationStatus('title');
        }
    };

    // 플래시카드 뒤집기 함수
    const handleFlipFlashcard = () => {
        setSlideDirection('flip');
        setIsFlashcardFlipped(!isFlashcardFlipped);
    };

    // 다음 플래시카드로 이동
    const handleNextFlashcard = () => {
        if (currentFlashcardIndex < allChunks.length - 1) {
            setSlideDirection('right-to-left');
            setIsFlashcardFlipped(false);
            setCurrentFlashcardIndex(prev => prev + 1);
        }
    };

    // 이전 플래시카드로 이동
    const handlePrevFlashcard = () => {
        if (currentFlashcardIndex > 0) {
            setSlideDirection('right-to-left');
            setIsFlashcardFlipped(false);
            setCurrentFlashcardIndex(prev => prev - 1);
        }
    };

    // 마스킹된 텍스트 처리
    const processMaskedText = (text: string) => {
        if (!text) return '';

        const maskedText = text.replace(/\{\{([^{}]+)\}\}/g,
            '<span class="inline-block bg-black w-10 h-4 rounded"></span>');

        // 볼드 텍스트 처리
        return maskedText.replace(/\*\*(.*?)\*\*/g, '<span class="font-bold text-black">$1</span>');
    };

    // 스니펫 아이콘 클릭 핸들러
    const handleSnippetIconClick = (headerText: string, headerId: string, contentId: string) => {
        console.log('스니펫 아이콘 클릭:', { headerText, headerId, contentId });
        setSelectedHeader({ text: headerText, id: headerId });
        setShowSnippetBottomSheet(true);
    };

    // 2. Replace handleTextSelection with state-driven overlay logic
    const handleTextSelection = useCallback(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
        const range = sel.getRangeAt(0);
        let parent = range.commonAncestorContainer;
        if (parent.nodeType === Node.TEXT_NODE) parent = parent.parentNode!;
        if (!(parent instanceof HTMLElement) || !markdownContainerRef.current?.contains(parent)) return;
        const text = sel.toString().trim();
        const container = markdownContainerRef.current!;
        const containerRect = container.getBoundingClientRect();
        const rects = Array.from(range.getClientRects()).map(r => ({
            left: r.left - containerRect.left + container.scrollLeft,
            top: r.top - containerRect.top + container.scrollTop,
            width: r.width,
            height: r.height
        }));
        setHighlightRects(rects);
        setSelectedText(text);
        const first = range.getClientRects()[0];
        // 버튼 위치는 화면 하단 중앙으로 고정 (y값은 사용하지 않음)
        setSelectionPosition({ 
            x: window.innerWidth / 2, 
            y: 0 // 실제로는 사용하지 않음, fixed bottom으로 처리
        });
        setShowSelectionButton(true);
    }, []);

    // 3. Simplify event listeners for selection and clearing
    useEffect(() => {
        if (activeTab !== 'notes') return;
        const onMouseUp = () => setTimeout(handleTextSelection, 0);
        const onMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.snippet-selection-button') || markdownContainerRef.current?.contains(target)) return;
            clearSelection();
        };
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('mousedown', onMouseDown);
        return () => {
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('mousedown', onMouseDown);
        };
    }, [activeTab, handleTextSelection, clearSelection]);

    // 4. Update snippet creation to clear overlays
    const handleSnippetFromSelection = useCallback(() => {
        if (selectedText && currentContentId) {
            console.log('Creating snippet from selection:', selectedText, 'for content ID:', currentContentId);
            
            const snippetId = `sel-${Date.now()}`;
            setSelectedHeader({ text: selectedText, id: snippetId });
            
            // 바텀시트 열기
            setShowSnippetBottomSheet(true);
            
            // 선택 영역 초기화
            clearSelection();
            
            // 성공 메시지 표시
            toast.success('스니펫 생성 준비 완료');
        } else {
            console.warn('Cannot create snippet: Text or Content ID missing', { selectedText, currentContentId });
            toast.error('스니펫을 생성할 수 없습니다. 다시 시도해주세요.');
        }
    }, [selectedText, currentContentId, clearSelection]);

    return (
        <main className="flex min-h-screen flex-col bg-[#F3F5FD] pb-12 p-4">
            {/* 일반 로딩 오버레이 */}
            {(isLoading || isDeleting || isDeletingContent || isNavigating) && <LoadingOverlay />}

            {/* 기억카드 생성 로딩 화면 */}
            {isGeneratingCards && (
                <LoadingScreen
                    progress={generationProgress}
                    status={generationStatus}
                    previewTitle={content.title}
                    processedGroups={processedGroups}
                // Removed onClose prop to prevent closing the modal
                />
            )}
            {!isGeneratingCards && <div className="sticky top-0 bg-[#F3F5FD] border-b border-gray-200 h-12 z-50">
                <button
                    onClick={handleGoBack}
                    className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center text-gray-600 hover:text-gray-900 transition-all duration-200 group"
                >
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="ml-2 font-medium group-hover:font-semibold transition-all duration-200">Home</span>
                </button>
                <button
                    onClick={handleDeleteContent}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </div>}

            <div className="flex-1 max-w-2xl mx-auto w-full">
                <div className="space-y-2 mb-6 mt-6">
                    <div className="flex items-center justify-between">
                        <h1 className="text-3xl font-bold text-gray-800 text-left">{content.title}</h1>
                    </div>
                    <div className="flex items-center text-left gap-3">
                        <button
                            onClick={() => setShowEditModal(true)}
                            className="bg-white px-3 py-1 rounded-xl text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
                        >
                            Edit note
                        </button>
                        <div className="text-gray-400 font-medium">
                            {new Date(content.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                    </div>
                </div>

                <div className="sticky top-12 z-40 pt-2 pb-4">
                    <div className="relative flex w-full">
                        <div className="relative flex w-full justify-between bg-white/70 backdrop-blur-xl rounded-full p-1 [box-shadow:0_1px_4px_rgba(0,0,0,0.05)] ring-1 ring-gray-200/70 ring-inset">
                            {[
                                { id: 'notes', label: 'Notes' },
                                { id: 'flashcards', label: 'Flashcards' }
                            ].map((tab) => {
                                const isActive = activeTab === tab.id;
                                return (
                                    <div key={tab.id} className="relative z-10 flex-1">
                                        {isActive && (
                                            <motion.div
                                                layoutId="activeTabBackground"
                                                className="absolute inset-0 bg-[#7969F7] rounded-full"
                                                transition={{
                                                    type: "spring",
                                                    stiffness: 500,
                                                    damping: 30
                                                }}
                                            />
                                        )}
                                        <button
                                            onClick={() => {
                                                setActiveTab(tab.id as 'notes' | 'flashcards');
                                                localStorage.setItem(`content-${content.id}-activeTab`, tab.id);
                                            }}
                                            className={`
                                                relative z-20
                                                w-full py-2 px-1
                                                text-sm
                                                transition-colors duration-200
                                                ${isActive
                                                    ? 'text-white font-bold'
                                                    : 'text-gray-500 hover:text-gray-700 font-medium'}
                                            `}
                                        >
                                            {tab.label}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === 'notes' && (
                        <motion.div
                            key="notes"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                        >
                            <div className="py-2 bg-white/80 backdrop-blur-md rounded-xl border border-white/20">
                                <div className="w-full">
                                    {content.markdown_text ? (
                                        <div className="flex-1 overflow-y-auto p-4 relative" ref={markdownContainerRef}>
                                            <div
                                                className="markdown-body"
                                                dangerouslySetInnerHTML={{
                                                    __html: DOMPurify.sanitize(renderMarkdownWithSnippetIcons(content.markdown_text!, content.id))
                                                }}
                                            />
                                            {highlightRects.map((r, i) => (
                                                <div key={i}
                                                    className="selection-highlight-overlay"
                                                    style={{
                                                        position: 'absolute',
                                                        left: `${r.left}px`,
                                                        top: `${r.top}px`,
                                                        width: `${r.width}px`,
                                                        height: `${r.height}px`,
                                                        backgroundColor: 'rgba(147, 51, 234, 0.2)',
                                                        pointerEvents: 'none',
                                                        borderRadius: '2px'
                                                    }}
                                                />
                                            ))}
                                            {/* 스니펫 버튼은 마크다운 컨테이너 내부에 렌더링하지 않고 createPortal로 document.body에 렌더링 */}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-8">
                                            <div className="animate-pulse flex space-x-4">
                                                <div className="rounded-full bg-slate-200 h-10 w-10"></div>
                                                <div className="flex-1 space-y-6 py-1">
                                                    <div className="h-2 bg-slate-200 rounded"></div>
                                                    <div className="space-y-3">
                                                        <div className="grid grid-cols-3 gap-4">
                                                            <div className="h-2 bg-slate-200 rounded col-span-2"></div>
                                                            <div className="h-2 bg-slate-200 rounded col-span-1"></div>
                                                        </div>
                                                        <div className="h-2 bg-slate-200 rounded"></div>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-gray-500 mt-4">마크다운 노트를 생성 중입니다...</p>
                                            <button
                                                onClick={() => {
                                                    // Call the API to generate markdown
                                                    fetch('/api/generate', {
                                                        method: 'POST',
                                                        headers: {
                                                            'Content-Type': 'application/json',
                                                        },
                                                        body: JSON.stringify({
                                                            text: content.original_text,
                                                            title: content.title,
                                                            processType: 'markdown'
                                                        }),
                                                    })
                                                        .then(response => {
                                                            if (!response.ok) {
                                                                throw new Error('마크다운 생성 중 오류가 발생했습니다.');
                                                            }
                                                            // Refresh the page to show the generated markdown
                                                            router.refresh();
                                                        })
                                                        .catch(error => {
                                                            console.error('마크다운 생성 중 오류:', error);
                                                            alert('마크다운 생성 중 오류가 발생했습니다.');
                                                        });
                                                }}
                                                className="mt-4 px-4 py-2 bg-[#5F4BB6] text-white rounded-lg hover:bg-opacity-90 transition-colors"
                                            >
                                                마크다운 노트 생성하기
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* Full Transcript 버튼 추가 */}
                            <div className="mt-8 w-full">
                                <button
                                    onClick={() => setShowFullTranscriptModal(true)}
                                    className="w-full flex items-center justify-center p-3 rounded-xl bg-white/80 backdrop-blur-sm shadow-sm hover:bg-white transition-colors"
                                >
                                    <svg className="w-5 h-5 mr-2 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="font-medium text-gray-600">Full Transcript</span>
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    {activeTab === 'flashcards' && (
                        <motion.div
                            key="flashcards"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                        >
                            {allChunks.length > 0 ? (
                                <div className="flex flex-col items-center">
                                    {/* 카드 진행 상태 */}
                                    <div className="flex justify-center mb-4">
                                        <div className="inline-flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm mt-4">
                                            <span className="text-sm text-gray-800 font-bold">
                                                {currentFlashcardIndex + 1}/{allChunks.length}
                                            </span>
                                        </div>
                                    </div>

                                    {/* 카드 표시 영역 */}
                                    <div className="w-full overflow-hidden">
                                        <AnimatePresence mode="wait" key={`${allChunks[currentFlashcardIndex]?.id}-${isFlashcardFlipped ? 'flipped' : 'front'}`}>
                                            {allChunks[currentFlashcardIndex] && (
                                                <motion.div
                                                    key={`card-${allChunks[currentFlashcardIndex].id}`}
                                                    initial={slideDirection === 'flip'
                                                        ? { opacity: 0, rotateY: isFlashcardFlipped ? -90 : 90 }
                                                        : { opacity: 0, x: 300 }
                                                    }
                                                    animate={slideDirection === 'flip'
                                                        ? { opacity: 1, rotateY: 0 }
                                                        : { opacity: 1, x: 0 }
                                                    }
                                                    exit={slideDirection === 'flip'
                                                        ? { opacity: 0, rotateY: isFlashcardFlipped ? 90 : -90 }
                                                        : { opacity: 0, x: -300 }
                                                    }
                                                    transition={slideDirection === 'flip'
                                                        ? {
                                                            type: "spring",
                                                            stiffness: 300,
                                                            damping: 30
                                                        }
                                                        : {
                                                            type: "spring",
                                                            stiffness: 300,
                                                            damping: 30,
                                                            duration: 0.3
                                                        }
                                                    }
                                                    className="w-full max-w-md perspective-1000 mx-auto"
                                                    onClick={handleFlipFlashcard}
                                                >
                                                    <div className="w-full h-[320px] bg-white/90 backdrop-blur-md rounded-xl shadow-lg p-6 flex flex-col">
                                                        <div
                                                            className="text-center text-gray-800 text-lg flex-1 overflow-auto p-6"
                                                            style={{ wordBreak: 'keep-all', overflowWrap: 'break-word', whiteSpace: 'pre-line' }}
                                                            dangerouslySetInnerHTML={{
                                                                __html: processMaskedText(isFlashcardFlipped
                                                                    ? allChunks[currentFlashcardIndex].masked_text
                                                                    : allChunks[currentFlashcardIndex].summary)
                                                            }}
                                                        />

                                                        {!isFlashcardFlipped && (
                                                            <div className="text-center font-semibold text-gray-400 text-sm mt-1 mb-4">
                                                                Press to flip
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* 이전/다음 버튼 */}
                                    <div className="flex w-full max-w-md">
                                        <div className="flex-1 flex justify-start">
                                            {currentFlashcardIndex > 0 && (
                                                <button
                                                    onClick={handlePrevFlashcard}
                                                    className="flex items-center justify-center p-2 rounded-full bg-white/80 backdrop-blur-sm shadow-sm hover:bg-white"
                                                >
                                                    <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                    </svg>
                                                    <span className="ml-1 font-medium pr-2">Previous</span>
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex-1 flex justify-end">
                                            {currentFlashcardIndex < allChunks.length - 1 && (
                                                <button
                                                    onClick={handleNextFlashcard}
                                                    className="flex items-center justify-center p-2 rounded-full bg-white/80 backdrop-blur-sm shadow-sm hover:bg-white"
                                                >
                                                    <span className="mr-1 font-medium pl-2">Next</span>
                                                    <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Edit Cards 버튼 추가 */}
                                    <div className="mt-8 w-full max-w-md">
                                        <button
                                            onClick={() => setShowEditCardsModal(true)}
                                            className="w-full flex items-center justify-center p-3 rounded-xl bg-white/80 backdrop-blur-sm shadow-sm hover:bg-white transition-colors"
                                        >
                                            <svg className="w-5 h-5 mr-2 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                            <span className="font-medium text-gray-600">Edit Cards</span>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 px-6 text-center bg-white/60 backdrop-blur-sm rounded-xl border border-white/20 shadow-sm">
                                    <img
                                        src="/images/doneloopa.png"
                                        alt="기억 카드"
                                        className="w-20 h-20 mb-4 opacity-80"
                                    />
                                    <div className="text-gray-600 font-semibold text-lg">
                                        No Flashcards yet
                                    </div>
                                    <div className="text-gray-500 mb-6 text-sm max-w-md">
                                        Generate Flashcards to study effectively!
                                    </div>

                                    {content.markdown_text ? (
                                        <button
                                            disabled={isGeneratingCards}
                                            onClick={handleGenerateMemoryCards}
                                            className={`
                                                px-6 py-2.5 rounded-full text-white font-medium flex items-center
                                                shadow-sm transform transition-all duration-200
                                                ${isGeneratingCards
                                                    ? 'bg-gray-400 cursor-not-allowed'
                                                    : 'bg-[#5F4BB6] hover:bg-[#4F3B96] hover:shadow-md active:scale-95'}
                                            `}
                                        >
                                            {isGeneratingCards ? (
                                                <div className="flex items-center">
                                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Creating memory cards...
                                                </div>
                                            ) : (
                                                <>
                                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                                                    </svg>
                                                    Generate
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <button
                                            disabled={true}
                                            className="px-6 py-2.5 bg-gray-400 text-white rounded-full font-medium cursor-not-allowed shadow-sm flex items-center"
                                        >
                                            <svg className="w-5 h-5 mr-2 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Create notes first
                                        </button>
                                    )}

                                    {generationError && (
                                        <div className="mt-4 text-red-500 text-sm p-2 bg-red-50 rounded-lg">
                                            <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                                            </svg>
                                            {generationError}
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {content.additional_memory && (
                    <div className="flex flex-col mt-8 mb-8">
                        <button
                            onClick={() => setShowAdditionalMemory(!showAdditionalMemory)}
                            className={`w-full bg-white/60 backdrop-blur-md rounded-xl p-4 flex items-center justify-between border border-white/20 ${showAdditionalMemory ? 'rounded-b-none border-b-0' : ''}`}
                        >
                            <div className="flex items-center">
                                <svg
                                    className={`w-5 h-5 text-gray-600 transition-transform mr-2 ${showAdditionalMemory ? 'transform rotate-90' : ''}`}
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
                                <span className="text-lg font-medium text-gray-800">Special highlight</span>
                            </div>
                            <div></div>
                        </button>

                        <AnimatePresence>
                            {showAdditionalMemory && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="overflow-hidden"
                                >
                                    <div className="bg-white/40 backdrop-blur-md rounded-xl rounded-t-none p-4 border border-white/20 border-t-0">
                                        <p className="text-gray-600 text-sm whitespace-pre-wrap">{content.additional_memory}</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Edit Note Modal */}
            <EditNoteModal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                contentId={content.id}
                initialTitle={content.title || ''}
                initialIcon={content.icon || '📝'}
                onUpdate={(title, icon) => {
                    // Refresh content data after successful update
                    router.refresh();
                }}
            />

            {/* Edit Cards Modal */}
            {isMounted && createPortal(
                <AnimatePresence mode="wait">
                    {showEditCardsModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto"
                            onClick={() => setShowEditCardsModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                transition={{
                                    type: "spring",
                                    damping: 25,
                                    stiffness: 300
                                }}
                                className="bg-[#F3F5FD] backdrop-blur-md rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Modal Header */}
                                <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-gray-200 bg-[#F3F5FD] backdrop-blur-md">
                                    <h2 className="text-lg font-bold text-gray-800">Edit Flashcards</h2>
                                    <button
                                        onClick={() => setShowEditCardsModal(false)}
                                        className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Modal Content */}
                                <div className="p-6 space-y-8">
                                    {content.groups.map((group) => {
                                        const cardCount = group.chunks?.filter(c => c.group_id === group.id).length || 0;

                                        return (
                                            <div key={group.id} className="space-y-4">
                                                <h3 className="text-lg font-bold text-gray-800 mb-2">{group.title}</h3>

                                                <GroupDetail
                                                    content={content}
                                                    group={{
                                                        ...group,
                                                        chunks: group.chunks?.filter(chunk => chunk.group_id === group.id) || []
                                                    }}
                                                    hideHeader={true}
                                                    hideCardCount={true}
                                                    key={group.id}
                                                    onChunkUpdate={handleChunkUpdate}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* 스니펫 바텀시트 */}
            {isMounted && createPortal(
                <AnimatePresence mode="wait">
                    {showSnippetBottomSheet && (
                        <SnippetBottomSheet
                            isOpen={showSnippetBottomSheet}
                            onClose={() => {
                                setShowSnippetBottomSheet(false);
                                // 바텀시트가 닫힐 때 선택 영역 초기화
                                clearSelection();
                                // 바텀시트가 닫힐 때 이벤트 핸들러를 다시 등록
                                setTimeout(() => {
                                    registerSnippetIconClickHandlers(handleSnippetIconClick);
                                }, 100);
                            }}
                            headerText={selectedHeader.text}
                            contentId={currentContentId || content.id}
                        />
                    )}
                </AnimatePresence>,
                document.body
            )}
            
            {/* 스니펫 생성 플로팅 버튼 - document.body에 포털로 렌더링 */}
            {isMounted && showSelectionButton && createPortal(
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] snippet-selection-button" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    width: '90%',
                    maxWidth: '450px'
                }}>
                    {/* 선택된 텍스트 미리보기 */}
                    <div className="bg-white p-4 rounded-xl shadow-lg w-full max-h-32 overflow-y-auto">
                        <p className="text-gray-700 line-clamp-3 text-base">{selectedText}</p>
                    </div>
                    
                    {/* 스니펫 생성 버튼 */}
                    <button 
                        onClick={handleSnippetFromSelection} 
                        className="bg-purple-600 text-white px-6 py-3 rounded-full font-medium shadow-xl hover:bg-purple-700 transition-colors flex items-center justify-center w-full"
                    >
                        <span className="mr-2 text-lg">✨</span> 스니펫 생성
                    </button>
                </div>,
                document.body
            )}

            {/* Full Transcript Modal */}
            {isMounted && createPortal(
                <AnimatePresence mode="wait">
                    {showFullTranscriptModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto"
                            onClick={() => setShowFullTranscriptModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                transition={{
                                    type: "spring",
                                    damping: 25,
                                    stiffness: 300
                                }}
                                className="bg-[#F3F5FD] backdrop-blur-md rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Modal Header */}
                                <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-gray-200 bg-[#F3F5FD] backdrop-blur-md">
                                    <h2 className="text-lg font-bold text-gray-800">Full Transcript</h2>
                                    <button
                                        onClick={() => setShowFullTranscriptModal(false)}
                                        className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Modal Content */}
                                <div className="p-6">
                                    <p className="whitespace-pre-wrap text-gray-700">{content.original_text}</p>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </main>
    );

}