'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'
import { useSWRConfig } from 'swr'
import { motion, AnimatePresence } from 'framer-motion'
import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'

type ContentGroup = {
    id: string
    content_id: string
    title: string
    original_text: string
    chunks: Array<{ id: string, summary: string, masked_text: string }>
}

type Content = {
    id: string
    title: string
    original_text: string
    markdown_text?: string
}

export default function ContentDetail({
    group,
    content
}: {
    group: ContentGroup,
    content: Content
}) {
    const [activeTab, setActiveTab] = useState<'notes' | 'cards' | 'original'>('notes')
    const [isDeleting, setIsDeleting] = useState(false)
    const router = useRouter()
    const supabase = createClientComponentClient()
    const { mutate } = useSWRConfig()

    const handleDeleteContent = async () => {
        if (!confirm('정말로 이 콘텐츠를 삭제하시겠습니까? 모든 그룹과 기억 카드가 삭제되며, 이 작업은 되돌릴 수 없습니다.')) {
            return
        }

        setIsDeleting(true)
        try {
            const response = await fetch('/api/contents', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: content.id }),
            })

            if (!response.ok) {
                throw new Error('콘텐츠 삭제 중 오류가 발생했습니다.')
            }

            // SWR 캐시 업데이트
            mutate('/api/contents')

            // 홈으로 이동
            router.push('/')
        } catch (error) {
            console.error('콘텐츠 삭제 중 오류:', error)
            alert('콘텐츠 삭제 중 오류가 발생했습니다.')
        } finally {
            setIsDeleting(false)
        }
    };

    // Helper function to render markdown text as HTML
    function renderMarkdown(markdown: string): string {
        if (!markdown) return '';

        // Configure marked with options
        marked.use({
            gfm: true, // GitHub Flavored Markdown
            breaks: true, // Convert \n to <br>
        });

        // Sanitize the HTML output to prevent XSS attacks
        const html = marked.parse(markdown);
        return DOMPurify.sanitize(html);
    }

    return (
        <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
            <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] h-12">
                <button
                    onClick={() => router.back()}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <button
                    onClick={handleDeleteContent}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4">
                <div className="space-y-4 mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">{content.title}</h1>
                </div>

                <div className="mb-6">
                    <div className="flex bg-white rounded-full p-1 shadow-sm ring-1 ring-gray-200/70 ring-inset">
                        <button
                            onClick={() => setActiveTab('notes')}
                            className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-colors duration-200 ${activeTab === 'notes'
                                ? 'bg-[#5F4BB6] text-white font-bold'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            📔 노트
                        </button>
                        <button
                            onClick={() => setActiveTab('cards')}
                            className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-colors duration-200 ${activeTab === 'cards'
                                ? 'bg-[#5F4BB6] text-white font-bold'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Cards
                        </button>
                        <button
                            onClick={() => setActiveTab('original')}
                            className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-colors duration-200 ${activeTab === 'original'
                                ? 'bg-[#5F4BB6] text-white font-bold'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Original
                        </button>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === 'notes' && (
                        <motion.div
                            key="notes"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                        >
                            <div className="py-6 px-3 bg-white/80 backdrop-blur-md rounded-xl border border-white/20">
                                <div className="w-full">
                                    {content.markdown_text ? (
                                        <div
                                            className="markdown-content"
                                            dangerouslySetInnerHTML={{ __html: renderMarkdown(content.markdown_text) }}
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-8">
                                            <div className="animate-pulse flex space-x-4">
                                                <div className="rounded-full bg-slate-200 h-10 w-10"></div>
                                                <div className="flex-1 space-y-6 py-1">
                                                    <div className="h-2 bg-slate-200 rounded"></div>
                                                    <div className="space-y-3">
                                                        <div className="grid grid-cols-3 gap-4">
                                                            <div className="h-2 bg-slate-200 rounded col-span-2"></div>
                                                            <div className="h-2 bg-slate-200 rounded col-span-1"></div>
                                                        </div>
                                                        <div className="h-2 bg-slate-200 rounded"></div>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-gray-500 mt-4">마크다운 노트를 생성 중입니다...</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'cards' && (
                        <motion.div
                            key="cards"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                        >
                            <div className="space-y-0 relative">
                                {group.chunks.map((chunk, index) => (
                                    <div
                                        key={index}
                                        className="relative pl-8 mb-6"
                                        style={{
                                            marginTop: index === 0 ? '0' : '-4px',
                                        }}
                                    >
                                        {/* 연결 선 */}
                                        {index < group.chunks.length - 1 && (
                                            <div
                                                className="absolute left-[7px] top-[40px] h-[calc(100%_+_12px)] w-1 bg-white/70"
                                                style={{
                                                    background: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.3) 100%)'
                                                }}
                                            />
                                        )}

                                        {/* 원 */}
                                        <div
                                            className="absolute left-0 top-[18px] w-[15px] h-[15px] rounded-full bg-white border-2 border-[#D4C4B7]"
                                        />

                                        {/* 카드 */}
                                        <div
                                            className="
                                                p-4 
                                                bg-white/60
                                                backdrop-blur-md 
                                                rounded-xl
                                                shadow-sm
                                                border
                                                border-white/20
                                                [-webkit-backdrop-filter:blur(20px)]
                                                [backdrop-filter:blur(20px)]
                                            "
                                        >
                                            <p className="text-gray-800">{chunk.summary}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 mb-4">
                                <Link
                                    href={`/content/${content.id}/learning?chunk=${group.chunks[0]?.id || ''}`}
                                    className="w-full block text-center py-3 px-4 rounded-lg bg-[#DDCFFD] text-white font-medium hover:bg-opacity-90 transition-colors"
                                >
                                    반복 시작하기
                                </Link>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'original' && (
                        <motion.div
                            key="original"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                        >
                            <div className="p-6 bg-white/80 backdrop-blur-md rounded-xl border border-white/20">
                                <div className="w-full">
                                    <p className="whitespace-pre-wrap text-gray-700">{content.original_text}</p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </main>
    )
}