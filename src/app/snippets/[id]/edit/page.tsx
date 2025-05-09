'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Input, Select, SelectItem, Textarea, Spinner, Chip } from '@nextui-org/react'
import { Save, ArrowLeft, Tag as TagIcon, Plus, X } from 'lucide-react'
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
}

type Tag = {
    id: string
    name: string
    relation_id: string
}

export default function EditSnippetPage({ params }: { params: { id: string } }) {
    const router = useRouter()
    const { id } = params

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

                // 선택된 태그로 설정
                setSelectedTagId(tag.id)
                setNewTagName('')

                if (response.ok) {
                    toast.success('새 태그가 생성되었습니다.')
                } else {
                    toast.info('이미 존재하는 태그입니다.')
                }
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
        fetchSnippet()
        fetchSnippetTags()
        fetchAvailableTags()
    }, [id])

    if (isLoading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <Spinner size="lg" label="스니펫을 불러오는 중..." />
            </div>
        )
    }

    // 사용 가능한 태그 필터링 (이미 추가된 태그 제외)
    const filteredAvailableTags = availableTags.filter(
        tag => !tags.some(t => t.id === tag.id)
    )

    return (
        <div className="w-full max-w-4xl mx-auto p-4">
            <div className="flex items-center mb-6">
                <Button
                    variant="light"
                    startContent={<ArrowLeft size={18} />}
                    onClick={() => router.push('/snippets')}
                >
                    스니펫 목록으로
                </Button>
                <h1 className="text-2xl font-bold ml-4">스니펫 편집</h1>
            </div>

            <Card className="p-6 mb-6">
                <div className="grid grid-cols-1 gap-4">
                    <div>
                        <Input
                            label="헤더 텍스트"
                            value={headerText}
                            onChange={(e) => setHeaderText(e.target.value)}
                            isRequired
                            fullWidth
                        />
                    </div>

                    <div>
                        <Select
                            label="스니펫 타입"
                            value={snippetType}
                            onChange={(e) => setSnippetType(e.target.value)}
                            isRequired
                        >
                            <SelectItem key="summary" value="summary">요약</SelectItem>
                            <SelectItem key="question" value="question">질문</SelectItem>
                            <SelectItem key="explanation" value="explanation">설명</SelectItem>
                            <SelectItem key="custom" value="custom">커스텀</SelectItem>
                        </Select>
                    </div>

                    {snippetType === 'custom' && (
                        <div>
                            <Input
                                label="커스텀 쿼리"
                                value={customQuery}
                                onChange={(e) => setCustomQuery(e.target.value)}
                                placeholder="예: 이 내용의 핵심 아이디어는 무엇인가요?"
                                isRequired
                                fullWidth
                            />
                        </div>
                    )}

                    <div>
                        <Textarea
                            label="마크다운 내용"
                            value={markdownContent}
                            onChange={(e) => setMarkdownContent(e.target.value)}
                            minRows={8}
                            isRequired
                            fullWidth
                        />
                    </div>

                    <div>
                        <Button
                            color="primary"
                            startContent={<Save size={18} />}
                            onClick={updateSnippet}
                            isLoading={isSaving}
                            fullWidth
                        >
                            변경사항 저장
                        </Button>
                    </div>
                </div>
            </Card>

            <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">태그 관리</h2>

                <div className="flex flex-wrap gap-2 mb-4">
                    {tags.length > 0 ? (
                        tags.map(tag => (
                            <Chip
                                key={tag.relation_id}
                                onClose={() => removeTag(tag.relation_id)}
                                variant="flat"
                                color="primary"
                                startContent={<TagIcon size={14} />}
                            >
                                {tag.name}
                            </Chip>
                        ))
                    ) : (
                        <p className="text-gray-500 text-sm">아직 태그가 없습니다. 아래에서 태그를 추가해보세요.</p>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Select
                            label="태그 선택"
                            placeholder="태그를 선택하세요"
                            value={selectedTagId}
                            onChange={(e) => setSelectedTagId(e.target.value)}
                            startContent={<TagIcon size={16} />}
                            isDisabled={filteredAvailableTags.length === 0}
                        >
                            {filteredAvailableTags.map(tag => (
                                <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                            ))}
                        </Select>
                    </div>

                    <div className="flex items-end">
                        <Button
                            color="primary"
                            startContent={<Plus size={18} />}
                            onClick={addTag}
                            isLoading={isAddingTag}
                            isDisabled={!selectedTagId}
                            fullWidth
                        >
                            태그 추가
                        </Button>
                    </div>
                </div>

                <div className="mt-4">
                    <h3 className="text-md font-medium mb-2">새 태그 생성</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Input
                                placeholder="새 태그 이름"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                startContent={<TagIcon size={16} />}
                            />
                        </div>

                        <div className="flex items-end">
                            <Button
                                color="secondary"
                                startContent={<Plus size={18} />}
                                onClick={createTag}
                                isLoading={isCreatingTag}
                                isDisabled={!newTagName.trim()}
                                fullWidth
                            >
                                새 태그 생성
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    )
}
