// src/components/ContentTabs.tsx
'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import ContentList from '@/components/ContentList'

// Fetcher function for SWR
const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed to fetch contents')
  return res.json()
})

export default function ContentTabs() {
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
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500"></div>
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

  return <ContentList contents={data?.contents || []} />
}
