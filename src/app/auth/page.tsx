import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LoginButton from './login-button'
import Image from 'next/image'

export default async function AuthPage() {
    const cookieStore = cookies()
    const supabase = createServerComponentClient({ cookies: () => cookieStore })

    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
        redirect('/')
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100">
            <div className="max-w-md w-full space-y-8 p-8">
                <div className="text-center space-y-4">
                    <div className="flex justify-center">
                        <Image
                            src="/icons/icon-512x512.png"
                            alt="LOOPA"
                            width={64}
                            height={64}
                            className="rounded-2xl"
                        />
                    </div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-purple-400 bg-clip-text text-transparent">
                        LOOPA
                    </h1>
                    <p className="mt-2 text-gray-600 text-lg">
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