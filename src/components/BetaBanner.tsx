'use client'

import React, { useState } from 'react'
import FeedbackModal from './FeedbackModal'

export default function BetaBanner() {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)

  return (
    <>
      {/* 베타 공지 배너 */}
      <div className="pb-1">
        <div className="bg-white/90 p-4 backdrop-blur-sm" style={{ minHeight: '80px', borderColor: '#5F4BB6' }}>
          <div className="flex flex-col h-full">
            <div className="mb-3">
              <h3 className="font-bold text-xl text-gray-800">You're in - Thanks for joining the beta!</h3>
              <p className="text-base text-gray-500 mt-2">
              We value your every feedback and are committed to making Loopa the best possible tool for you.
              </p>
            </div>
            <div className="mt-auto">
              <button 
                onClick={() => setShowFeedbackModal(true)}
                className="text-lg text-[#7969F7] font-semibold flex items-center hover:text-[#5F4BB6] transition-colors"
              >
                💬 Send feedback
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Modal */}
      <FeedbackModal 
        isOpen={showFeedbackModal} 
        onClose={() => setShowFeedbackModal(false)} 
      />
    </>
  )
}
