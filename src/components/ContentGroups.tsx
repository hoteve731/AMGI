'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

type ContentGroup = {
    id: string
    title: string
    chunks_count: number
}

type ContentWithGroups = {
    id: string
    title: string
    created_at: string
    status: 'studying' | 'completed' | 'paused'
    groups: ContentGroup[]
}

export default function ContentGroups({ content }: { content: ContentWithGroups }) {
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
            </div>

            <div className="flex-1 max-w-2xl mx-auto w-full p-4">
                <div className="space-y-4 mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">{content.title}</h1>
                    <div className="text-sm text-gray-500">
                        {new Date(content.created_at).toLocaleDateString('ko-KR')} 암기 시작
                    </div>
                </div>

                <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-gray-700">학습 그룹</h2>
                    <div className="space-y-4">
                        {content.groups.map((group, index) => (
                            <Link
                                key={group.id}
                                href={`/content/${content.id}/groups/${group.id}`}
                                className="block relative transition-all duration-300 hover:scale-[1.02]"
                            >
                                <div className="
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
                                ">
                                    <h3 className="text-lg font-medium text-gray-800">{group.title}</h3>
                                    <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                                        <div className="flex items-center gap-1">
                                            <svg
                                                className="w-4 h-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                />
                                            </svg>
                                            <span className="text-gray-600 font-medium">{group.chunks_count}</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    )
}