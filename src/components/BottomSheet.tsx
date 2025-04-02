'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LoadingScreen from './LoadingScreen'

export default function BottomSheet() {
    const [text, setText] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const [isClosing, setIsClosing] = useState(false)
    const [preview, setPreview] = useState<{
        title: string
        chunks: { summary: string }[]
    } | null>(null)

    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setIsOpen(false)

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to process content')
            }

            setPreview(data.content)
            setText('')
        } catch (error) {
            console.error('Error:', error)
            alert('오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleConfirm = () => {
        setPreview(null)
        router.push('/')
        router.refresh()
    }

    const closeSheet = () => {
        setIsClosing(true)
        setTimeout(() => {
            setIsOpen(false)
            setIsClosing(false)
        }, 200)
    }

    if (isLoading) {
        return <LoadingScreen />
    }

    if (preview) {
        return (
            <div className="fixed inset-0 bg-white z-40 overflow-y-auto p-4">
                <div className="max-w-2xl mx-auto">
                    <h1 className="text-2xl font-bold mb-4">{preview.title}</h1>
                    <div className="space-y-4">
                        {preview.chunks.map((chunk, index) => (
                            <div key={index} className="p-4 bg-gray-50 rounded-lg">
                                <p>{chunk.summary}</p>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={handleConfirm}
                        className="fixed bottom-4 left-1/2 transform -translate-x-1/2 px-6 py-3 bg-black text-white rounded-full"
                    >
                        홈으로 가기
                    </button>
                </div>
            </div>
        )
    }

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 bg-[#7969F7] text-white rounded-full shadow-lg hover:bg-[#A99BFF] transition-colors z-[60]"
            >
                머릿속에 넣고 싶은 아이디어를 붙여넣으세요
            </button>

            {(isOpen || isClosing) && (
                <div
                    className={`fixed inset-0 transition-all duration-200 ease-out z-[70] ${isClosing ? 'bg-black/0' : 'bg-black/50'
                        }`}
                >
                    <div
                        className="fixed inset-0"
                        onClick={closeSheet}
                    />
                    <div
                        className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-6 transition-all duration-200 ease-out ${isClosing ? 'translate-y-full' : 'translate-y-0'
                            }`}
                        style={{ minHeight: '60vh' }}
                    >
                        <form onSubmit={handleSubmit} className="h-full">
                            <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder="텍스트를 붙여넣으세요..."
                                className="w-full h-[calc(60vh-120px)] p-4 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                disabled={isLoading}
                            />
                            <div className="flex justify-end mt-4 gap-2">
                                <button
                                    type="button"
                                    onClick={closeSheet}
                                    className="px-6 py-2.5 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                                    disabled={isLoading}
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading || !text.trim()}
                                    className="px-6 py-2.5 bg-purple-500 text-white rounded-full hover:bg-purple-600 transition-colors disabled:bg-gray-300 disabled:hover:bg-gray-300"
                                >
                                    {isLoading ? '변환 중...' : '변환하기'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
} 