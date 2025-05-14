'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { SparklesIcon } from "@heroicons/react/24/solid"
import { useState, useEffect } from 'react'
import { getUserSubscriptionStatus, redirectToCheckout } from '@/utils/subscription'

interface SubscriptionModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SubscriptionModal({ isOpen, onClose }: SubscriptionModalProps) {
  const [contentCount, setContentCount] = useState<number | undefined>(0)
  const [contentLimit, setContentLimit] = useState<number | undefined>(5)
  const [isLoading, setIsLoading] = useState(false)

  // Load subscription data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadSubscriptionData()
    }
  }, [isOpen])

  // Function to load subscription data
  const loadSubscriptionData = async () => {
    try {
      const { contentCount, contentLimit } = await getUserSubscriptionStatus()
      setContentCount(contentCount)
      setContentLimit(contentLimit)
    } catch (error) {
      console.error('Error loading subscription data:', error)
    }
  }

  // Function to handle subscription checkout
  const handleSubscription = async () => {
    setIsLoading(true)
    try {
      await redirectToCheckout()
      onClose() // Close the modal after opening checkout
    } catch (error) {
      console.error('Error redirecting to checkout:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-[10000]"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
            className="w-[90%] max-w-md bg-white/95 backdrop-filter backdrop-blur-md rounded-2xl p-6 shadow-2xl z-[10001] overflow-hidden border border-white/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-3 right-3">
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" /></svg>
              </button>
            </div>

            <div className="text-center mb-6">
              <div className="flex justify-center">
                <div className="bg-[#F6F3FF] p-3 rounded-full">
                  <SparklesIcon className="w-8 h-8 text-[#7969F7]" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-900">Get Unlimited notes</h3>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-[#F6F3FF] rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#7969F7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">🚀 Unlimited notes</p>
                  <p className="text-sm text-gray-600">
                  Create as many notes as you want
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-[#F6F3FF] rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#7969F7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">✏️ Unlimited text characters</p>
                  <p className="text-sm text-gray-600">More characters, more details</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-[#F6F3FF] rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#7969F7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">🖼️ Image/PDF upload support</p>
                  <p className="text-sm text-gray-600">Upload images and PDF to convert into notes/flashcards</p>
                </div>
              </div>
            </div>

            <button
              className="w-full py-3 bg-gradient-to-r from-[#7969F7] to-[#9F94F8] text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 active:scale-[0.98] relative"
              onClick={handleSubscription}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="opacity-0">Upgrade to Premium</span>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                </>
              ) : (
                "Upgrade to Premium"
              )}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
