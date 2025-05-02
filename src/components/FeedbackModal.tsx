'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { ChatBubbleOvalLeftEllipsisIcon, XMarkIcon } from '@heroicons/react/24/outline';

type FeedbackModalProps = {
  isOpen: boolean
  onClose: () => void
}

export default function FeedbackModal({
  isOpen,
  onClose
}: FeedbackModalProps) {
  // 실제 모달 표시 상태를 관리하는 상태 추가
  const [isVisible, setIsVisible] = useState(isOpen)
  const [feedback, setFeedback] = useState('');
  const [isSending, setIsSending] = useState(false);

  // isOpen prop이 변경될 때 isVisible 상태 업데이트
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
    }
  }, [isOpen])

  // 모달 닫기 함수 - 애니메이션 후 onClose 호출
  const handleClose = () => {
    setIsVisible(false)
    // 애니메이션 시간(0.3초) 후에 실제 onClose 호출
    setTimeout(() => {
      onClose()
    }, 300)
  }

  // 이메일 문의 처리
  const handleSendInquiryEmail = () => {
    const emailAddress = 'loopa.service@gmail.com';
    const subject = '[LOOPA] Feedback Request';
    const body = 'Write your feedback here:\n\n';

    window.location.href = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    handleClose(); // 애니메이션과 함께 모달 닫기
  };

  // 카카오톡 채팅하기
  const handleKakaoChat = () => {
    window.open('https://open.kakao.com/me/Loopa', '_blank');
    handleClose(); // 애니메이션과 함께 모달 닫기
  };

  // 피드백 전송 처리
  const handleSendFeedback = async () => {
    if (!feedback.trim()) return;
    setIsSending(true);
    try {
      const res = await fetch('/api/notifications/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'feedback', data: { feedback } }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Slack 알림 전송 실패');
      }
      handleClose();
    } catch (error) {
      console.error('피드백 전송 오류:', error);
      alert('피드백 전송에 실패했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  // document 객체를 클라이언트 사이드에서만 사용하기 위한 상태 추가
  const [isMounted, setIsMounted] = useState(false)

  // 컴포넌트가 마운트된 후에만 포털 사용
  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  // 모달 컨텐츠 정의
  const modalContent = (
    <AnimatePresence mode="wait">
      {(isOpen || isVisible) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={handleClose}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex justify-between items-center p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h3 className="text-lg font-semibold text-black flex items-center gap-1.5">
                🚀 Send Feedback
              </h3>
              <button
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-700"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <p className="text-gray-600 mb-4">
                Send us your feedback or inquiries about any errors that occurred.
              </p>

              <div className="mb-4">
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Write your feedback..."
                  className="w-full h-24 p-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                  disabled={isSending}
                />
              </div>
              <div className="mb-4">
                <button
                  onClick={handleSendFeedback}
                  disabled={isSending || !feedback.trim()}
                  className="w-full bg-[#5f4bb6] text-white py-2 px-4 rounded-lg disabled:opacity-50"
                >
                  {isSending ? 'Sending...' : 'Send Feedback'}
                </button>
              </div>

              <div className="flex gap-3 mb-2">
                <button
                  onClick={handleSendInquiryEmail}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-gray-50 border border-gray-300 text-gray-700 py-2.5 px-3 rounded-lg font-medium hover:bg-gray-100 transition-all duration-200 active:scale-[0.98]"
                >
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm">Email</span>
                </button>
                <button
                  onClick={handleKakaoChat}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-gray-50 border border-gray-300 text-gray-700 py-2.5 px-3 rounded-lg font-medium hover:bg-gray-100 transition-all duration-200 active:scale-[0.98]"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3C6.5 3 2 6.5 2 11c0 2.9 1.9 5.4 4.7 6.9.2.1.3.3.3.5 0 .2-.1.3-.1.5-.1.3-.3 1.1-.4 1.3 0 0 0 .1-.1.1v.1c0 .1 0 .1.1.1h.1c.1 0 1.2-.4 1.9-.7.3-.1.4-.1.6-.2.3.1.7.1 1 .1 5.5 0 10-3.5 10-8 0-4.5-4.5-8-10-8z" />
                  </svg>
                  <span className="text-sm">KakaoTalk</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // 클라이언트 사이드에서만 createPortal 사용
  return isMounted ? createPortal(modalContent, document.body) : null
}
