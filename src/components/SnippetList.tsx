'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Button, Card, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Input, Spinner } from '@nextui-org/react'
import { Search, Tag, Filter, X, Edit2, Trash2, ChevronDown } from 'lucide-react'
import { toast } from 'react-hot-toast'

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
                return <Badge color="primary">요약</Badge>
            case 'question':
                return <Badge color="secondary">질문</Badge>
            case 'explanation':
                return <Badge color="success">설명</Badge>
            case 'custom':
                return <Badge color="warning">커스텀</Badge>
            default:
                return <Badge>기타</Badge>
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

    return (
        <div className="w-full max-w-4xl mx-auto p-4">
            <h1 className="text-2xl font-bold mb-6">내 스니펫</h1>

            {/* 검색 및 필터 */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <Input
                    placeholder="스니펫 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    startContent={<Search size={18} />}
                    clearable
                    className="flex-1"
                />

                <Dropdown>
                    <DropdownTrigger>
                        <Button
                            variant="flat"
                            startContent={<Filter size={18} />}
                            endContent={<ChevronDown size={18} />}
                        >
                            태그 필터
                            {selectedTags.length > 0 && (
                                <Badge content={selectedTags.length} color="primary" shape="circle" size="sm" />
                            )}
                        </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                        aria-label="태그 필터"
                        selectionMode="multiple"
                        selectedKeys={new Set(selectedTags)}
                        onSelectionChange={(keys) => setSelectedTags(Array.from(keys as Set<string>))}
                    >
                        {tags.length > 0 ? (
                            tags.map((tag) => (
                                <DropdownItem key={tag.id} textValue={tag.name}>
                                    <div className="flex items-center justify-between">
                                        <span>{tag.name}</span>
                                        <Badge size="sm" content={tag.snippets_count} />
                                    </div>
                                </DropdownItem>
                            ))
                        ) : (
                            <DropdownItem isDisabled>태그가 없습니다</DropdownItem>
                        )}
                    </DropdownMenu>
                </Dropdown>

                {(searchQuery || selectedTags.length > 0) && (
                    <Button
                        variant="light"
                        startContent={<X size={18} />}
                        onClick={resetFilters}
                    >
                        초기화
                    </Button>
                )}
            </div>

            {/* 선택된 태그 표시 */}
            {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                    {selectedTags.map(tagId => {
                        const tag = tags.find(t => t.id === tagId)
                        return tag ? (
                            <Chip
                                key={tag.id}
                                onClose={() => toggleTag(tag.id)}
                                variant="flat"
                                color="primary"
                                startContent={<Tag size={14} />}
                            >
                                {tag.name}
                            </Chip>
                        ) : null
                    })}
                </div>
            )}

            {/* 스니펫 목록 */}
            {isLoading ? (
                <div className="flex justify-center items-center py-12">
                    <Spinner size="lg" label="스니펫을 불러오는 중..." />
                </div>
            ) : filteredSnippets.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                    {filteredSnippets.map(snippet => (
                        <Card key={snippet.id} className="p-4">
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col">
                                        <h3 className="text-lg font-semibold">{snippet.header_text}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            {getSnippetTypeBadge(snippet.snippet_type)}
                                            <span className="text-xs text-gray-500">
                                                {formatDate(snippet.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            isIconOnly
                                            size="sm"
                                            variant="light"
                                            onClick={() => router.push(`/snippets/${snippet.id}/edit`)}
                                        >
                                            <Edit2 size={16} />
                                        </Button>
                                        <Button
                                            isIconOnly
                                            size="sm"
                                            variant="light"
                                            color="danger"
                                            isLoading={isDeleting[snippet.id]}
                                            onClick={() => {
                                                if (confirm('정말로 이 스니펫을 삭제하시겠습니까?')) {
                                                    deleteSnippet(snippet.id)
                                                }
                                            }}
                                        >
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                </div>

                                <p className="text-sm text-gray-700 mt-2 line-clamp-3">
                                    {snippet.markdown_content}
                                </p>

                                {snippet.tags && snippet.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {snippet.tags.map(tag => (
                                            <Chip
                                                key={tag.id}
                                                size="sm"
                                                variant="flat"
                                                startContent={<Tag size={12} />}
                                                onClick={() => toggleTag(tag.id)}
                                                className="cursor-pointer"
                                            >
                                                {tag.name}
                                            </Chip>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 border rounded-lg">
                    <p className="text-gray-500">
                        {searchQuery || selectedTags.length > 0
                            ? '검색 결과가 없습니다.'
                            : '저장된 스니펫이 없습니다. 마크다운 헤더 옆의 ✨ 아이콘을 클릭하여 스니펫을 생성해보세요.'}
                    </p>
                </div>
            )}
        </div>
    )
}
