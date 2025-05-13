'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import useSWR, { mutate } from 'swr'
import WebLinkModal from './WebLinkModal'
import UploadTextModal from './UploadTextModal'
import SubscriptionModal from './SubscriptionModal'
// import RecordAudioModal from './RecordAudioModal'
import UploadAudioModal from './UploadAudioModal'

// fetcher 함수 정의
const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('API 요청 실패')
  return res.json()
}

interface ShortcutButtonsProps {
  userName?: string
}

export default function ShortcutButtons({ userName }: ShortcutButtonsProps) {
  const [showComingSoonModal, setShowComingSoonModal] = useState(false)
  const [modalFeature, setModalFeature] = useState('')
  const [mounted, setMounted] = useState(false)
  const [showWebLinkModal, setShowWebLinkModal] = useState(false)
  const [showUploadTextModal, setShowUploadTextModal] = useState(false)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  // const [showRecordAudioModal, setShowRecordAudioModal] = useState(false)
  const [showUploadAudioModal, setShowUploadAudioModal] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  
  // SWR을 사용하여 콘텐츠 개수 가져오기
  const { data, error, isValidating } = useSWR('/api/contents', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10000, // 10초 동안 중복 요청 방지
    revalidateIfStale: false,
    revalidateOnReconnect: false
  })
  
  // 콘텐츠 개수 계산 (API 응답이 없으면 0)
  const contentCount = data?.contents?.length || 0

  // Animation variants for the container
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        when: "beforeChildren",
        staggerChildren: 0.1,
        duration: 0.3
      }
    }
  }

  // Animation variants for each button
  const buttonVariants = {
    hidden: { opacity: 0, y: 0 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: "easeOut"
      }
    }
  }

  // 콘텐츠 개수 데이터 갱신 함수
  const refreshContentCount = () => {
    console.log('Refreshing content count...')
    mutate('/api/contents')
  }
  
  // 디버깅을 위한 로그
  useEffect(() => {
    console.log('Content count:', contentCount)
    console.log('Is validating:', isValidating)
    if (error) console.error('Error fetching content count:', error)
  }, [contentCount, error, isValidating])

  // Function to get the image path based on the feature name
  const getFeatureImagePath = (featureName: string): string => {
    switch (featureName) {
      case 'Upload PDF':
        return '/images/loopapdf.png'
      case 'Web link':
        return '/images/loopalink.png'
      case 'Make visual map':
        return '/images/loopamap.png'
      case 'Record Record':
        return '/images/looparecord.png'
      case 'Upload Audio':
        return '/images/loopaaudio.png'
      default:
        return '/images/loopadocs.png'
    }
  }

  // Set mounted state to true when component mounts
  useEffect(() => {
    setMounted(true)
    // Trigger animation after a small delay for better visual effect
    setTimeout(() => setIsVisible(true), 100)
    return () => {
      setMounted(false)
      setIsVisible(false)
    }
  }, [])

  // 콘텐츠 제한 확인 함수 (API 호출 없이 즉시 결과 반환)
  const checkContentLimit = () => {
    if (isValidating) return true // 데이터 가져오는 중이면 중복 실행 방지

    if (contentCount >= 3) {
      setShowSubscriptionModal(true)
      return true // 제한 도달
    }
    return false // 제한 미도달
  }

  // Function to open the Upload Text modal
  const handleUploadText = () => {
    // 캐시된 데이터로 즉시 확인
    if (!checkContentLimit()) {
      setShowUploadTextModal(true)
    }
  }

  // Function to show the "Coming Soon" modal
  const handleComingSoonFeature = (featureName: string) => {
    setModalFeature(featureName)
    setShowComingSoonModal(true)
  }

  // Function to close the modal with animation
  const handleCloseModal = () => {
    setShowComingSoonModal(false)
  }

  // Function to handle web link click
  const handleWebLinkClick = () => {
    // 캐시된 데이터로 즉시 확인
    if (!checkContentLimit()) {
      setShowWebLinkModal(true)
    }
  }

  // Function to handle upload audio click
  const handleUploadAudioClick = () => {
    // 캐시된 데이터로 즉시 확인
    if (!checkContentLimit()) {
      setShowUploadAudioModal(true)
    }
  }

  return (
    <>
      {/* New Note section */}
      <motion.h3
        className="text-2xl font-semibold text-black mt-2 mb-4"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 15 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        New Note
      </motion.h3>

      {/* 가로 레이아웃으로 변경 (1×3) */}
      <motion.div
        className="flex flex-row w-full gap-3"
        variants={containerVariants}
        initial="hidden"
        animate={isVisible ? "visible" : "hidden"}
      >
        {/* Upload Text */}
        <motion.button
          variants={buttonVariants}
          onClick={handleUploadText}
          className="w-full flex flex-col items-center justify-center transition-transform duration-200 rounded-xl p-4"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={isValidating}
        >
          <Image
            src="/images/loopadocs.png"
            alt="Text"
            width={64}
            height={64}
            className="mb-1"
          />
          <span className="text-sm font-medium text-gray-800">Text</span>
        </motion.button>

        {/* Web link */}
        <motion.button
          variants={buttonVariants}
          onClick={handleWebLinkClick}
          className="w-full flex flex-col items-center justify-center transition-transform duration-200 rounded-xl p-4"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={isValidating}
        >
          <Image
            src="/images/loopalink.png"
            alt="Web link"
            width={64}
            height={64}
            className="mb-1"
          />
          <span className="text-sm font-medium text-gray-800">Web link</span>
        </motion.button>

        {/* Upload Audio */}
        <motion.button
          variants={buttonVariants}
          onClick={handleUploadAudioClick}
          className="w-full flex flex-col items-center justify-center transition-transform duration-200 rounded-xl p-4"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={isValidating}
        >
          <Image
            src="/images/loopaaudio.png"
            alt="Audio"
            width={64}
            height={64}
            className="mb-1"
          />
          <span className="text-sm font-medium text-gray-800">Audio</span>
        </motion.button>
      </motion.div>

      {/* Coming Soon Modal - Using Portal */}
      {mounted && createPortal(
        <AnimatePresence>
          {showComingSoonModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]"
              onClick={handleCloseModal}
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                    <Image
                      src={getFeatureImagePath(modalFeature)}
                      alt={modalFeature}
                      width={80}
                      height={80}
                    />
                  </div>
                  <h3 className="text-xl font-semibold text-[#5f4bb6] mb-2">Coming Soon!</h3>
                  <p className="text-gray-600 mb-6">
                    {modalFeature} feature is currently under development and will be available very soon.
                  </p>
                  <button
                    onClick={handleCloseModal}
                    className="w-full py-3 bg-[#5F4BB6] hover:bg-[#4A3A9F]/80 text-white font-semibold rounded-xl transition-colors duration-200"
                  >
                    Got it
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Web Link Modal */}
      <WebLinkModal
        isOpen={showWebLinkModal}
        onClose={() => {
          setShowWebLinkModal(false)
          refreshContentCount() // 모달 닫힐 때 콘텐츠 수 갱신
        }}
      />

      {/* Upload Text Modal */}
      <UploadTextModal
        isOpen={showUploadTextModal}
        onClose={() => {
          setShowUploadTextModal(false)
          refreshContentCount() // 모달 닫힐 때 콘텐츠 수 갱신
        }}
      />

      {/* Record Audio Modal - COMMENTED OUT
      <RecordAudioModal
        isOpen={showRecordAudioModal}
        onClose={() => setShowRecordAudioModal(false)}
      />
      */}

      {/* Upload Audio Modal */}
      <UploadAudioModal
        isOpen={showUploadAudioModal}
        onClose={() => {
          setShowUploadAudioModal(false)
          refreshContentCount() // 모달 닫힐 때 콘텐츠 수 갱신
        }}
      />

      {/* Subscription Modal */}
      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />
    </>
  )
}