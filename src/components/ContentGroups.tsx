'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSWRConfig } from 'swr'
import LoadingOverlay from './LoadingOverlay'
import LoadingScreen from './LoadingScreen'
import { motion, AnimatePresence } from 'framer-motion'
import GroupDetail from './GroupDetail'
import DOMPurify from 'isomorphic-dompurify';

type Content = {
    id: string
    title: string
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
    const [activeTab, setActiveTab] = useState<'notes' | 'cards' | 'groups' | 'text'>('notes');
    const [showOriginalText, setShowOriginalText] = useState(false);
    const [showAdditionalMemory, setShowAdditionalMemory] = useState(false);
    const [editingChunkId, setEditingChunkId] = useState<string | null>(null);
    const [isDeletingChunk, setIsDeletingChunk] = useState<string | null>(null);
    const [groupOriginalTextVisibility, setGroupOriginalTextVisibility] = useState<Record<string, boolean>>({});
    const router = useRouter();
    const { mutate } = useSWRConfig();
    const [isLoading, setIsLoading] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [isDeletingContent, setIsDeletingContent] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [isGeneratingCards, setIsGeneratingCards] = useState(false);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [generationStatus, setGenerationStatus] = useState<'title' | 'content' | 'group' | 'chunk' | 'complete'>('title');
    const [generationProgress, setGenerationProgress] = useState<number>(0);
    const [processedGroups, setProcessedGroups] = useState<any[]>([]);

    console.log('ContentGroups rendering with content:', content);
    useEffect(() => {
        console.log('ContentGroups content prop updated:', content);
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
    }, [content?.groups]);

    const toggleGroupOriginalText = (groupId: string) => {
        if (typeof window === 'undefined') return;

        const newState = !groupOriginalTextVisibility[groupId];

        localStorage.setItem(`show_original_${groupId}`, newState.toString());

        setGroupOriginalTextVisibility(prev => ({
            ...prev,
            [groupId]: newState
        }));
    };

    // Helper function to format text with double asterisks (**) as bold text and single asterisks (*) as bold text
    const formatBoldText = (text: string) => {
        if (!text) return '';

        // First handle the {{masked}} text pattern
        const maskedPattern = /\{\{([^{}]+)\}\}/g;
        const textWithMaskedFormatting = text.replace(maskedPattern,
            '<span class="bg-black text-white px-1 py-0.5 rounded">$1</span>');

        // Then handle the **bold** text pattern and *bold* text pattern
        const parts = textWithMaskedFormatting.split(/(\*\*[^*]+\*\*)|(\*[^*]+\*)|(<span class="bg-black text-white px-1 py-0.5 rounded">[^<]+<\/span>)/g);

        return parts.map((part, index) => {
            if (part && part.startsWith('<span class="bg-black text-white px-1 py-0.5 rounded">')) {
                return <span key={index} dangerouslySetInnerHTML={{ __html: part }} />;
            }
            else if (part && part.startsWith('**') && part.endsWith('**')) {
                const boldText = part.slice(2, -2);
                return <strong key={index}>{boldText}</strong>;
            }
            else if (part && part.startsWith('*') && part.endsWith('*')) {
                const boldText = part.slice(1, -1);
                return <strong key={index}>{boldText}</strong>;
            }
            return part;
        });
    };

    const handleEditClick = (e: React.MouseEvent, chunk: Chunk) => {
        e.stopPropagation();
        setEditingChunkId(chunk.id);
    };

    const handleDeleteChunk = async (e: React.MouseEvent, chunkId: string) => {
        e.stopPropagation();
        if (!confirm('정말로 이 기억카드를 삭제하시겠습니까?')) {
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
        if (!confirm('정말로 이 그룹을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
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

    // Helper function to render markdown text as HTML
    function renderMarkdown(markdown: string): React.ReactNode {
        if (!markdown) return null;

        // Split the text into lines to handle line-based markdown elements
        const lines = markdown.split('\n');

        // Process table data
        let tableData: { isHeader: boolean; cells: string[] }[] = [];
        let collectingTable = false;

        // First pass: collect table data
        lines.forEach(line => {
            if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
                // Skip separator rows (only dashes and pipes)
                if (line.replace(/\|/g, '').replace(/-/g, '').replace(/:/g, '').trim() === '') {
                    if (tableData.length > 0) {
                        // Mark the previous row as header
                        tableData[tableData.length - 1].isHeader = true;
                    }
                    return;
                }

                // Add row data
                const cells = line.split('|').filter(cell => cell.trim() !== '').map(cell => cell.trim());
                tableData.push({ isHeader: false, cells });
                collectingTable = true;
            } else if (collectingTable) {
                // End of table
                collectingTable = false;
            }
        });

        // Reset for second pass
        collectingTable = false;
        let currentTableRows: React.ReactNode[] = [];
        let skipLines: number[] = [];

        return (
            <div className="markdown-content space-y-4">
                {lines.map((line, lineIndex) => {
                    // Skip lines that are part of a processed table
                    if (skipLines.includes(lineIndex)) {
                        return null;
                    }

                    // Handle horizontal divider
                    if (line.trim() === '---') {
                        return <hr key={lineIndex} className="my-4 border-t border-gray-300" />;
                    }

                    // Handle table start
                    if (line.trim().startsWith('|') && line.trim().endsWith('|') && !collectingTable) {
                        collectingTable = true;

                        // Find all consecutive table rows
                        let tableRows: { isHeader: boolean; cells: string[] }[] = [];
                        let rowIndex = lineIndex;

                        while (rowIndex < lines.length) {
                            const currentLine = lines[rowIndex];

                            // Skip separator rows
                            if (currentLine.replace(/\|/g, '').replace(/-/g, '').replace(/:/g, '').trim() === '') {
                                skipLines.push(rowIndex);
                                rowIndex++;
                                continue;
                            }

                            // Check if this is still a table row
                            if (currentLine.trim().startsWith('|') && currentLine.trim().endsWith('|')) {
                                const cells = currentLine.split('|')
                                    .filter(cell => cell.trim() !== '')
                                    .map(cell => cell.trim());

                                tableRows.push({
                                    isHeader: rowIndex === lineIndex, // First row is header
                                    cells
                                });

                                skipLines.push(rowIndex);
                                rowIndex++;
                            } else {
                                break;
                            }
                        }

                        // Render the complete table
                        return (
                            <table key={lineIndex} className="min-w-full my-4 border-collapse">
                                <thead className="bg-gray-100">
                                    {tableRows.length > 0 && tableRows[0].isHeader && (
                                        <tr>
                                            {tableRows[0].cells.map((cell, cellIndex) => (
                                                <th key={cellIndex} className="py-2 px-4 border border-gray-300 text-left font-medium">
                                                    {formatBoldText(cell)}
                                                </th>
                                            ))}
                                        </tr>
                                    )}
                                </thead>
                                <tbody>
                                    {tableRows
                                        .filter((row, idx) => idx > 0 || !row.isHeader)
                                        .map((row, rowIndex) => (
                                            <tr key={rowIndex}>
                                                {row.cells.map((cell, cellIndex) => (
                                                    <td key={cellIndex} className="py-2 px-4 border border-gray-300">
                                                        {formatBoldText(cell)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        );
                    }

                    // Reset table collection flag if we're not on a table row
                    if (collectingTable && !(line.trim().startsWith('|') && line.trim().endsWith('|'))) {
                        collectingTable = false;
                    }

                    // Handle headers
                    if (line.startsWith('# ')) {
                        return (
                            <h1 key={lineIndex} className="text-2xl font-bold mt-6 mb-4">
                                {formatBoldText(line.substring(2))}
                            </h1>
                        );
                    } else if (line.startsWith('## ')) {
                        return (
                            <h2 key={lineIndex} className="text-xl font-bold mt-5 mb-3">
                                {formatBoldText(line.substring(3))}
                            </h2>
                        );
                    } else if (line.startsWith('### ')) {
                        return (
                            <h3 key={lineIndex} className="text-lg font-bold mt-4 mb-2">
                                {formatBoldText(line.substring(4))}
                            </h3>
                        );
                    }
                    // Handle list items
                    else if (line.startsWith('* ') || line.startsWith('- ')) {
                        return (
                            <div key={lineIndex} className="flex ml-4 mb-2">
                                <span className="mr-2">•</span>
                                <div>{formatBoldText(line.substring(2))}</div>
                            </div>
                        );
                    }
                    // Handle empty lines
                    else if (line.trim() === '') {
                        return <div key={lineIndex} className="h-4"></div>;
                    }
                    // Handle normal paragraphs
                    else {
                        return (
                            <p key={lineIndex} className="mb-4">
                                {formatBoldText(line)}
                            </p>
                        );
                    }
                })}
            </div>
        );
    }

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
            
            // 그룹 정보 가져오기
            const groupsInfoResponse = await fetch(`/api/content-groups?contentId=${content.id}`);
            if (!groupsInfoResponse.ok) {
                throw new Error('그룹 정보를 가져오는 중 오류가 발생했습니다.');
            }
            
            const groupsInfo = await groupsInfoResponse.json();
            setProcessedGroups(groupsInfo.groups || []);

            // 2. 각 그룹에 대해 청크 생성 API 호출
            setGenerationStatus('chunk'); // 청크(기억카드) 생성 단계로 변경
            setGenerationProgress(60);

            const totalGroups = groupsData.group_ids.length;
            let completedGroups = 0;

            const chunkPromises = groupsData.group_ids.map(async (groupId: string, index: number) => {
                const chunksResponse = await fetch('/api/process-cloze-chunks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        group_id: groupId,
                        content_id: content.id,
                        useMarkdownText: true
                    }),
                });

                if (!chunksResponse.ok) {
                    throw new Error(`그룹 ${groupId}의 청크 생성 중 오류가 발생했습니다.`);
                }

                completedGroups++;
                setGenerationProgress(60 + Math.floor((completedGroups / totalGroups) * 30));

                return chunksResponse.json();
            });

            // 모든 청크 생성 완료 대기
            await Promise.all(chunkPromises);

            setGenerationStatus('complete'); // 완료 단계로 변경
            setGenerationProgress(100);

            // 3. 기억카드 탭으로 전환 후 페이지 새로고침
            localStorage.setItem(`content-${content.id}-activeTab`, 'cards');

            // 약간의 지연 후 새로고침 (사용자가 완료 메시지를 볼 수 있도록)
            setTimeout(() => {
                window.location.reload();
            }, 2000); // 완료 메시지를 더 오래 보여주기 위해 지연 시간 증가

        } catch (error) {
            console.error('Memory card generation error:', error);
            setGenerationError(error instanceof Error ? error.message : '기억카드 생성 중 오류가 발생했습니다.');
        } finally {
            // 오류 발생 시에만 로딩 상태 해제 (성공 시에는 페이지 새로고침으로 처리)
            if (generationError) {
                setIsGeneratingCards(false);
                setGenerationProgress(0);
                setGenerationStatus('title');
            }
        }
    };

    return (
        <main className="flex min-h-screen flex-col bg-[#F8F4EF] pb-12 p-4">
            {/* 일반 로딩 오버레이 */}
            {(isLoading || isDeleting || isDeletingContent || isNavigating) && <LoadingOverlay />}
            
            {/* 기억카드 생성 로딩 화면 */}
            {isGeneratingCards && (
                <LoadingScreen 
                    progress={generationProgress}
                    status={generationStatus}
                    previewTitle={content.title}
                    processedGroups={processedGroups}
                    onClose={() => {
                        setIsGeneratingCards(false);
                        setGenerationProgress(0);
                        setGenerationStatus('title');
                    }}
                />
            )}
            <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] h-12 z-50">
                <button
                    onClick={handleGoBack}
                    className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center text-gray-600 hover:text-gray-900 transition-all duration-200 group"
                >
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="ml-2 font-medium group-hover:font-semibold transition-all duration-200">홈</span>
                </button>
                <button
                    onClick={handleDeleteContent}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full">
                <div className="space-y-2 mb-6 mt-6">
                    <h1 className="text-3xl font-bold text-gray-800 text-left">{content.title}</h1>
                    <div className="text-gray-400 font-medium text-left">
                        {new Date(content.created_at).toLocaleDateString('ko-KR')}
                    </div>
                </div>

                <div className="sticky top-12 z-40 pt-2 pb-4">
                    <div className="relative flex w-full">
                        <div className="relative flex w-full justify-between bg-white/70 backdrop-blur-xl rounded-full p-1 [box-shadow:0_1px_4px_rgba(0,0,0,0.05)] ring-1 ring-gray-200/70 ring-inset">
                            {[
                                { id: 'notes', label: '노트' },
                                { id: 'cards', label: '기억카드' },
                                { id: 'groups', label: '그룹' },
                                { id: 'text', label: '원본' }
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
                                                setActiveTab(tab.id as 'notes' | 'cards' | 'groups' | 'text');
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
                                        <div className="flex-1 overflow-y-auto p-4">
                                            {renderMarkdown(content.markdown_text)}
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
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    {activeTab === 'cards' && (
                        <motion.div
                            key="cards"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="space-y-8"
                        >
                            {content.groups.length > 0 && content.groups.some(group =>
                                group.chunks && group.chunks.length > 0
                            ) ? (
                                content.groups.map((group) => {
                                    const cardCount = group.chunks?.filter(c => c.group_id === group.id).length || 0;
                                    console.log(`Rendering group ${group.id} (${group.title}) with count: ${cardCount}`);

                                    return (
                                        <div key={group.id} className="space-y-4">
                                            <h3 className="text-xl font-bold text-gray-800 text-left mt-14 mb-4 px-4">
                                                {group.title}
                                            </h3>

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
                                })
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                    <div className="text-gray-500 mb-6">
                                        아직 기억 카드가 없습니다.
                                    </div>

                                    {content.markdown_text ? (
                                        <button
                                            disabled={isGeneratingCards}
                                            onClick={handleGenerateMemoryCards}
                                            className={`
                                                px-4 py-2 rounded-lg text-white
                                                ${isGeneratingCards
                                                    ? 'bg-gray-400 cursor-not-allowed'
                                                    : 'bg-[#5F4BB6] hover:bg-opacity-90 transition-colors'}
                                            `}
                                        >
                                            {isGeneratingCards ? (
                                                <div className="flex items-center">
                                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    기억카드 생성 중...
                                                </div>
                                            ) : (
                                                '기억카드 생성'
                                            )}
                                        </button>
                                    ) : (
                                        <button
                                            disabled={true}
                                            className="px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed"
                                        >
                                            노트를 먼저 생성해주세요
                                        </button>
                                    )}

                                    {generationError && (
                                        <div className="mt-4 text-red-500 text-sm">
                                            {generationError}
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    {activeTab === 'groups' && (
                        <motion.div
                            key="groups"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="grid grid-cols-2 gap-4"
                        >
                            {content.groups.map((group, index) => (
                                <div
                                    key={group.id}
                                    className="block relative transition-all duration-300 hover:scale-[1.02]"
                                >
                                    <div className="
                                    flex flex-col
                                    p-4 
                                    bg-white/60
                                    backdrop-blur-md 
                                    rounded-xl
                                    shadow-lg
                                    border
                                    border-white/20
                                    hover:bg-white/70
                                    transition-colors
                                    [-webkit-backdrop-filter:blur(20px)]
                                    [backdrop-filter:blur(20px)]
                                ">
                                        <Link
                                            href={`/content/${content.id}/groups/${group.id}`}
                                            className="flex-1 flex flex-col"
                                            onClick={(e) => {
                                                setIsLoading(true);
                                                localStorage.setItem(`content_${content.id}_selected_group`, group.id.toString());
                                            }}
                                        >
                                            <h3 className="text-lg font-medium text-gray-800 mb-2">{group.title}</h3>
                                        </Link>
                                        <div className="flex items-center justify-between mt-2">
                                            <div className="flex items-center gap-1">
                                                <svg
                                                    className="w-4 h-4 text-orange-500"
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
                                                <span className="text-gray-600">카드</span>
                                                <span className="text-gray-700 font-bold">{group.chunks?.filter(c => c.id).length || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    {activeTab === 'text' && (
                        <motion.div
                            key="text"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                        >
                            <div className="p-6 bg-white/80 backdrop-blur-md rounded-xl border border-white/20">
                                <div className="w-full">
                                    <p className="whitespace-pre-wrap text-gray-700">{content.original_text}</p>
                                </div>
                            </div>
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
                                <span className="text-lg font-medium text-gray-800">특별히 기억하고 싶은 내용</span>
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
        </main>
    )
}