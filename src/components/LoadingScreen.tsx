'use client'

import { useEffect, useState } from 'react'

const loadingTexts = [
    "지식을 쪼개는 중...",
    "핵심을 파악하는 중...",
    "아인슈타인: '복잡한 것을 단순하게 설명할 수 없다면, 당신은 충분히 이해하지 못한 것입니다.'",
    "스티브 잡스: '단순함이 궁극의 정교함입니다.'",
    "빌 게이츠: '실수로부터 배우는 것을 두려워하지 마세요.'"
]

export default function LoadingScreen() {
    const [currentText, setCurrentText] = useState(loadingTexts[0])

    useEffect(() => {
        let index = 0
        const interval = setInterval(() => {
            index = (index + 1) % loadingTexts.length
            setCurrentText(loadingTexts[index])
        }, 2000)

        return () => clearInterval(interval)
    }, [])

    return (
        <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-lg text-gray-600 animate-fade-in">
                {currentText}
            </p>
        </div>
    )
} 