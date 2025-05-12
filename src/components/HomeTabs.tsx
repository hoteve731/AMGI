'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import ContentList from './ContentList'
import SnippetList from './SnippetList'
import { motion } from 'framer-motion'

export default function HomeTabs() {
    const searchParams = useSearchParams()
    const [activeTab, setActiveTab] = useState('notes')
    const [isVisible, setIsVisible] = useState(false)
    
    // 컴포넌트가 마운트된 후 애니메이션 시작
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsVisible(true)
        }, 100)
        
        return () => clearTimeout(timer)
    }, [])
    
    // URL 쿼리 파라미터에서 tab 값을 확인하여 초기 탭 설정
    useEffect(() => {
        const tabParam = searchParams.get('tab')
        if (tabParam === 'snippets') {
            setActiveTab('snippets')
        }
    }, [searchParams])
    
    // 애니메이션 변수 설정
    const containerVariants = {
        hidden: { opacity: 0, y: 15 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                duration: 0.4,
                ease: "easeOut"
            }
        }
    }

    return (
        <>
            {/* 탭 네비게이션 */}
            <motion.div 
                className="px-4 mt-12"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 15 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
            >
                <div className="relative flex w-full">
                    <div className="relative flex w-full justify-between bg-white/70 backdrop-blur-xl rounded-full p-1 [box-shadow:0_1px_4px_rgba(0,0,0,0.05)] ring-1 ring-gray-200/70 ring-inset">
                        {[
                            { id: 'notes', label: 'My Notes' },
                            { id: 'snippets', label: 'My Snippets' }
                        ].map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <div key={tab.id} className="relative z-10 flex-1">
                                    {isActive && (
                                        <motion.div
                                            layoutId="activeTabBackground"
                                            className="absolute inset-0 bg-[#7969F7] rounded-full"
                                            transition={{
                                                type: "spring",
                                                stiffness: 500,
                                                damping: 30
                                            }}
                                        />
                                    )}
                                    <button
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`
                                            relative z-20
                                            w-full py-2 px-1
                                            text-base
                                            transition-colors duration-200
                                            ${isActive
                                                ? 'text-white font-bold'
                                                : 'text-gray-500 hover:text-gray-700 font-medium'}
                                        `}
                                    >
                                        {tab.label}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </motion.div>

            {/* 탭 컨텐츠 */}
            <motion.div 
                className="flex-1 overflow-hidden"
                variants={containerVariants}
                initial="hidden"
                animate={isVisible ? "visible" : "hidden"}
                transition={{ delay: 0.2 }}
            >
                {activeTab === 'notes' ? <ContentList /> : <SnippetList />}
            </motion.div>
        </>
    )
}
