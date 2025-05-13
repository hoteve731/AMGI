'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Tag as TagIcon, ExternalLink, Edit2, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { marked } from 'marked'

type TagRelation = {
    id: string;
    snippet_tags: {
        id: string;
        name: string;
    };
};

type Snippet = {
    id: string
    user_id: string
    content_id: string | null
    header_text: string
    snippet_type: string
    custom_query?: string
    markdown_content: string
    created_at: string
    updated_at: string
    snippet_tag_relations?: TagRelation | TagRelation[]
}

type Tag = {
    id: string
    name: string
    relation_id: string
}

type Content = {
    id: string
    title: string
    url?: string
}

export default function SnippetDetailPage() {
    const router = useRouter()
    const params = useParams()
    const id = params?.id as string

    const [snippet, setSnippet] = useState<Snippet | null>(null)
    const [tags, setTags] = useState<Tag[]>([])
    const [sourceContent, setSourceContent] = useState<Content | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isPolling, setIsPolling] = useState(false)
    const [pollingAttempts, setPollingAttempts] = useState(0)
    const [notFound, setNotFound] = useState(false)
    const [isUrlUpdated, setIsUrlUpdated] = useState(false)

    // 폴링 관련 상태를 관리하기 위한 ref
    const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // 임시 ID인지 확인하는 함수
    const isTempId = (id: string) => {
        return id.startsWith('temp-')
    }

    // 로컬 스토리지에서 스니펫 요청 정보 가져오기
    const getSnippetRequestFromStorage = () => {
        if (!isTempId(id)) return null

        try {
            const storedData = localStorage.getItem(`snippet_request_${id}`)
            if (!storedData) return null
            return JSON.parse(storedData)
        } catch (error) {
            console.error('로컬 스토리지에서 스니펫 요청 정보를 가져오는데 실패했습니다:', error)
            return null
        }
    }

    // URL 업데이트 함수
    const updateUrl = (newId: string) => {
        if (isUrlUpdated || !isTempId(id) || id === newId) return

        console.log(`URL 업데이트: ${id} -> ${newId}`)
        setIsUrlUpdated(true)
        
        // 브라우저 히스토리 API를 사용하여 URL을 조용히 업데이트
        if (window.history && typeof window.history.replaceState === 'function') {
            window.history.replaceState(null, '', `/snippets/${newId}`)
        } else {
            // 폴백: Next.js router를 사용
            router.replace(`/snippets/${newId}`, { scroll: false })
        }
    }

    // 폴링 시작 함수
    const startPolling = () => {
        if (isPolling) return

        setIsPolling(true)
        pollForSnippet()
    }

    // 폴링 중단 함수
    const stopPolling = () => {
        if (pollingTimeoutRef.current) {
            clearTimeout(pollingTimeoutRef.current)
            pollingTimeoutRef.current = null
        }
        setIsPolling(false)
    }

    // 스니펫 폴링 함수
    const pollForSnippet = async () => {
        // 최대 폴링 시도 횟수 (10회 = 약 10초)
        const MAX_POLLING_ATTEMPTS = 10

        if (pollingAttempts >= MAX_POLLING_ATTEMPTS) {
            stopPolling()
            setNotFound(true)
            setIsLoading(false)
            return
        }

        try {
            // 먼저 로컬 스토리지에서 실제 ID 확인
            const storedData = getSnippetRequestFromStorage()
            if (storedData?.id) {
                // 저장된 실제 ID가 있으면 해당 ID로 검색
                const response = await fetch(`/api/snippets?id=${storedData.id}`)

                if (response.ok) {
                    const data = await response.json()
                    if (data.snippet) {
                        setSnippet(data.snippet)
                        processSnippetData(data.snippet)
                        updateUrl(storedData.id)
                        stopPolling()
                        return
                    }
                }
            }

            // 최근 생성된 스니펫 목록 가져오기 시도 (최적화: 최근 5개만 조회)
            const response = await fetch('/api/snippets?limit=5')

            if (response.ok) {
                const data = await response.json()
                if (data.snippets && Array.isArray(data.snippets)) {
                    // 저장된 요청 데이터와 일치하는 스니펫 찾기
                    const storedRequest = getSnippetRequestFromStorage()
                    if (storedRequest) {
                        const matchingSnippet = data.snippets.find((s: Snippet) =>
                            s.header_text === storedRequest.header_text &&
                            s.snippet_type === storedRequest.snippet_type &&
                            s.content_id === storedRequest.content_id
                        )

                        if (matchingSnippet) {
                            setSnippet(matchingSnippet)
                            processSnippetData(matchingSnippet)

                            // 로컬 스토리지 업데이트
                            if (storedRequest) {
                                localStorage.setItem(`snippet_request_${id}`, JSON.stringify({
                                    ...storedRequest,
                                    id: matchingSnippet.id,
                                    status: 'success'
                                }))
                            }

                            // URL 업데이트
                            updateUrl(matchingSnippet.id)
                            stopPolling()
                            return
                        }
                    }
                }
            }

            // 스니펫을 찾지 못했으면 폴링 계속 (최적화: 간격을 점진적으로 늘림)
            setPollingAttempts(prev => prev + 1)
            const nextInterval = Math.min(1000 * (1 + pollingAttempts * 0.2), 2000) // 1초에서 시작해서 최대 2초까지 늘림
            pollingTimeoutRef.current = setTimeout(pollForSnippet, nextInterval)

        } catch (error) {
            console.error('스니펫 폴링 중 오류:', error)
            setPollingAttempts(prev => prev + 1)
            pollingTimeoutRef.current = setTimeout(pollForSnippet, 1500)
        }
    }

    // 스니펫 데이터 처리 함수
    const processSnippetData = (snippetData: Snippet) => {
        // 태그 정보 설정
        if (snippetData.snippet_tag_relations) {
            // 태그 관계가 배열인지 확인 (단일 객체일 수도 있음)
            const relations = Array.isArray(snippetData.snippet_tag_relations)
                ? snippetData.snippet_tag_relations
                : [snippetData.snippet_tag_relations];

            // 태그 추출
            const extractedTags = relations
                .filter((relation: TagRelation) => relation.snippet_tags)
                .map((relation: TagRelation) => ({
                    id: relation.snippet_tags.id,
                    name: relation.snippet_tags.name,
                    relation_id: relation.id
                }));

            setTags(extractedTags);
        } else {
            setTags([]);
        }

        // 소스 콘텐츠 정보 가져오기 (있는 경우)
        if (snippetData.content_id) {
            fetchSourceContent(snippetData.content_id);
        }

        setIsLoading(false);
    }

    // 스니펫 데이터 로드
    const fetchSnippet = async () => {
        try {
            setIsLoading(true)

            // 실제 ID인 경우 일반적인 데이터 로드
            const response = await fetch(`/api/snippets?id=${id}`)

            if (!response.ok) {
                if (response.status === 404) {
                    setNotFound(true)
                } else {
                    toast.error('스니펫을 불러오는데 실패했습니다')
                }
                setIsLoading(false)
                return
            }

            const data = await response.json()

            if (data.snippet) {
                setSnippet(data.snippet)
                processSnippetData(data.snippet)
            } else {
                setNotFound(true)
            }
        } catch (error) {
            console.error('스니펫 로드 중 오류:', error)
            toast.error('스니펫을 불러오는데 실패했습니다')
        } finally {
            setIsLoading(false)
        }
    }

    // 연결된 콘텐츠 정보 로드
    const fetchSourceContent = async (contentId: string) => {
        try {
            const response = await fetch(`/api/contents?id=${contentId}`)

            if (!response.ok) {
                throw new Error('콘텐츠 정보를 불러오는데 실패했습니다')
            }

            const data = await response.json()

            if (data.content) {
                setSourceContent(data.content)
            }
        } catch (error) {
            console.error('콘텐츠 정보 로드 중 오류:', error)
        }
    }

    // 스니펫 삭제
    const deleteSnippet = async () => {
        if (!confirm('Are you sure you want to delete this snippet?')) {
            return
        }

        try {
            setIsDeleting(true)
            const response = await fetch(`/api/snippets?id=${id}`, {
                method: 'DELETE',
            })

            if (response.ok) {
                toast.success('스니펫이 삭제되었습니다')
                setTimeout(() => {
                    router.back()
                }, 300)
            } else {
                const data = await response.json()
                toast.error(data.error || '스니펫 삭제 중 오류가 발생했습니다')
            }
        } catch (error) {
            console.error('스니펫 삭제 중 오류:', error)
            toast.error('스니펫 삭제 중 오류가 발생했습니다')
        } finally {
            setIsDeleting(false)
        }
    }

    // 스니펫 타입에 따른 배지 색상
    const getSnippetTypeBadge = (type: string) => {
        switch (type) {
            case 'summary':
                return <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800">Summary</span>
            case 'question':
                return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">Question</span>
            case 'explanation':
                return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">Explanation</span>
            case 'custom':
                return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800">Custom</span>
            default:
                return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800">Other</span>
        }
    }

    // 날짜 포맷팅 (May 8, 2025 형식)
    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        })
    }

    useEffect(() => {
        // 임시 ID인 경우 폴링 시작
        if (isTempId(id)) {
            startPolling()
        } else {
            // 실제 ID인 경우 스니펫 데이터 가져오기
            fetchSnippet()
        }

        return () => {
            stopPolling()
        }
    }, [id])

    // 스켈레톤 로딩 컴포넌트
    const SkeletonLoading = () => (
        <div className="max-w-3xl mx-auto p-4">
            {/* Custom animation style for smoother pulse effect */}
            <style jsx>{`
                @keyframes smoothPulse {
                    0%, 100% {
                        opacity: 0.6;
                        background-color: rgba(209, 213, 219, 0.8);
                    }
                    50% {
                        opacity: 0.4;
                        background-color: rgba(209, 213, 219, 0.5);
                    }
                }
                .smooth-pulse {
                    animation: smoothPulse 2.5s ease-in-out infinite;
                    will-change: opacity, background-color;
                    background-color: rgba(209, 213, 219, 0.8);
                }
            `}</style>
            
            {/* 네비게이션 바 */}
            <div className="flex items-center justify-between mb-6">
                <button
                    className="p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="flex space-x-2">
                    <div className="w-10 h-10 rounded-full bg-gray-300 smooth-pulse"></div>
                    <div className="w-10 h-10 rounded-full bg-gray-300 smooth-pulse"></div>
                </div>
            </div>

            {/* 헤더 섹션 스켈레톤 */}
            <div className="mb-6">
                <div className="h-8 bg-gray-300 rounded w-3/4 mb-2 smooth-pulse"></div>
                <div className="h-5 bg-gray-300 rounded w-1/3 mb-3 smooth-pulse"></div>
                <div className="flex space-x-2 mb-4">
                    <div className="h-6 bg-gray-300 rounded w-20 smooth-pulse"></div>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                    <div className="h-7 bg-gray-300 rounded-full w-16 smooth-pulse"></div>
                    <div className="h-7 bg-gray-300 rounded-full w-24 smooth-pulse"></div>
                </div>
            </div>

            {/* 마크다운 콘텐츠 스켈레톤 */}
            <div className="mb-8 space-y-3">
                <div className="h-5 bg-gray-300 rounded w-full smooth-pulse"></div>
                <div className="h-5 bg-gray-300 rounded w-full smooth-pulse"></div>
                <div className="h-5 bg-gray-300 rounded w-5/6 smooth-pulse"></div>
                <div className="h-5 bg-gray-300 rounded w-full smooth-pulse"></div>
                <div className="h-5 bg-gray-300 rounded w-4/5 smooth-pulse"></div>
            </div>

            {/* 소스 섹션 스켈레톤 */}
            <div className="mt-8 border-t pt-6">
                <div className="h-6 bg-gray-300 rounded w-40 mb-3 smooth-pulse"></div>
                <div className="flex justify-between items-center p-4 border border-gray-200 rounded-lg">
                    <div>
                        <p className="font-medium"></p>
                        <p className="text-sm text-gray-500 truncate"></p>
                    </div>
                    <div className="h-8 bg-gray-300 rounded w-24 smooth-pulse"></div>
                </div>
            </div>
        </div>
    )

    if (notFound) {
        return (
            <div className="max-w-3xl mx-auto p-4">
                <div className="flex items-center mb-6">
                    <button
                        onClick={() => {
                            // 원본 노트가 있는 경우 해당 노트로 이동, 없는 경우 스니펫 목록으로 이동
                            if (sourceContent && sourceContent.id) {
                                router.push(`/content/${sourceContent.id}/groups`)
                            } else {
                                router.push('/?tab=snippets')
                            }
                        }}
                        className="p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-xl font-bold ml-2">Snippet Not Found</h1>
                </div>
                <p className="text-gray-600">
                    The snippet you're looking for could not be found. It may have been deleted or is still being created.
                </p>
                <button
                    onClick={() => router.push('/?tab=snippets')}
                    className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                    Go to Snippets
                </button>
            </div>
        )
    }

    if (isLoading) {
        return <SkeletonLoading />
    }

    if (!snippet) {
        return <SkeletonLoading />
    }

    return (
        <div className="max-w-3xl mx-auto p-4">
            {/* 네비게이션 바 */}
            <div className="flex items-center justify-between mb-6">
                <button
                    onClick={() => {
                        // 원본 노트가 있는 경우 해당 노트로 이동, 없는 경우 스니펫 목록으로 이동
                        if (sourceContent && sourceContent.id) {
                            router.push(`/content/${sourceContent.id}/groups`)
                        } else {
                            router.push('/?tab=snippets')
                        }
                    }}
                    className="p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>

                {snippet && (
                    <div className="flex space-x-2">
                        <button
                            onClick={() => router.push(`/snippets/${snippet.id}/edit`)}
                            className="p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
                        >
                            <Edit2 size={20} />
                        </button>
                        <button
                            onClick={deleteSnippet}
                            className="p-2 text-gray-600 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors"
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Trash2 size={20} />
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* 헤더 섹션 */}
            <div className="mb-6">
                <div className="flex flex-wrap items-start gap-4 mb-2">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">{snippet?.header_text}</h1>
                        <div className="flex items-center space-x-2 text-sm text-gray-500">
                            <span>{formatDate(snippet?.created_at)}</span>
                            {snippet?.created_at !== snippet?.updated_at && (
                                <span>(수정됨: {formatDate(snippet?.updated_at)})</span>
                            )}
                        </div>

                        {/* 스니펫 타입 배지 */}
                        <div className="mt-1">
                            {getSnippetTypeBadge(snippet?.snippet_type)}
                        </div>
                    </div>
                </div>

                {snippet?.custom_query && (
                    <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-md">
                        <p className="text-sm text-gray-700">
                            <span className="font-medium">Custom Query:</span> {snippet?.custom_query}
                        </p>
                    </div>
                )}
            </div>

            {/* 콘텐츠 섹션 */}
            <div className="mb-8 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                <div
                    className="prose prose-sm max-w-none markdown-body"
                    dangerouslySetInnerHTML={{ __html: marked(snippet?.markdown_content) }}
                />
            </div>

            {/* 태그 섹션 */}
            {tags.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-lg font-semibold mb-2">Tags</h2>
                    <div className="flex flex-wrap gap-2">
                        {tags.map(tag => (
                            <div
                                key={tag.id}
                                className="flex items-center px-3 py-1.5 rounded-full bg-gray-200 text-gray-700 text-sm cursor-pointer hover:bg-gray-300"
                                onClick={() => router.push(`/?tab=snippets&tag=${tag.id}`)}
                            >
                                <TagIcon size={14} className="mr-1.5" />
                                <span>{tag.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}



            {/* 소스 콘텐츠 정보 */}
            {sourceContent && (
                <div className="mt-8 border-t pt-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Source Note</h3>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                        <div>
                            <p className="font-medium">{sourceContent.title}</p>
                            {sourceContent.url && (
                                <p className="text-sm text-gray-500 truncate">{sourceContent.url}</p>
                            )}
                        </div>
                        <button
                            className="px-3 py-1 text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1"
                            onClick={() => router.push(`/content/${sourceContent.id}/groups`)}
                        >
                            <ExternalLink size={16} />
                            View
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
