'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Tag as TagIcon, ExternalLink, Edit2, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { marked } from 'marked'

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

    // 스니펫 데이터 로드
    const fetchSnippet = async () => {
        try {
            setIsLoading(true)
            const response = await fetch(`/api/snippets?id=${id}`)

            if (!response.ok) {
                throw new Error('스니펫을 불러오는데 실패했습니다')
            }

            const data = await response.json()

            if (data.snippet) {
                setSnippet(data.snippet)

                // 태그 정보 설정
                if (data.snippet.snippet_tag_relations) {
                    // 태그 관계가 배열인지 확인 (단일 객체일 수도 있음)
                    const relations = Array.isArray(data.snippet.snippet_tag_relations)
                        ? data.snippet.snippet_tag_relations
                        : [data.snippet.snippet_tag_relations];

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

                    console.log('추출된 태그:', extractedTags);
                    setTags(extractedTags);
                } else {
                    console.log('스니펫에 태그 관계가 없습니다:', data.snippet);
                    setTags([]);
                }

                // 연결된 콘텐츠가 있으면 콘텐츠 정보 로드
                if (data.snippet.content_id) {
                    fetchContentInfo(data.snippet.content_id)
                }
            } else {
                toast.error('스니펫을 찾을 수 없습니다')
                router.push('/?tab=snippets')
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
    }, [id])

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4">
                <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="mt-4 text-gray-600">Loading...</span>
            </div>
        )
    }

    if (!snippet) {
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
                        <p className="text-sm text-gray-500 mt-1">
                            {formatDate(snippet.created_at)}
                            {snippet.updated_at !== snippet.created_at && ` · Updated: ${formatDate(snippet.updated_at)}`}
                        </p>

                        <div className="mt-2">
                            {getSnippetTypeBadge(snippet.snippet_type)}
                        </div>
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

            {/* 출처 섹션 */}
            {sourceContent && (
                <div className="mb-6">
                    <h2 className="text-lg font-semibold mb-2">Source Note</h2>
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <ExternalLink size={16} className="text-gray-500 mr-2" />
                                <span className="text-gray-700">{sourceContent.title}</span>
                            </div>
                            <button
                                className="text-purple-600 hover:text-purple-800"
                                onClick={() => router.push(`/content/${sourceContent.id}/groups`)}
                            >
                                View
                            </button>
                        </div>
                        {sourceContent.url && (
                            <a
                                href={sourceContent.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 text-sm text-blue-600 hover:underline flex items-center"
                            >
                                <ExternalLink size={12} className="mr-1" />
                                {sourceContent.url}
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
