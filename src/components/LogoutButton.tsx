'use client'

import { createClient } from '@/utils/supabase/client'
import { useState } from 'react'
import { motion } from 'framer-motion'

export default function LogoutButton() {
    const [isLoading, setIsLoading] = useState(false)
    // Use the consistent client creation function
    const supabase = createClient()

    const handleLogout = async () => {
        setIsLoading(true)
        try {
            // 전역 범위 로그아웃 사용 (모든 기기에서 로그아웃)
            await supabase.auth.signOut({ scope: 'global' });

            // 세션 API 호출하여 서버 측 세션도 정리
            await fetch('/api/auth/session/logout', {
                method: 'POST',
                credentials: 'include',
            });

            // 쿠키 및 로컬 스토리지 정리를 위한 짧은 지연 추가
            setTimeout(() => {
                // 로그아웃 후 인증 페이지로 리다이렉트 (브라우저 내장 기능 사용)
                window.location.href = '/auth';
            }, 500);
        } catch (error) {
            console.error('로그아웃 중 오류 발생:', error);
            setIsLoading(false); // 에러 발생 시에만 로딩 상태 초기화
        }
        // 리다이렉트가 발생하므로 finally에서 isLoading을 false로 설정하지 않음
    }

    return (
        <button
            onClick={handleLogout}
            disabled={isLoading}
            className="px-4 py-2 text-sm bg-white rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
        >
            {isLoading ? (
                <>
                    <div className="relative w-4 h-4">
                        {[0, 1, 2, 3].map((i) => (
                            <motion.div
                                key={i}
                                className="absolute w-1 h-1 bg-[#7969F7] rounded-full"
                                style={{
                                    left: '50%',
                                    top: '50%',
                                    transform: 'translate(-50%, -50%)',
                                }}
                                animate={{
                                    x: [
                                        '0px',
                                        `${Math.cos(i * (2 * Math.PI / 4)) * 6}px`,
                                        '0px'
                                    ],
                                    y: [
                                        '0px',
                                        `${Math.sin(i * (2 * Math.PI / 4)) * 6}px`,
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
                    <span>로그아웃 중...</span>
                </>
            ) : (
                <span>로그아웃</span>
            )}
        </button>
    )
}