'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { createPortal } from 'react-dom'

interface ShortcutButtonsProps {
  userName?: string
}

export default function ShortcutButtons({ userName }: ShortcutButtonsProps) {
  const [showComingSoonModal, setShowComingSoonModal] = useState(false)
  const [modalFeature, setModalFeature] = useState('')
  const [mounted, setMounted] = useState(false)

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

  // Function to trigger the bottom sheet (same as in ReviewDashboard)
  const handleUploadText = () => {
    const event = new CustomEvent('openBottomSheet')
    window.dispatchEvent(event)
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

  return (
    <>
      {/* New Note section */}
      <h3 className="text-2xl font-semibold text-black">New Note</h3>
      <p className="text-base text-gray-600 mb-4">Master complex topics, one note at a time</p>

      {/* Grid layout for shortcut buttons */}
      <div className="grid grid-cols-2 gap-3">
        {/* Upload Text - This one actually opens the bottom sheet */}
        <button
          onClick={handleUploadText}
          className="flex flex-col items-center justify-center bg-white hover:bg-white/50 transition-colors duration-200 rounded-xl p-4"
        >
          <Image
            src="/images/loopadocs.png"
            alt="Upload text"
            width={80}
            height={80}
            className="mb-1"
          />
          <span className="text-base font-semibold text-black/70">Upload text</span>
        </button>

        {/* Upload PDF - Coming soon */}
        <button
          onClick={() => handleComingSoonFeature('Upload PDF')}
          className="flex flex-col items-center justify-center bg-white hover:bg-white/50 transition-colors duration-200 rounded-xl p-4"
        >
          <Image
            src="/images/loopapdf.png"
            alt="Upload PDF"
            width={80}
            height={80}
            className="mb-1"
          />
          <span className="text-base font-semibold text-black/70">Upload PDF</span>
        </button>

        {/* Web link - Coming soon */}
        <button
          onClick={() => handleComingSoonFeature('Web link')}
          className="flex flex-col items-center justify-center bg-white hover:bg-white/50 transition-colors duration-200 rounded-xl p-4"
        >
          <Image
            src="/images/loopalink.png"
            alt="Web link"
            width={80}
            height={80}
            className="mb-1"
          />
          <span className="text-base font-semibold text-black/70">Web link</span>
        </button>

        {/* Make visual map - Coming soon */}
        <button
          onClick={() => handleComingSoonFeature('Make visual map')}
          className="flex flex-col items-center justify-center bg-[#5f4bb6]/30 hover:bg-[#5f4bb6]/50 transition-colors duration-200 rounded-xl p-4"
        >
          <Image
            src="/images/loopamap.png"
            alt="Make visual map"
            width={80}
            height={80}
            className="mb-1"

          />
          <span className="text-base font-semibold text-white/50">Make Diagram</span>
        </button>
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
                  <h3 className="text-xl font-semibold text-[#5F4BB6] mb-2">Coming Soon!</h3>
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
    </>
  )
}