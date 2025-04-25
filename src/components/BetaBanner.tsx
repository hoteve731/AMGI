'use client'

import React, { useState } from 'react'
import FeedbackModal from './FeedbackModal'

export default function BetaBanner() {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)

  return (
    <>
      {/* 베타 공지 배너 */}
      <div className="px-4 pt-4 pb-1">
        <div className="bg-gray-100 rounded-2xl p-4 border-2 border-[#FDFF8C]" style={{ minHeight: '80px' }}>
          <div className="flex flex-col h-full">
            <div className="mb-3">
              <h3 className="font-bold text-xl text-gray-800">⚠️ 베타 테스트 공지</h3>
              <p className="text-base text-gray-600 mt-2">
                Loopa는 베타 테스트 중! 예상하지 못한 데이터 삭제나 각종 오류가 있을 수 있습니다. 오류 제보나 피드백은 저희에게 큰 힘이 됩니다.
              </p>
            </div>
            <div className="mt-auto">
              <button 
                onClick={() => setShowFeedbackModal(true)}
                className="text-sm text-[#7969F7] font-semibold flex items-center hover:text-[#5F4BB6] transition-colors"
              >
                오류/피드백 알려주기 
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 피드백 모달 */}
      <FeedbackModal 
        isOpen={showFeedbackModal} 
        onClose={() => setShowFeedbackModal(false)} 
      />
    </>
  )
}
