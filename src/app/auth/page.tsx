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
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5] px-4">
            <div className="text-center space-y-6 max-w-md w-full">
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
                <p className="text-xl mb-8 font-light text-gray-600">
                    AI notes for busy learners
                </p>
            </div>

            <div className="mt-16 max-w-md w-full">
                <LoginButton />
            </div>
        </div>
    )
}