'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

type LoadingScreenProps = {
    progress: number
    status: 'title' | 'content' | 'group' | 'chunk' | 'complete'
}

export default function LoadingScreen({ progress, status }: LoadingScreenProps) {
    const statusText = {
        title: '제목을 생성하는 중...',
        content: '내용을 분석하는 중...',
        group: '그룹으로 나누는 중...',
        chunk: '기억 카드를 생성하는 중...',
        complete: '완료되었습니다!'
    }

    return (
        <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center">
            {/* 로딩 스피너 */}
            <div className="relative w-16 h-16 mb-8">
                {[0, 1, 2, 3, 4].map((i) => (
                    <motion.div
                        key={i}
                        className="absolute w-3 h-3 bg-[#7969F7] rounded-full"
                        style={{
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                        }}
                        animate={{
                            x: [
                                '0px',
                                `${Math.cos(i * (2 * Math.PI / 5)) * 20}px`,
                                '0px'
                            ],
                            y: [
                                '0px',
                                `${Math.sin(i * (2 * Math.PI / 5)) * 20}px`,
                                '0px'
                            ],
                        }}
                        transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            delay: i * 0.1,
                            ease: [0.4, 0, 0.2, 1],
                            times: [0, 0.5, 1]
                        }}
                    />
                ))}
            </div>

            {/* 상태 텍스트 */}
            <p className="text-lg text-gray-600 mb-6">
                {statusText[status]}
            </p>

            {/* 프로그레스 바 */}
            <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                    className="h-full bg-[#7969F7]"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                />
            </div>
        </div>
    )
} 