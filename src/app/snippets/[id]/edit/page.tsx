'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { ArrowLeft, Save, Tag as TagIcon, Plus, X } from 'lucide-react'

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

export default function EditSnippetPage() {
    const router = useRouter()
    const params = useParams()
    const id = params?.id as string

    const [snippet, setSnippet] = useState<Snippet | null>(null)
    const [headerText, setHeaderText] = useState('')
    const [snippetType, setSnippetType] = useState('')
    const [customQuery, setCustomQuery] = useState('')
    const [markdownContent, setMarkdownContent] = useState('')

    const [tags, setTags] = useState<Tag[]>([])
    const [availableTags, setAvailableTags] = useState<{ id: string; name: string }[]>([])
    const [newTagName, setNewTagName] = useState('')
    const [selectedTagId, setSelectedTagId] = useState('')

    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isAddingTag, setIsAddingTag] = useState(false)
    const [isCreatingTag, setIsCreatingTag] = useState(false)

    // 스니펫 데이터 로드
    const fetchSnippet = async () => {
        try {
            setIsLoading(true)
            const response = await fetch(`/api/snippets?id=${id}`)

            if (!response.ok) {
                toast.error('스니펫을 찾을 수 없습니다.')
                router.push('/snippets')
                return
            }

            const data = await response.json()

            if (data.snippet) {
                setSnippet(data.snippet)
                setHeaderText(data.snippet.header_text)
                setSnippetType(data.snippet.snippet_type)
                setCustomQuery(data.snippet.custom_query || '')
                setMarkdownContent(data.snippet.markdown_content)
            }
        } catch (error) {
            console.error('스니펫 로드 중 오류:', error)
            toast.error('스니펫을 불러오는 중 오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    // 스니펫 태그 로드
    const fetchSnippetTags = async () => {
        try {
            const response = await fetch(`/api/snippet-tag-relations?snippet_id=${id}`)
            const data = await response.json()

            if (data.tags) {
                setTags(data.tags)
            }
        } catch (error) {
            console.error('태그 로드 중 오류:', error)
            toast.error('태그를 불러오는 중 오류가 발생했습니다.')
        }
    }

    // 사용 가능한 태그 목록 로드
    const fetchAvailableTags = async () => {
        try {
            const response = await fetch('/api/snippet-tags')
            const data = await response.json()

            if (data.tags) {
                setAvailableTags(data.tags)
            }
        } catch (error) {
            console.error('태그 목록 로드 중 오류:', error)
        }
    }

    // 스니펫 업데이트
    const updateSnippet = async () => {
        try {
            setIsSaving(true)

            // 필수 필드 검증
            if (!headerText) {
                toast.error('헤더 텍스트를 입력해주세요.')
                return
            }

            if (!snippetType) {
                toast.error('스니펫 타입을 선택해주세요.')
                return
            }

            if (snippetType === 'custom' && !customQuery) {
                toast.error('커스텀 쿼리를 입력해주세요.')
                return
            }

            if (!markdownContent) {
                toast.error('마크다운 내용을 입력해주세요.')
                return
            }

            const snippetData = {
                id,
                header_text: headerText,
                snippet_type: snippetType,
                custom_query: snippetType === 'custom' ? customQuery : null,
                markdown_content: markdownContent
            }

            const response = await fetch('/api/snippets', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(snippetData),
            })

            if (response.ok) {
                toast.success('스니펫이 업데이트되었습니다.')
                router.push('/?tab=snippets')
            } else {
                const data = await response.json()
                toast.error(data.error || '스니펫 업데이트 중 오류가 발생했습니다.')
            }
        } catch (error) {
            console.error('스니펫 업데이트 중 오류:', error)
            toast.error('스니펫 업데이트 중 오류가 발생했습니다.')
        } finally {
            setIsSaving(false)
        }
    }

    // 태그 추가
    const addTag = async () => {
        try {
            setIsAddingTag(true)

            if (!selectedTagId) {
                toast.error('태그를 선택해주세요.')
                return
            }

            // 이미 추가된 태그인지 확인
            if (tags.some(tag => tag.id === selectedTagId)) {
                toast.error('이미 추가된 태그입니다.')
                setSelectedTagId('')
                return
            }

            const response = await fetch('/api/snippet-tag-relations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    snippet_id: id,
                    tag_id: selectedTagId
                }),
            })

            if (response.ok) {
                const data = await response.json()
                setTags(prev => [...prev, data])
                setSelectedTagId('')
                toast.success('태그가 추가되었습니다.')
            } else {
                const data = await response.json()
                toast.error(data.error || '태그 추가 중 오류가 발생했습니다.')
            }
        } catch (error) {
            console.error('태그 추가 중 오류:', error)
            toast.error('태그 추가 중 오류가 발생했습니다.')
        } finally {
            setIsAddingTag(false)
        }
    }

    // 태그 ID로 직접 태그 추가 (내부 함수)
    const addTagDirectly = async (tagId: string) => {
        try {
            // 이미 추가된 태그인지 확인
            if (tags.some(tag => tag.id === tagId)) {
                return // 이미 추가된 태그면 무시
            }

            const response = await fetch('/api/snippet-tag-relations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    snippet_id: id,
                    tag_id: tagId
                }),
            })

            if (response.ok) {
                const data = await response.json()
                setTags(prev => [...prev, data])
                toast.success('태그가 추가되었습니다.')
            } else {
                const data = await response.json()
                toast.error(data.error || '태그 추가 중 오류가 발생했습니다.')
            }
        } catch (error) {
            console.error('태그 추가 중 오류:', error)
            toast.error('태그 추가 중 오류가 발생했습니다.')
        }
    }

    // 새 태그 생성
    const createTag = async () => {
        try {
            setIsCreatingTag(true)

            if (!newTagName.trim()) {
                toast.error('태그 이름을 입력해주세요.')
                return
            }

            const response = await fetch('/api/snippet-tags', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: newTagName.trim()
                }),
            })

            const data = await response.json()

            if (response.ok || response.status === 409) {
                // 성공적으로 생성되거나 이미 존재하는 태그인 경우
                const tag = data.tag

                // 사용 가능한 태그 목록 업데이트
                if (!availableTags.some(t => t.id === tag.id)) {
                    setAvailableTags(prev => [...prev, tag])
                }

                // 새 태그 입력 필드 초기화
                setNewTagName('')

                if (response.ok) {
                    toast.success('새 태그가 생성되었습니다.')
                } else {
                    toast.success('이미 존재하는 태그입니다.')
                }

                // 태그 생성 후 바로 스니펫에 추가
                await addTagDirectly(tag.id)
            } else {
                toast.error(data.error || '태그 생성 중 오류가 발생했습니다.')
            }
        } catch (error) {
            console.error('태그 생성 중 오류:', error)
            toast.error('태그 생성 중 오류가 발생했습니다.')
        } finally {
            setIsCreatingTag(false)
        }
    }

    // 태그 제거
    const removeTag = async (relationId: string) => {
        try {
            const response = await fetch(`/api/snippet-tag-relations?id=${relationId}`, {
                method: 'DELETE',
            })

            if (response.ok) {
                setTags(prev => prev.filter(tag => tag.relation_id !== relationId))
                toast.success('태그가 제거되었습니다.')
            } else {
                const data = await response.json()
                toast.error(data.error || '태그 제거 중 오류가 발생했습니다.')
            }
        } catch (error) {
            console.error('태그 제거 중 오류:', error)
            toast.error('태그 제거 중 오류가 발생했습니다.')
        }
    }

    // 초기 데이터 로드
    useEffect(() => {
        if (id) {
            fetchSnippet()
            fetchSnippetTags()
            fetchAvailableTags()
        }
    }, [id])

    if (isLoading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-[#F3F5FD]">
                <div className="flex flex-col items-center">
                    <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="mt-2 text-gray-600">스니펫을 불러오는 중...</p>
                </div>
            </div>
        )
    }

    // 사용 가능한 태그 필터링 (이미 추가된 태그 제외)
    const filteredAvailableTags = availableTags.filter(
        tag => !tags.some(t => t.id === tag.id)
    )

    return (
        <div className="min-h-screen bg-[#F3F5FD] py-8">
            <div className="max-w-2xl mx-auto px-4">
                <div className="flex items-center mb-6">
                    <button
                        className="flex items-center text-gray-600 hover:text-purple-600 transition-colors"
                        onClick={() => router.push('/?tab=snippets')}
                    >
                        <ArrowLeft size={18} className="mr-1" />
                        <span>돌아가기</span>
                    </button>
                    <h1 className="text-2xl font-bold ml-4 text-gray-800">스니펫 편집</h1>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                헤더 텍스트
                            </label>
                            <input
                                type="text"
                                value={headerText}
                                onChange={(e) => setHeaderText(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                스니펫 타입
                            </label>
                            <select
                                value={snippetType}
                                onChange={(e) => setSnippetType(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                required
                            >
                                <option value="" disabled>선택하세요</option>
                                <option value="summary">요약</option>
                                <option value="question">질문</option>
                                <option value="explanation">설명</option>
                                <option value="custom">커스텀</option>
                            </select>
                        </div>

                        {snippetType === 'custom' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    커스텀 쿼리
                                </label>
                                <input
                                    type="text"
                                    value={customQuery}
                                    onChange={(e) => setCustomQuery(e.target.value)}
                                    placeholder="예: 이 내용의 핵심 아이디어는 무엇인가요?"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    required
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                마크다운 내용
                            </label>
                            <textarea
                                value={markdownContent}
                                onChange={(e) => setMarkdownContent(e.target.value)}
                                rows={8}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                required
                            />
                        </div>

                        <button
                            onClick={updateSnippet}
                            disabled={isSaving}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center"
                        >
                            {isSaving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                    저장 중...
                                </>
                            ) : (
                                <>
                                    <Save size={16} className="mr-2" />
                                    변경사항 저장
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h2 className="text-lg font-medium text-gray-800 mb-4">태그 관리</h2>

                    <div className="flex flex-wrap gap-2 mb-4">
                        {tags.length > 0 ? (
                            tags.map(tag => (
                                <div
                                    key={tag.relation_id}
                                    className="flex items-center bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-sm"
                                >
                                    <TagIcon size={12} className="mr-1" />
                                    <span>{tag.name}</span>
                                    <button
                                        onClick={() => removeTag(tag.relation_id)}
                                        className="ml-1 text-purple-600 hover:text-purple-800"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))
                        ) : (
                            <p className="text-gray-500 text-sm">아직 태그가 없습니다. 아래에서 태그를 추가해보세요.</p>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                태그 선택
                            </label>
                            <div className="flex space-x-2">
                                <select
                                    value={selectedTagId}
                                    onChange={(e) => setSelectedTagId(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    disabled={filteredAvailableTags.length === 0}
                                >
                                    <option value="">태그를 선택하세요</option>
                                    {filteredAvailableTags.map(tag => (
                                        <option key={tag.id} value={tag.id}>{tag.name}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={addTag}
                                    disabled={!selectedTagId || isAddingTag}
                                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md transition-colors disabled:bg-purple-300"
                                >
                                    {isAddingTag ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <Plus size={16} />
                                    )}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                새 태그 생성
                            </label>
                            <div className="flex space-x-2">
                                <input
                                    type="text"
                                    placeholder="새 태그 이름"
                                    value={newTagName}
                                    onChange={(e) => setNewTagName(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                <button
                                    onClick={createTag}
                                    disabled={!newTagName.trim() || isCreatingTag}
                                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors disabled:bg-gray-300"
                                >
                                    {isCreatingTag ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <Plus size={16} />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
