'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import WebLinkModal from './WebLinkModal'
import UploadTextModal from './UploadTextModal'
import SubscriptionModal from './SubscriptionModal'

interface BottomSheetShortcutsProps {
  onClose?: () => void
}

export default function BottomSheetShortcuts({ onClose }: BottomSheetShortcutsProps) {
  const [showComingSoonModal, setShowComingSoonModal] = useState(false)
  const [modalFeature, setModalFeature] = useState('')
  const [mounted, setMounted] = useState(false)
  const [showWebLinkModal, setShowWebLinkModal] = useState(false)
  const [showUploadTextModal, setShowUploadTextModal] = useState(false)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [contentCount, setContentCount] = useState(0)

  // Fetch content count when component mounts
  useEffect(() => {
    fetchContentCount()
  }, [])

  // Function to fetch content count
  const fetchContentCount = async () => {
    try {
      const response = await fetch('/api/contents')
      if (response.ok) {
        const data = await response.json()
        const count = data.contents?.length || 0
        setContentCount(count)
        console.log('Content count in BottomSheetShortcuts:', count)
      }
    } catch (error) {
      console.error('Error fetching content count:', error)
    }
  }

  // Function to get the image path based on the feature name
  const getFeatureImagePath = (featureName: string): string => {
    switch (featureName) {
      case 'Upload PDF':
        return '/images/loopapdf.png'
      case 'Web link':
        return '/images/loopalink.png'
      case 'Make visual map':
        return '/images/loopamap.png'
      default:
        return '/images/loopadocs.png'
    }
  }

  // Set mounted state to true when component mounts
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Function to open the Upload Text modal
  const handleUploadText = () => {
    // Check if user has reached the free limit
    if (contentCount >= 3) {
      setShowSubscriptionModal(true)
    } else {
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

  // Function to open the Web Link modal
  const handleWebLinkClick = () => {
    // Check if user has reached the free limit
    if (contentCount >= 3) {
      setShowSubscriptionModal(true)
    } else {
      setShowWebLinkModal(true)
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 w-full p-1">
        {/* Upload Text */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={handleUploadText}
          className="flex items-center gap-4 w-full bg-[#F3F5FD] rounded-xl p-6"
        >
          <Image
            src="/images/loopadocs.png"
            alt="Upload text"
            width={40}
            height={40}
            className="flex-shrink-0"
          />
          <span className="text-xl font-semibold text-black/80">Upload text</span>
        </motion.button>

        {/* Upload PDF */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => handleComingSoonFeature('Upload PDF')}
          className="flex items-center gap-4 w-full bg-[#F3F5FD] rounded-xl p-6"
        >
          <Image
            src="/images/loopapdf.png"
            alt="Upload PDF"
            width={40}
            height={40}
            className="flex-shrink-0"
          />
          <span className="text-xl font-semibold text-black">Upload PDF</span>
        </motion.button>

        {/* Web link */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={handleWebLinkClick}
          className="flex items-center gap-4 w-full bg-[#F3F5FD] rounded-xl p-6"
        >
          <Image
            src="/images/loopalink.png"
            alt="Web link"
            width={40}
            height={40}
            className="flex-shrink-0"
          />
          <span className="text-xl font-semibold text-black">Web link</span>
        </motion.button>

        {/* Make visual map */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => handleComingSoonFeature('Make visual map')}
          className="flex items-center gap-4 w-full bg-[#F3F5FD] rounded-xl p-6"
        >
          <Image
            src="/images/loopamap.png"
            alt="Make visual map"
            width={40}
            height={40}
            className="flex-shrink-0"
          />
          <span className="text-xl font-semibold text-black">Make Diagram</span>
        </motion.button>
      </div>

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
              onClick={() => {
                handleCloseModal();
                onClose?.(); // Close the bottom sheet when the modal is closed
              }}
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
                  <h3 className="text-xl font-semibold text-[#5F4BB6] mb-2">Coming Soon!</h3>
                  <p className="text-gray-600 mb-6">
                    {modalFeature} feature is currently under development and will be available very soon.
                  </p>
                  <button
                    onClick={() => {
                      handleCloseModal();
                      onClose?.(); // Close the bottom sheet when the modal is closed
                    }}
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
      {mounted && createPortal(
        <WebLinkModal
          isOpen={showWebLinkModal}
          onClose={() => {
            setShowWebLinkModal(false);
            onClose?.(); // Close the bottom sheet when the modal is closed
          }}
        />,
        document.body
      )}

      {/* Upload Text Modal */}
      {mounted && createPortal(
        <UploadTextModal
          isOpen={showUploadTextModal}
          onClose={() => {
            setShowUploadTextModal(false);
            onClose?.(); // Close the bottom sheet when the modal is closed
          }}
        />,
        document.body
      )}

      {/* Subscription Modal */}
      {mounted && createPortal(
        <SubscriptionModal
          isOpen={showSubscriptionModal}
          onClose={() => {
            setShowSubscriptionModal(false);
            onClose?.(); // Close the bottom sheet when the modal is closed
          }}
        />,
        document.body
      )}
    </>
  )
}
