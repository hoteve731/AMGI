'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Tag as TagIcon, Filter, X, Edit2, Trash2, ChevronDown } from 'lucide-react'
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
    tags?: Tag[]
}

type Tag = {
    id: string
    name: string
    relation_id: string
}

export default function SnippetList() {
    const router = useRouter()
    const [snippets, setSnippets] = useState<Snippet[]>([])
    const [filteredSnippets, setFilteredSnippets] = useState<Snippet[]>([])
    const [tags, setTags] = useState<{ id: string; name: string; snippets_count: number }[]>([])
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [isDeleting, setIsDeleting] = useState<{ [key: string]: boolean }>({})
    const [showTagDropdown, setShowTagDropdown] = useState(false)

    // 스니펫 목록 조회
    const fetchSnippets = async () => {
        try {
            setIsLoading(true)
            const response = await fetch('/api/snippets')
            const data = await response.json()

            if (data.snippets) {
                setSnippets(data.snippets)
                setFilteredSnippets(data.snippets)
            }
        } catch (error) {
            console.error('스니펫 조회 중 오류:', error)
            toast.error('스니펫을 불러오는 중 오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    // 태그 목록 조회
    const fetchTags = async () => {
        try {
            const response = await fetch('/api/snippet-tags')
            const data = await response.json()

            if (data.tags) {
                setTags(data.tags)
            }
        } catch (error) {
            console.error('태그 조회 중 오류:', error)
            toast.error('태그를 불러오는 중 오류가 발생했습니다.')
        }
    }

    // 스니펫 삭제
    const deleteSnippet = async (snippetId: string) => {
        try {
            setIsDeleting(prev => ({ ...prev, [snippetId]: true }))

            const response = await fetch(`/api/snippets?id=${snippetId}`, {
                method: 'DELETE',
            })

            if (response.ok) {
                toast.success('스니펫이 삭제되었습니다.')
                // 목록에서 삭제된 스니펫 제거
                setSnippets(prev => prev.filter(snippet => snippet.id !== snippetId))
                setFilteredSnippets(prev => prev.filter(snippet => snippet.id !== snippetId))
            } else {
                const data = await response.json()
                toast.error(data.error || '스니펫 삭제 중 오류가 발생했습니다.')
            }
        } catch (error) {
            console.error('스니펫 삭제 중 오류:', error)
            toast.error('스니펫 삭제 중 오류가 발생했습니다.')
        } finally {
            setIsDeleting(prev => ({ ...prev, [snippetId]: false }))
        }
    }

    // 스니펫 필터링 (검색어 + 태그)
    const filterSnippets = () => {
        let filtered = [...snippets]

        // 검색어로 필터링
        if (searchQuery) {
            const query = searchQuery.toLowerCase()
            filtered = filtered.filter(snippet =>
                snippet.header_text.toLowerCase().includes(query) ||
                snippet.markdown_content.toLowerCase().includes(query) ||
                (snippet.custom_query && snippet.custom_query.toLowerCase().includes(query))
            )
        }

        // 선택된 태그로 필터링
        if (selectedTags.length > 0) {
            filtered = filtered.filter(snippet =>
                snippet.tags && snippet.tags.some(tag => selectedTags.includes(tag.id))
            )
        }

        setFilteredSnippets(filtered)
    }

    // 태그 선택/해제
    const toggleTag = (tagId: string) => {
        setSelectedTags(prev =>
            prev.includes(tagId)
                ? prev.filter(id => id !== tagId)
                : [...prev, tagId]
        )
    }

    // 필터 초기화
    const resetFilters = () => {
        setSearchQuery('')
        setSelectedTags([])
        setFilteredSnippets(snippets)
    }

    // 초기 데이터 로드
    useEffect(() => {
        fetchSnippets()
        fetchTags()
    }, [])

    // 필터링 적용
    useEffect(() => {
        filterSnippets()
    }, [searchQuery, selectedTags, snippets])

    // 스니펫 타입에 따른 배지 색상
    const getSnippetTypeBadge = (type: string) => {
        switch (type) {
            case 'summary':
                return <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800">요약</span>
            case 'question':
                return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">질문</span>
            case 'explanation':
                return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">설명</span>
            case 'custom':
                return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800">커스텀</span>
            default:
                return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800">기타</span>
        }
    }

    // 날짜 포맷팅
    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })
    }

    // 마크다운 렌더링
    const renderMarkdown = (content: string) => {
        return { __html: marked(content) }
    }

    return (
        <div className="w-full max-w-4xl mx-auto p-4">
            {/* 검색 및 필터 */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search size={18} className="text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="스니펫 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        >
                            <X size={16} className="text-gray-400 hover:text-gray-600" />
                        </button>
                    )}
                </div>

                <div className="relative">
                    <button
                        onClick={() => setShowTagDropdown(!showTagDropdown)}
                        className="flex items-center px-4 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50"
                    >
                        <Filter size={18} className="mr-2 text-gray-600" />
                        <span>태그 필터</span>
                        {selectedTags.length > 0 && (
                            <span className="ml-2 w-5 h-5 flex items-center justify-center bg-purple-600 text-white text-xs rounded-full">
                                {selectedTags.length}
                            </span>
                        )}
                        <ChevronDown size={16} className="ml-2 text-gray-600" />
                    </button>

                    {showTagDropdown && (
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                            <div className="p-2 max-h-60 overflow-y-auto">
                                {tags.length > 0 ? (
                                    tags.map((tag) => (
                                        <div
                                            key={tag.id}
                                            className="flex items-center justify-between px-3 py-2 hover:bg-gray-100 rounded cursor-pointer"
                                            onClick={() => toggleTag(tag.id)}
                                        >
                                            <div className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTags.includes(tag.id)}
                                                    onChange={() => { }}
                                                    className="mr-2"
                                                />
                                                <span>{tag.name}</span>
                                            </div>
                                            <span className="px-1.5 py-0.5 text-xs bg-gray-200 rounded-full">
                                                {tag.snippets_count}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="px-3 py-2 text-gray-500">태그가 없습니다</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {(searchQuery || selectedTags.length > 0) && (
                    <button
                        className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-800"
                        onClick={resetFilters}
                    >
                        <X size={18} className="mr-1" />
                        <span>초기화</span>
                    </button>
                )}
            </div>

            {/* 선택된 태그 표시 */}
            {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                    {selectedTags.map(tagId => {
                        const tag = tags.find(t => t.id === tagId)
                        return tag ? (
                            <div
                                key={tag.id}
                                className="flex items-center bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-sm"
                            >
                                <TagIcon size={12} className="mr-1" />
                                <span>{tag.name}</span>
                                <button
                                    onClick={() => toggleTag(tag.id)}
                                    className="ml-1 text-purple-600 hover:text-purple-800"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ) : null
                    })}
                </div>
            )}

            {/* 스니펫 목록 */}
            {isLoading ? (
                <div className="flex justify-center items-center py-12">
                    <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="ml-2 text-gray-600">스니펫을 불러오는 중...</span>
                </div>
            ) : filteredSnippets.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                    {filteredSnippets.map(snippet => (
                        <div key={snippet.id} className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col">
                                        <h3 className="text-lg font-semibold text-gray-800">{snippet.header_text}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            {getSnippetTypeBadge(snippet.snippet_type)}
                                            <span className="text-xs text-gray-500">
                                                {formatDate(snippet.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            className="p-1 text-gray-500 hover:text-purple-600 transition-colors"
                                            onClick={() => router.push(`/snippets/${snippet.id}/edit`)}
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                                            onClick={() => {
                                                if (confirm('정말로 이 스니펫을 삭제하시겠습니까?')) {
                                                    deleteSnippet(snippet.id)
                                                }
                                            }}
                                            disabled={isDeleting[snippet.id]}
                                        >
                                            {isDeleting[snippet.id] ? (
                                                <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                                            ) : (
                                                <Trash2 size={16} />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div
                                    className="text-sm text-gray-700 mt-2 line-clamp-3 markdown-body"
                                    dangerouslySetInnerHTML={{ __html: marked(snippet.markdown_content) }}
                                />

                                {snippet.tags && snippet.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {snippet.tags.map(tag => (
                                            <div
                                                key={tag.id}
                                                className="flex items-center bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs cursor-pointer hover:bg-purple-100 hover:text-purple-800"
                                                onClick={() => toggleTag(tag.id)}
                                            >
                                                <TagIcon size={10} className="mr-1" />
                                                <span>{tag.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                    <p className="mb-2">검색 결과가 없습니다.</p>
                    {(searchQuery || selectedTags.length > 0) && (
                        <button
                            className="text-purple-600 hover:text-purple-800 underline"
                            onClick={resetFilters}
                        >
                            모든 스니펫 보기
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
