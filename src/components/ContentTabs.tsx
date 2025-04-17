// src/components/ContentTabs.tsx
'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import ContentList from '@/components/ContentList'
import { motion, AnimatePresence } from 'framer-motion'

// Content 타입 정의
type Content = {
  id: string
  title: string
  created_at: string
  status: 'studying' | 'completed' | 'paused'
  groups_count?: number
}

const fetcher = async (url: string) => {
  try {
    const response = await fetch(url, {
      credentials: 'include'
    });

    if (response.status === 401) {
      console.log('Session expired, attempting to refresh...');

      // 세션 갱신 시도
      const refreshResponse = await fetch('/auth/session', {
        method: 'GET',
        credentials: 'include',
      });

      if (refreshResponse.ok) {
        // 원래 요청 한 번 더 시도
        const retryResponse = await fetch(url, {
          credentials: 'include'
        });

        if (!retryResponse.ok) {
          throw new Error(`Failed to fetch contents: ${retryResponse.status}`);
        }

        return retryResponse.json();
      }
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch contents: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

const tabs = [
  { id: 'all', label: '전체' },
  { id: 'studying', label: '반복 중' },
  { id: 'completed', label: '완료' },
  { id: 'paused', label: '일시중지' },
]

export default function ContentTabs() {
  const [activeTab, setActiveTab] = useState('all')

  // Use SWR for data fetching with automatic revalidation
  const { data, error, isLoading, mutate } = useSWR<{ contents: Content[] }>('/api/contents', fetcher, {
    refreshInterval: 0,  // Don't poll automatically
    revalidateOnFocus: true,  // Revalidate when window gets focus
    revalidateOnReconnect: true,  // Revalidate when browser regains connection
    dedupingInterval: 5000, // 5초 내에 중복 요청 방지
  })

  // Add an effect to refresh data when the component mounts or becomes visible
  useEffect(() => {
    // 마지막 새로고침 시간을 추적
    let lastRefreshTime = 0;

    // Function to handle visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        // 마지막 새로고침 후 최소 2초가 지났는지 확인 (너무 빈번한 새로고침 방지)
        if (now - lastRefreshTime > 2000) {
          lastRefreshTime = now;
          mutate(); // Refresh data when page becomes visible
        }
      }
    };

    // Function to handle focus event
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastRefreshTime > 2000) {
        lastRefreshTime = now;
        mutate(); // Refresh data when window gets focus
      }
    };

    // 페이지 로드/새로고침 시 자동 새로고침
    const handleLoad = () => {
      lastRefreshTime = Date.now();
      mutate();
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('load', handleLoad);

    // Also refresh on initial mount
    lastRefreshTime = Date.now();
    mutate();

    // Clean up event listeners
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('load', handleLoad);
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
    : (data?.contents || []).filter((content: Content) => content.status === activeTab)

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 sticky top-0 z-10">
        <div className="relative flex justify-center max-w-md mx-auto">
          {/* Tabs */}
          <div className="relative flex w-full justify-between bg-white/80 backdrop-blur-md rounded-full p-1">
            {tabs.map((tab) => {
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
                      text-sm
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
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.2,
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
