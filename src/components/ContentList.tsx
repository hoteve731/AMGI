'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useSWRConfig } from 'swr'


type Content = {
    id: string
    title: string
    created_at: string
    status: 'studying' | 'completed' | 'paused'
    chunks: Array<{ summary: string }>
}

const tabs = [
    { id: 'all', label: 'All' },
    { id: 'studying', label: 'Looping' },
    { id: 'completed', label: 'Completed' },
    { id: 'paused', label: 'Paused' },
]

const statusStyles = {
    studying: {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        dot: 'bg-blue-500',
        label: '진행 중'
    },
    completed: {
        bg: 'bg-green-100',
        text: 'text-green-700',
        dot: 'bg-green-500',
        label: '완료'
    },
    paused: {
        bg: 'bg-gray-100',
        text: 'text-gray-700',
        dot: 'bg-gray-500',
        label: '시작 전'
    }
}

export default function ContentList({ contents: initialContents }: { contents: Content[] }) {
    const [activeTab, setActiveTab] = useState('all')
    const [contents, setContents] = useState(initialContents)
    const supabase = createClientComponentClient()
    const { mutate } = useSWRConfig()


    const filteredContents = activeTab === 'all'
        ? contents
        : contents.filter(content => content.status === activeTab)

        const handleStatusChange = async (contentId: string, newStatus: Content['status']) => {
            try {
                // Use the API endpoint instead of direct Supabase call
                const response = await fetch('/api/contents', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        id: contentId,
                        status: newStatus
                    }),
                });
        
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || '상태 업데이트 중 오류가 발생했습니다');
                }
        
                // Update the local state
                setContents(prevContents =>
                    prevContents.map(content =>
                        content.id === contentId
                            ? { ...content, status: newStatus }
                            : content
                    )
                );
                
                // Trigger a global refresh of the content data
                mutate('/api/contents');
            } catch (error) {
                console.error('Error updating status:', error);
                alert('상태 업데이트 중 오류가 발생했습니다.');
        
                const originalContent = contents.find(c => c.id === contentId);
                if (originalContent) {
                    const selectElement = document.querySelector(`select[data-content-id="${contentId}"]`) as HTMLSelectElement;
                    if (selectElement) {
                        selectElement.value = originalContent.status;
                    }
                }
            }
        };

    return (
        <div className="flex flex-col h-full">
            <div className="flex overflow-x-auto border-b mb-4">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 whitespace-nowrap ${activeTab === tab.id
                            ? 'text-gray-900 border-b-2 border-gray-900'
                            : 'text-gray-500'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 relative">
                <div className="space-y-5 relative perspective-1000">
                    {filteredContents.map((content, index) => (
                        <div
                            key={content.id}
                            className="block relative transition-all duration-300 transform-style-preserve-3d hover:scale-[1.02]"
                            style={{
                                transform: `
                                    translateY(${index * -2}px)
                                    translateZ(${-index * 4}px)
                                    rotateX(${5 + index * 2}deg)
                                `,
                                zIndex: filteredContents.length - index,
                            }}
                        >
                            <div className="
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
                                <div className="flex items-center justify-between">
                                    <Link
                                        href={`/content/${content.id}`}
                                        className="flex-1"
                                    >
                                        <h2 className="text-lg font-medium text-gray-800 hover:text-blue-600 transition-colors">
                                            {content.title}
                                        </h2>
                                    </Link>
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                    <div className="flex items-center gap-3 text-sm text-gray-500">
                                        <div className="flex items-center gap-1">
                                            <svg
                                                className="w-4 h-4"
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
                                            <span className="text-gray-600 font-medium">{content.chunks.length}</span>
                                        </div>
                                        <div>
                                            {new Date(content.created_at).toLocaleDateString('ko-KR')} 암기 시작
                                        </div>
                                    </div>
                                    <div className="relative inline-block">
                                        <select
                                            data-content-id={content.id}
                                            value={content.status}
                                            onChange={(e) => handleStatusChange(content.id, e.target.value as Content['status'])}
                                            className={`
                                                appearance-none
                                                pl-7 pr-4 py-1.5
                                                rounded-full
                                                text-sm
                                                font-medium
                                                ${statusStyles[content.status].bg}
                                                ${statusStyles[content.status].text}
                                                transition-colors
                                                border-0
                                                focus:outline-none
                                                focus:ring-2
                                                focus:ring-offset-2
                                                focus:ring-blue-500
                                                whitespace-nowrap
                                            `}
                                        >
                                            <option value="studying">진행 중</option>
                                            <option value="completed">완료</option>
                                            <option value="paused">시작 전</option>
                                        </select>
                                        <div
                                            className={`
                                                absolute 
                                                left-3 
                                                top-1/2 
                                                -translate-y-1/2 
                                                w-2 
                                                h-2 
                                                rounded-full 
                                                ${statusStyles[content.status].dot}
                                            `}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
} 