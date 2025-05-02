'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useState } from 'react'
import { motion } from 'framer-motion'

export default function LoginButton() {
    const supabase = createClientComponentClient()
    const [isLoading, setIsLoading] = useState(false)

    const handleLogin = async () => {
        setIsLoading(true)
        try {
            // 현재 URL을 기반으로 redirectTo 설정
            const redirectTo = `${window.location.origin}/auth/callback`

            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectTo,
                }
            })

            if (error) throw error
        } catch (error) {
            console.error('Error:', error)
            alert('로그인 중 오류가 발생했습니다.')
            setIsLoading(false) // 에러 발생 시에만 로딩 상태 초기화
        }
        // 리다이렉트가 발생하므로 finally에서 isLoading을 false로 설정하지 않음
    }

    return (
        <div className="space-y-4">
            <button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 text-gray-700 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7969F7] transition-all duration-200 shadow-sm hover:shadow disabled:opacity-70 disabled:cursor-not-allowed"
            >
                {isLoading ? (
                    <div className="relative w-6 h-6">
                        {[0, 1, 2, 3, 4].map((i) => (
                            <motion.div
                                key={i}
                                className="absolute w-1.5 h-1.5 bg-[#7969F7] rounded-full"
                                style={{
                                    left: '50%',
                                    top: '50%',
                                    transform: 'translate(-50%, -50%)',
                                }}
                                animate={{
                                    x: [
                                        '0px',
                                        `${Math.cos(i * (2 * Math.PI / 5)) * 12}px`,
                                        '0px'
                                    ],
                                    y: [
                                        '0px',
                                        `${Math.sin(i * (2 * Math.PI / 5)) * 12}px`,
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
                ) : (
                    <svg viewBox="0 0 24 24" className="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            fill="#4285F4"
                        />
                        <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                        />
                        <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            fill="#FBBC05"
                        />
                        <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                        />
                    </svg>
                )}
                <span className="font-medium">
                    {isLoading ? 'Logging in...' : 'Continue with Google'}
                </span>
            </button>
        </div>
    )
}