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
        // 최대 폴링 시도 횟수 (20회 = 약 30초)
        const MAX_POLLING_ATTEMPTS = 20
        
        if (pollingAttempts >= MAX_POLLING_ATTEMPTS) {
            stopPolling()
            setNotFound(true)
            setIsLoading(false)
            return
        }

        try {
            // 실제 스니펫 ID로 검색 시도
            const storedData = getSnippetRequestFromStorage()
            if (storedData?.id) {
                // 저장된 실제 ID가 있으면 해당 ID로 검색
                const response = await fetch(`/api/snippets?id=${storedData.id}`)
                
                if (response.ok) {
                    const data = await response.json()
                    if (data.snippet) {
                        setSnippet(data.snippet)
                        processSnippetData(data.snippet)
                        stopPolling()
                        return
                    }
                }
            }

            // 최근 생성된 스니펫 목록 가져오기 시도
            const response = await fetch('/api/snippets?limit=10')
            
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
                            
                            stopPolling()
                            return
                        }
                    }
                }
            }

            // 스니펫을 찾지 못했으면 폴링 계속
            setPollingAttempts(prev => prev + 1)
            pollingTimeoutRef.current = setTimeout(pollForSnippet, 1500)
            
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

            // 태그 관계 타입 정의
            type TagRelation = {
                id: string;
                snippet_tags: {
                    id: string;
                    name: string;
                };
            };

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

        // 연결된 콘텐츠가 있으면 콘텐츠 정보 로드
        if (snippetData.content_id) {
            fetchContentInfo(snippetData.content_id)
        }
    }

    // 스니펫 데이터 로드
    const fetchSnippet = async () => {
        try {
            setIsLoading(true)
            
            // 임시 ID인 경우 폴링 시작
            if (isTempId(id)) {
                const storedRequest = getSnippetRequestFromStorage()
                if (storedRequest) {
                    startPolling()
                    return
                } else {
                    // 임시 ID지만 로컬 스토리지에 정보가 없는 경우
                    setNotFound(true)
                    setIsLoading(false)
                    return
                }
            }
            
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
    const fetchContentInfo = async (contentId: string) => {
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

    // 초기 데이터 로드
    useEffect(() => {
        if (id) {
            fetchSnippet()
        }
        
        // 컴포넌트 언마운트 시 폴링 중단
        return () => {
            if (pollingTimeoutRef.current) {
                clearTimeout(pollingTimeoutRef.current)
            }
        }
    }, [id])

    // 스켈레톤 로딩 UI 컴포넌트
    const SkeletonUI = () => (
        <div className="max-w-4xl mx-auto p-4 animate-pulse">
            {/* 네비게이션 바 스켈레톤 */}
            <div className="flex justify-between items-center mb-6">
                <div className="h-10 w-24 bg-gray-200 rounded"></div>
                <div className="flex space-x-2">
                    <div className="h-10 w-10 bg-gray-200 rounded"></div>
                    <div className="h-10 w-10 bg-gray-200 rounded"></div>
                </div>
            </div>
            
            {/* 헤더 스켈레톤 */}
            <div className="mb-6">
                <div className="h-8 w-3/4 bg-gray-200 rounded mb-2"></div>
                <div className="h-5 w-1/3 bg-gray-200 rounded mb-2"></div>
                <div className="flex space-x-2 mb-4">
                    <div className="h-6 w-16 bg-gray-200 rounded"></div>
                </div>
                <div className="h-5 w-1/2 bg-gray-200 rounded"></div>
            </div>
            
            {/* 콘텐츠 스켈레톤 */}
            <div className="mb-8 space-y-3">
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-4/5"></div>
            </div>
            
            {/* 태그 스켈레톤 */}
            <div className="mb-6">
                <div className="h-6 w-24 bg-gray-200 rounded mb-2"></div>
                <div className="flex space-x-2">
                    <div className="h-8 w-20 bg-gray-200 rounded"></div>
                    <div className="h-8 w-24 bg-gray-200 rounded"></div>
                </div>
            </div>
            
            {/* 소스 스켈레톤 */}
            <div>
                <div className="h-6 w-32 bg-gray-200 rounded mb-2"></div>
                <div className="h-10 w-full bg-gray-200 rounded"></div>
            </div>
        </div>
    )
    
    // 폴링 중 UI
    const PollingUI = () => (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
            <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="mt-4 text-gray-600">스니펫 데이터를 가져오는 중...</span>
            <p className="mt-2 text-sm text-gray-500">잠시만 기다려주세요. 서버에서 스니펫을 처리하고 있습니다.</p>
        </div>
    )

    if (isLoading) {
        return isTempId(id) ? <PollingUI /> : <SkeletonUI />
    }
    
    if (isPolling) {
        return <PollingUI />
    }

    if (notFound || !snippet) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4">
                <p className="text-gray-600">스니펫을 찾을 수 없습니다.</p>
                <button
                    className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                    onClick={() => router.push('/?tab=snippets')}
                >
                    스니펫 목록으로 돌아가기
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto p-4 pb-16">
            {/* 네비게이션 바 - 뒤로가기 버튼과 편집/삭제 버튼 */}
            <div className="flex items-center justify-between mb-6">
                <button
                    className="flex items-center text-gray-600 hover:text-purple-600"
                    onClick={() => router.back()}
                >
                    <ArrowLeft size={16} className="mr-1" />
                    <span>Back</span>
                </button>

                <div className="flex items-center gap-2">
                    <button
                        className="p-2 text-gray-600 hover:text-purple-600 transition-colors"
                        onClick={() => router.push(`/snippets/${snippet.id}/edit`)}
                    >
                        <Edit2 size={18} />
                    </button>
                    <button
                        className="p-2 text-gray-600 hover:text-red-600 transition-colors"
                        onClick={deleteSnippet}
                        disabled={isDeleting}
                    >
                        {isDeleting ? (
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mx-1"></div>
                        ) : (
                            <Trash2 size={18} />
                        )}
                    </button>
                </div>
            </div>

            {/* 헤더 섹션 */}
            <div className="mb-6">
                <div className="flex flex-wrap items-start gap-4 mb-2">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">{snippet.header_text}</h1>
                        <div className="flex items-center space-x-2 text-sm text-gray-500">
                            <span>{formatDate(snippet.created_at)}</span>
                            {snippet.created_at !== snippet.updated_at && (
                                <span>(수정됨: {formatDate(snippet.updated_at)})</span>
                            )}
                        </div>
                        
                        {/* 스니펫 타입 배지 */}
                        <div className="mt-1">
                            {getSnippetTypeBadge(snippet.snippet_type)}
                        </div>
                        
                        {/* 임시 ID인 경우 알림 표시 */}
                        {isTempId(id) && snippet.id !== id && (
                            <div className="mt-2 p-2 bg-yellow-50 text-yellow-700 text-sm rounded border border-yellow-200">
                                현재 URL이 임시 ID를 사용하고 있습니다. 북마크하시려면 새로고침 후 현재 URL을 사용하세요.
                            </div>
                        )}
                    </div>
                </div>

                {snippet.custom_query && (
                    <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-md">
                        <p className="text-sm text-gray-700">
                            <span className="font-medium">Custom Query:</span> {snippet.custom_query}
                        </p>
                    </div>
                )}
            </div>

            {/* 콘텐츠 섹션 */}
            <div className="mb-8 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                <div
                    className="prose prose-sm max-w-none markdown-body"
                    dangerouslySetInnerHTML={{ __html: marked(snippet.markdown_content) }}
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

            {/* 임시 ID인 경우 새로고침 버튼 */}
            {isTempId(id) && snippet.id !== id && (
                <div className="mt-4">
                    <button 
                        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                        onClick={() => router.replace(`/snippets/${snippet.id}`)}
                    >
                        정확한 URL로 업데이트
                    </button>
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
