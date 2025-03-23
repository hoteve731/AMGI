import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LoginButton from './login-button'

export default async function AuthPage() {
    const supabase = createServerComponentClient({ cookies })

    const {
        data: { session },
    } = await supabase.auth.getSession()

    if (session) {
        redirect('/')
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full space-y-8 p-8">
                <div className="text-center">
                    <h1 className="text-3xl font-bold">AMGI</h1>
                    <p className="mt-2 text-gray-600">
                        아이디어를 기록하고 효과적으로 학습하세요
                    </p>
                </div>

                <div className="mt-8">
                    <LoginButton />
                </div>
            </div>
        </div>
    )
} 