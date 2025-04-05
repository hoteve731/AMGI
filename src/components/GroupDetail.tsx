'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import LoadingOverlay from './LoadingOverlay'
import { motion, AnimatePresence } from 'framer-motion'

type Chunk = {
    id: string
    summary: string
    masked_text: string
}

type Group = {
    id: string
    title: string
    original_text: string
    chunks: Chunk[]
}

type Content = {
    id: string
    title: string
}

type GroupDetailProps = {
    content: Content
    group: Group
}

export default function GroupDetail({ content, group }: GroupDetailProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [showOriginalText, setShowOriginalText] = useState(false)

    const handleChunkClick = (chunkId: string) => {
        setIsLoading(true)
        router.push(`/content/${content.id}/learning?chunk=${chunkId}`)
    }

    const toggleOriginalText = () => {
        setShowOriginalText(!showOriginalText)
    }

    return (
        <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
            {isLoading && <LoadingOverlay />}
            <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] h-12 z-50">
                <button
                    onClick={() => router.back()}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <button
                    onClick={() => router.back()}
                    className="absolute left-10 top-1/2 -translate-y-1/2 text-gray-800 font-medium hover:text-gray-600"
                >
                    모든 그룹
                </button>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4">
                <div className={`mb-8 ${showOriginalText ? 'space-y-0' : 'space-y-4'}`}>
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">{group.title}</h2>

                    <div className="flex flex-col">
                        <button
                            onClick={toggleOriginalText}
                            className={`w-full bg-white/60 backdrop-blur-md rounded-xl p-4 flex items-center justify-between border border-white/20 ${showOriginalText ? 'rounded-b-none border-b-0' : ''
                                }`}
                        >
                            <div className="flex items-center">
                                <svg
                                    className={`w-5 h-5 text-gray-600 transition-transform mr-2 ${showOriginalText ? 'transform rotate-90' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 5l7 7-7 7"
                                    />
                                </svg>
                                <span className="text-lg font-medium text-gray-800">소스 텍스트 보기</span>
                            </div>
                            <div></div>
                        </button>

                        <AnimatePresence>
                            {showOriginalText && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="overflow-hidden"
                                >
                                    <div className="bg-white/40 backdrop-blur-md rounded-xl rounded-t-none p-4 border border-white/20 border-t-0">
                                        <p className="text-gray-600 text-sm whitespace-pre-wrap">{group.original_text}</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-semibold text-gray-700">기억 카드</h3>
                        <div className="text-sm text-gray-500">총 {group.chunks.length}개</div>
                    </div>

                    <div className="space-y-4">
                        {group.chunks.map((chunk, index) => (
                            <div
                                key={chunk.id}
                                className="
                                    p-4 
                                    bg-white/80
                                    backdrop-blur-md 
                                    rounded-xl
                                    border
                                    border-white/20
                                    hover:bg-white/90
                                    transition-colors
                                    [-webkit-backdrop-filter:blur(20px)]
                                    [backdrop-filter:blur(20px)]
                                    relative
                                    z-0
                                "
                            >
                                <h4 className="text-lg font-medium text-gray-800">카드 {index + 1}</h4>
                                <p className="mt-2 text-gray-600">{chunk.summary}</p>
                                <div className="mt-3 p-3 bg-gray-100 rounded-lg">
                                    <p className="text-gray-700 whitespace-pre-wrap">{chunk.masked_text}</p>
                                </div>
                                <Link
                                    href={`/content/${content.id}/learning?chunk=${chunk.id}`}
                                    className="flex-1"
                                    onClick={() => handleChunkClick(chunk.id)}
                                >
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    )
}