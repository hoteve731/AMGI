import { redirect } from 'next/navigation'
import LoginButton from './login-button'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/server'

export default async function AuthPage() {
    const supabase = await createClient()

    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
        redirect('/')
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
            <div className="max-w-md w-full space-y-8 p-8 bg-white/60 backdrop-blur-md rounded-xl border border-white/30 shadow-lg">
                <div className="text-center space-y-4">
                    <div className="flex justify-center">
                        <Image
                            src="/icons/translogo.png"
                            alt="LOOPA"
                            width={80}
                            height={80}
                            className="rounded-2xl"
                        />
                    </div>
                    <h1 className="text-4xl font-bold text-[#7969F7]">
                        LOOPA
                    </h1>
                    <p className="mt-2 text-gray-700 text-lg">
                        아이디어를 기록하고 효과적으로 학습하세요
                    </p>
                </div>

                <div className="mt-12">
                    <LoginButton />
                </div>
            </div>
        </div>
    )
}