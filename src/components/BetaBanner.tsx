'use client'

import React, { useState } from 'react'
import FeedbackModal from './FeedbackModal'

export default function BetaBanner() {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)

  return (
    <>
      {/* 베타 공지 배너 */}
      <div className="m-4">
        <div className="bg-[#9A8DD0]/30 px-6 py-2 backdrop-blur-sm rounded-2xl flex items-center justify-between" style={{ minHeight: '60px' }}>
          <div>
            <h3 className="font-medium text-sm text-[#5F4BB6]">Feedback makes loopa better!</h3>
          </div>
          <button
            onClick={() => setShowFeedbackModal(true)}
            className="bg-[#5F4BB6]/80 text-xs text-white px-4 py-2 rounded-xl font-semibold hover:bg-opacity-90 transition-colors"
          >
            Send
          </button>
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
