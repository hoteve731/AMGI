import { redirect } from 'next/navigation'
import LoginButton from './login-button'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/server'
import { Sparkles, BookOpen, Brain, Repeat, CheckCircle2 } from 'lucide-react'

export default async function AuthPage() {
    const supabase = await createClient()

    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
        redirect('/')
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#F3F5FD] px-4">
            {/* 최상단 서비스명 */}
            <div className="text-center mb-12">
                <div className="flex justify-center mb-4">
                    <Image
                        src="/images/loopaauth.png"
                        alt="LOOPA"
                        width={300}
                        height={300}
                        className="rounded-2xl"
                    />
                </div>
                <h1 className="text-4xl text-black">
                    <span className="font-bold">LOOPA</span> <span className="font-light text-gray-600">AI Notes</span>
                </h1>
                <p className="text-xl text-gray-600 mt-2">
                    Instant Summaries. Effortless Insights.
                </p>
            </div>


            {/* 로그인 버튼 */}
            <div className="w-full max-w-md">
                <LoginButton />
            </div>
        </div>
    )
}