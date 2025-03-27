'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Content = {
    id: string
    title: string
    created_at: string
    original_text: string
    chunks: Array<{ summary: string }>
}

export default function ContentDetail({ content }: { content: Content }) {
    const [showOriginal, setShowOriginal] = useState(false)
    const router = useRouter()

    return (
        <main className="flex min-h-screen flex-col">
            <div className="sticky top-0 bg-white border-b p-4">
                <button
                    onClick={() => router.back()}
                    className="absolute left-4 top-1/2 -translate-y-1/2"
                >
                    ←
                </button>
                <h1 className="text-center text-lg font-bold">{content.title}</h1>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4">
                <div className="text-sm text-gray-500 mb-6">
                    {new Date(content.created_at).toLocaleDateString('ko-KR')} 암기 시작
                </div>
                <div className="space-y-4">
                    {content.chunks.map((chunk, index) => (
                        <div key={index} className="p-4 bg-gray-50 rounded-lg">
                            <p>{chunk.summary}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="sticky bottom-0 p-4 bg-white border-t">
                <button
                    onClick={() => setShowOriginal(true)}
                    className="w-full py-3 bg-black text-white rounded-full"
                >
                    원본 텍스트 보기
                </button>
            </div>

            {showOriginal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
                    <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold">원본 텍스트</h3>
                            <button onClick={() => setShowOriginal(false)}>✕</button>
                        </div>
                        <p className="whitespace-pre-wrap">{content.original_text}</p>
                    </div>
                </div>
            )}
        </main>
    )
} 