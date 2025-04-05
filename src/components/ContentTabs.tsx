// src/components/ContentTabs.tsx
'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import ContentList from '@/components/ContentList'
import { motion, AnimatePresence } from 'framer-motion'

// Fetcher function for SWR
const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed to fetch contents')
  return res.json()
})

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'studying', label: 'Looping' },
  { id: 'completed', label: 'Completed' },
  { id: 'paused', label: 'Paused' },
]

export default function ContentTabs() {
  const [activeTab, setActiveTab] = useState('all')

  // Use SWR for data fetching with automatic revalidation
  const { data, error, isLoading, mutate } = useSWR('/api/contents', fetcher, {
    refreshInterval: 0,  // Don't poll automatically
    revalidateOnFocus: true,  // Revalidate when window gets focus
    revalidateOnReconnect: true  // Revalidate when browser regains connection
  })

  // Add an effect to refresh data when the component mounts or becomes visible
  useEffect(() => {
    // Function to handle visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        mutate(); // Refresh data when page becomes visible
      }
    };

    // Function to handle focus event
    const handleFocus = () => {
      mutate(); // Refresh data when window gets focus
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Also refresh on initial mount
    mutate();

    // Clean up event listeners
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [mutate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="relative w-10 h-10">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-[#7969F7] rounded-full"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
              animate={{
                x: [
                  '0px',
                  `${Math.cos(i * (2 * Math.PI / 5)) * 16}px`,
                  '0px'
                ],
                y: [
                  '0px',
                  `${Math.sin(i * (2 * Math.PI / 5)) * 16}px`,
                  '0px'
                ],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.1,
                ease: [0.4, 0, 0.2, 1],
                times: [0, 0.5, 1]
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center p-8 text-red-500">
        <p>데이터를 불러오는 중 오류가 발생했습니다.</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
        >
          새로고침
        </button>
      </div>
    )
  }

  // Filter contents based on active tab
  const filteredContents = activeTab === 'all'
    ? data?.contents || []
    : (data?.contents || []).filter(content => content.status === activeTab)

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-[#D4C4B7]">
        <div className="relative flex justify-center max-w-md mx-auto">
          {/* Tab Background (Pill) */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-10 bg-gray-100 rounded-full"></div>
          </div>

          {/* Tabs */}
          <div className="relative flex w-full justify-between">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <div key={tab.id} className="relative z-10 flex-1">
                  {isActive && (
                    <motion.div
                      layoutId="activeTabBackground"
                      className="absolute inset-0 bg-white rounded-full shadow-sm"
                      style={{
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
                      }}
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
                      text-sm font-medium
                      transition-colors duration-200
                      ${isActive ? 'text-[#7969F7]' : 'text-gray-500 hover:text-gray-700'}
                    `}
                  >
                    {tab.label}
                    {isActive && (
                      <motion.div
                        layoutId="activeTabLine"
                        className="absolute bottom-0 left-0 right-0 mx-auto h-0.5 w-1/2 bg-[#7969F7]"
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 30
                        }}
                      />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{
              duration: 0.3,
              ease: "easeInOut"
            }}
            className="h-full"
          >
            <ContentList
              contents={filteredContents}
              showTabs={false}
              mutate={mutate}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
