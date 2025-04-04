'use client'

import { useState } from 'react'
import useSWR from 'swr'
import ContentList from '@/components/ContentList'
import LoadingSpinner from '@/components/LoadingSpinner'

// Fetcher function for SWR
const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed to fetch contents')
  return res.json()
})

export default function ContentTabs() {
  // Use SWR for data fetching with automatic revalidation
  const { data, error, isLoading } = useSWR('/api/contents', fetcher, {
    refreshInterval: 0,  // Don't poll automatically
    revalidateOnFocus: true,  // Revalidate when window gets focus
    revalidateOnReconnect: true  // Revalidate when browser regains connection
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
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