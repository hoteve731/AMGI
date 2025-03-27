'use client'

import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'

interface InputSheetProps {
    isOpen: boolean
    onClose: () => void
}

export default function InputSheet({ isOpen, onClose }: InputSheetProps) {
    const [text, setText] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async () => {
        if (!text.trim() || isSubmitting) return

        try {
            setIsSubmitting(true)
            // TODO: API 호출 구현
            onClose()
        } catch (error) {
            console.error('Failed to process text:', error)
        } finally {
            setIsSubmitting(false)
            setText('')
        }
    }

    return (
        <Transition.Root show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-in-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in-out duration-300"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black bg-opacity-40 transition-opacity" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-hidden">
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="pointer-events-none fixed inset-x-0 bottom-0 flex max-h-[85vh] transform transition-all">
                            <Transition.Child
                                as={Fragment}
                                enter="transform transition ease-in-out duration-300"
                                enterFrom="translate-y-full"
                                enterTo="translate-y-0"
                                leave="transform transition ease-in-out duration-300"
                                leaveFrom="translate-y-0"
                                leaveTo="translate-y-full"
                            >
                                <Dialog.Panel className="pointer-events-auto w-full h-full bg-white rounded-t-xl overflow-hidden">
                                    <div className="flex flex-col h-full">
                                        {/* 드래그 핸들 */}
                                        <div className="w-full pt-4 pb-2 flex justify-center">
                                            <div className="w-10 h-1 bg-gray-300 rounded-full" />
                                        </div>

                                        {/* 텍스트 영역 */}
                                        <div className="flex-1 px-4 overflow-auto">
                                            <textarea
                                                value={text}
                                                onChange={(e) => setText(e.target.value)}
                                                placeholder="머릿속에 넣고 싶은 아이디어를 붙여넣으세요"
                                                className="w-full h-[calc(100%-2rem)] resize-none border border-gray-200 rounded-lg p-4 text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-[#DDCFFD] focus:border-[#DDCFFD] sm:text-sm sm:leading-6"
                                            />
                                        </div>

                                        {/* 하단 버튼 */}
                                        <div className="flex-shrink-0 p-4">
                                            <button
                                                type="button"
                                                className="w-full rounded-lg bg-[#DDCFFD] px-3.5 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                onClick={handleSubmit}
                                                disabled={!text.trim() || isSubmitting}
                                            >
                                                {isSubmitting ? '변환 중...' : '변환하기'}
                                            </button>
                                        </div>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    )
} 