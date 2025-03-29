'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

type Content = {
    id: string
    title: string
    chunks: Array<{ summary: string }>
    masked_chunks: Array<{ masked_text: string }>
}

function isMaskedChunk(chunk: { summary: string } | { masked_text: string }): chunk is { masked_text: string } {
    return 'masked_text' in chunk
}

function maskText(text: string | undefined, isFlipped: boolean) {
    if (!text) return ''
    return text.replace(/\*\*([^*]+)\*\*/g, (_, word) =>
        isFlipped
            ? `<span class="font-bold text-purple-600">${word}</span>`
            : '<span class="inline-block w-12 h-5 bg-black rounded align-text-bottom mx-1"></span>'
    )
}

export default function LearningPage({ params }: { params: { id: string } }) {
    const [content, setContent] = useState<Content | null>(null)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isFlipped, setIsFlipped] = useState(false)
    const router = useRouter()
    const supabase = createClientComponentClient()
    const contentId = params.id

    useEffect(() => {
        if (!contentId) return

        const fetchContent = async () => {
            const { data, error } = await supabase
                .from('contents')
                .select('*')
                .eq('id', contentId)
                .single()

            if (error) {
                console.error('Error fetching content:', error)
                router.push('/')
                return
            }

            setContent(data)
        }

        fetchContent()
    }, [contentId, router, supabase])

    if (!content) return null

    const totalCards = content.chunks.length
    const currentChunk = isFlipped ? content.chunks[currentIndex] : content.masked_chunks[currentIndex]

    const handleNext = () => {
        if (currentIndex === totalCards - 1) {
            setCurrentIndex(0)
        } else {
            setCurrentIndex(prev => prev + 1)
        }
        setIsFlipped(false)
    }

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

            <div className="flex-1 flex flex-col items-center justify-center p-4">
                <div className="text-center mb-4">
                    {currentIndex + 1}/{totalCards}
                </div>

                <div
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="w-full max-w-2xl min-h-[200px] p-6 bg-gray-50 rounded-lg cursor-pointer transition-all duration-300 hover:bg-gray-100 flex items-center"
                >
                    <p
                        className="text-left leading-relaxed"
                        dangerouslySetInnerHTML={{
                            __html: maskText(content.masked_chunks[currentIndex]?.masked_text, isFlipped)
                        }}
                    />
                </div>

                <div className="mt-8 space-x-4">
                    <button
                        onClick={() => setIsFlipped(!isFlipped)}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        {isFlipped ? '핵심 단어 가리기' : '핵심 단어 보기'}
                    </button>
                    <button
                        onClick={handleNext}
                        className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-900"
                    >
                        다음 카드
                    </button>
                </div>

                <div className="mt-4 text-sm text-gray-500">
                    화면을 클릭하면 카드가 뒤집힙니다
                </div>
            </div>
        </main>
    )
} 