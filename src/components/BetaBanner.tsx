'use client'

import React, { useState } from 'react'
import FeedbackModal from './FeedbackModal'

export default function BetaBanner() {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)

  return (
    <>
      {/* 베타 공지 배너 */}
      <div className="px-4 pt-4 pb-1">
        <div className="bg-gray-100 rounded-2xl p-4 border-2" style={{ minHeight: '80px', borderColor: '#5F4BB6' }}>
          <div className="flex flex-col h-full">
            <div className="mb-3">
              <h3 className="font-bold text-xl text-gray-800">🚀 함께 만들어가는 Loopa</h3>
              <p className="text-base text-gray-600 mt-2">
              Loopa는 지금 베타 테스트 중입니다! 예상치 못한 오류나 불편한 점이 있다면 자유롭게 알려주세요.
              </p>
            </div>
            <div className="mt-auto">
              <button 
                onClick={() => setShowFeedbackModal(true)}
                className="text-sm text-[#7969F7] font-semibold flex items-center hover:text-[#5F4BB6] transition-colors"
              >
                피드백 보내기 
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
