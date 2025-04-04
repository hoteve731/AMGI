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
    groups_count?: number
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
        text: 'text-blue-800',
        dot: 'bg-blue-500',
    },
    completed: {
        bg: 'bg-green-100',
        text: 'text-green-800',
        dot: 'bg-green-500',
    },
    paused: {
        bg: 'bg-gray-100',
        text: 'text-gray-800',
        dot: 'bg-gray-500',
    },
}

export default function ContentList({ contents: initialContents }: { contents: Content[] }) {
    const [contents, setContents] = useState(initialContents)
    const [activeTab, setActiveTab] = useState('all')
    const [isStatusChanging, setIsStatusChanging] = useState(false)
    const supabase = createClientComponentClient()
    const { mutate } = useSWRConfig()

    const filteredContents = activeTab === 'all'
        ? contents
        : contents.filter(content => content.status === activeTab)

    const handleStatusChange = async (contentId: string, newStatus: Content['status']) => {
        if (isStatusChanging) return

        try {
            setIsStatusChanging(true)

            // API를 통한 상태 업데이트
            const response = await fetch('/api/contents', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: contentId,
                    status: newStatus,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || '상태 업데이트 중 오류가 발생했습니다.');
            }

            // 로컬 상태 업데이트
            setContents(prevContents =>
                prevContents.map(content =>
                    content.id === contentId
                        ? { ...content, status: newStatus }
                        : content
                )
            );

            // 전역 상태 리프레시
            mutate('/api/contents');
        } catch (error) {
            console.error('상태 업데이트 중 오류:', error);
            alert(error instanceof Error ? error.message : '상태 업데이트 중 오류가 발생했습니다.');
        } finally {
            setIsStatusChanging(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-center p-4 space-x-2 bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-[#D4C4B7]">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                            px-4 py-2 
                            rounded-full 
                            text-sm 
                            font-medium 
                            transition-colors
                            ${activeTab === tab.id
                                ? 'bg-black text-white'
                                : 'bg-white/50 text-gray-600 hover:bg-white/80'
                            }
                        `}
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
                                        href={`/content/${content.id}/groups`}
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
                                            <span className="text-gray-600 font-medium">{content.groups_count || 0}</span>
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
                                            `}
                                            disabled={isStatusChanging}
                                        >
                                            <option value="studying">Looping</option>
                                            <option value="completed">Completed</option>
                                            <option value="paused">Paused</option>
                                        </select>
                                        <div
                                            className={`
                                                absolute 
                                                left-2 
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

                    {filteredContents.length === 0 && (
                        <div className="text-center py-10">
                            <p className="text-gray-500">No contents found</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}