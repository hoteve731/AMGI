'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import ContentList from './ContentList'
import SnippetList from './SnippetList'

export default function HomeTabs() {
    const searchParams = useSearchParams()
    const [activeTab, setActiveTab] = useState('notes')

    // URL 쿼리 파라미터에서 tab 값을 확인하여 초기 탭 설정
    useEffect(() => {
        const tabParam = searchParams.get('tab')
        if (tabParam === 'snippets') {
            setActiveTab('snippets')
        }
    }, [searchParams])

    return (
        <>
            {/* 탭 네비게이션 */}
            <div className="px-5 pt-10 flex space-x-4 border-b">
                <button
                    className={`pb-2 px-1 font-medium text-lg ${activeTab === 'notes'
                            ? 'text-purple-600 border-b-2 border-purple-600'
                            : 'text-gray-500 hover:text-purple-600'
                        }`}
                    onClick={() => setActiveTab('notes')}
                >
                    My Notes
                </button>
                <button
                    className={`pb-2 px-1 font-medium text-lg ${activeTab === 'snippets'
                            ? 'text-purple-600 border-b-2 border-purple-600'
                            : 'text-gray-500 hover:text-purple-600'
                        }`}
                    onClick={() => setActiveTab('snippets')}
                >
                    My Snippets
                </button>
            </div>

            {/* 탭 컨텐츠 */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'notes' ? <ContentList /> : <SnippetList />}
            </div>
        </>
    )
}
