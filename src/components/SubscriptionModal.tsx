'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { SparklesIcon } from "@heroicons/react/24/solid"

interface SubscriptionModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SubscriptionModal({ isOpen, onClose }: SubscriptionModalProps) {
  // Function to handle subscription email
  const handleSubscriptionEmail = () => {
    const emailAddress = 'loopa.service@gmail.com'
    const subject = 'LOOPA Subscription Request'
    const body = 'Write your subscription request here:\n\n'

    window.location.href = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    onClose() // Close the modal after sending email
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
                  <p className="text-sm text-gray-600">Create as many notes as you want</p>
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
              className="w-full py-3 bg-gradient-to-r from-[#7969F7] to-[#9F94F8] text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 active:scale-[0.98]"
              onClick={handleSubscriptionEmail}
            >
              Upgrade to Premium
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
