'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

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

    return (
        <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
            <div className="sticky top-0 bg-[#F8F4EF] border-b border-[#D4C4B7] p-4">
                <button
                    onClick={() => router.back()}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800"
                >
                    ←
                </button>
                <h1 className="text-center text-lg font-medium text-gray-800">{content.title}</h1>
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4">
                <div className="space-y-4 mb-8">
                    <h2 className="text-2xl font-bold text-gray-800">{group.title}</h2>
                    <p className="text-gray-600 text-sm whitespace-pre-wrap">{group.original_text}</p>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-semibold text-gray-700">학습 청크</h3>
                        <div className="text-sm text-gray-500">{group.chunks.length}개 청크</div>
                    </div>
                    
                    <div className="space-y-4">
                        {group.chunks.map((chunk, index) => (
                            <div 
                                key={chunk.id}
                                className="
                                    p-4 
                                    bg-white/60
                                    backdrop-blur-md 
                                    rounded-xl
                                    shadow-lg
                                    border
                                    border-white/20
                                    hover:bg-white/70
                                    transition-colors
                                    [-webkit-backdrop-filter:blur(20px)]
                                    [backdrop-filter:blur(20px)]
                                "
                            >
                                <h4 className="text-lg font-medium text-gray-800">청크 {index + 1}</h4>
                                <p className="mt-2 text-gray-600">{chunk.summary}</p>
                                <div className="mt-3 p-3 bg-gray-100 rounded-lg">
                                    <p className="text-gray-700 whitespace-pre-wrap">{chunk.masked_text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    )
}