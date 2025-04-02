'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

type Content = {
    id: string
    title: string
    created_at: string
    status: 'studying' | 'completed' | 'paused'
}

const tabs = [
    { id: 'all', label: 'All' },
    { id: 'studying', label: 'Looping' },
    { id: 'completed', label: 'Completed' },
    { id: 'paused', label: 'Paused' },
]

export default function ContentList({ contents: initialContents }: { contents: Content[] }) {
    const [activeTab, setActiveTab] = useState('all')
    const [contents, setContents] = useState(initialContents)
    const supabase = createClientComponentClient()

    const filteredContents = activeTab === 'all'
        ? contents
        : contents.filter(content => content.status === activeTab)

    const handleStatusChange = async (contentId: string, newStatus: Content['status']) => {
        try {
            const { data, error } = await supabase
                .from('contents')
                .update({ status: newStatus })
                .eq('id', contentId)
                .select()

            if (error) {
                console.error('Supabase error:', error)
                throw new Error(error.message)
            }

            if (!data || data.length === 0) {
                throw new Error('No data returned after update')
            }

            setContents(prevContents =>
                prevContents.map(content =>
                    content.id === contentId
                        ? { ...content, status: newStatus }
                        : content
                )
            )

        } catch (error) {
            console.error('Error updating status:', error)
            alert('상태 업데이트 중 오류가 발생했습니다.')

            const originalContent = contents.find(c => c.id === contentId)
            if (originalContent) {
                const selectElement = document.querySelector(`select[data-content-id="${contentId}"]`) as HTMLSelectElement
                if (selectElement) {
                    selectElement.value = originalContent.status
                }
            }
        }
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex overflow-x-auto border-b">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 whitespace-nowrap ${activeTab === tab.id
                            ? 'border-b-2 border-blue-500 text-blue-500'
                            : 'text-gray-500'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-2">
                    {filteredContents.map((content) => (
                        <div key={content.id} className="relative">
                            <Link
                                href={`/content/${content.id}`}
                                className="block p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                            >
                                <h2 className="text-lg font-medium pr-24">{content.title}</h2>
                                <div className="text-sm text-gray-500">
                                    {new Date(content.created_at).toLocaleDateString('ko-KR')} 암기 시작
                                </div>
                            </Link>
                            <select
                                data-content-id={content.id}
                                value={content.status}
                                onChange={(e) => handleStatusChange(content.id, e.target.value as Content['status'])}
                                className="absolute right-4 top-4 bg-white border rounded px-2 py-1"
                            >
                                <option value="studying">암기중</option>
                                <option value="completed">암기완료</option>
                                <option value="paused">일시중지</option>
                            </select>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
} 