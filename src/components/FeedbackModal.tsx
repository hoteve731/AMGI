'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'

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
    const emailAddress = 'fbghtks1000@gmail.com';
    const subject = '[LOOPA] 문의사항';
    const body = '안녕하세요, LOOPA 팀에게 문의드립니다.\n\n문의 내용:\n\n';

    window.location.href = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    handleClose(); // 애니메이션과 함께 모달 닫기
  };

  // 카카오톡 채팅하기
  const handleKakaoChat = () => {
    window.open('https://open.kakao.com/me/Loopa', '_blank');
    handleClose(); // 애니메이션과 함께 모달 닫기
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
              <h3 className="text-lg font-semibold flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                오류/피드백 보내기
              </h3>
              <button 
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <p className="text-gray-600 mb-4">
                아래의 방법으로 오류 제보나 피드백을 보내주세요. 베타 테스트에 참여해주셔서 감사합니다!
              </p>
              
              <div className="flex gap-3 mb-2">
                <button
                  onClick={handleSendInquiryEmail}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-gray-50 border border-gray-300 text-gray-700 py-2.5 px-3 rounded-lg font-medium hover:bg-gray-100 transition-all duration-200 active:scale-[0.98]"
                >
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm">이메일</span>
                </button>
                <button
                  onClick={handleKakaoChat}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-gray-50 border border-gray-300 text-gray-700 py-2.5 px-3 rounded-lg font-medium hover:bg-gray-100 transition-all duration-200 active:scale-[0.98]"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3C6.5 3 2 6.5 2 11c0 2.9 1.9 5.4 4.7 6.9.2.1.3.3.3.5 0 .2-.1.3-.1.5-.1.3-.3 1.1-.4 1.3 0 0 0 .1-.1.1v.1c0 .1 0 .1.1.1h.1c.1 0 1.2-.4 1.9-.7.3-.1.4-.1.6-.2.3.1.7.1 1 .1 5.5 0 10-3.5 10-8 0-4.5-4.5-8-10-8z" />
                  </svg>
                  <span className="text-sm">카카오톡</span>
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
