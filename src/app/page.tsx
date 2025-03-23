import { Suspense } from 'react'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function Home() {
    const supabase = createServerComponentClient({ cookies })

    const {
        data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
        redirect('/auth')
    }

    const { data: contents } = await supabase
        .from('contents')
        .select('*')
        .order('created_at', { ascending: false })

    return (
        <main className="flex min-h-screen flex-col p-4">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold">AMGI</h1>
                <button
                    onClick={() => supabase.auth.signOut()}
                    className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                    로그아웃
                </button>
            </header>

            <div className="flex-1">
                <Suspense fallback={<div>Loading...</div>}>
                    {contents?.map((content) => (
                        <div
                            key={content.id}
                            className="p-4 mb-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
                        >
                            <h2 className="text-lg font-semibold mb-2">{content.title}</h2>
                            <p className="text-gray-600 text-sm">
                                {new Date(content.created_at).toLocaleDateString()}
                            </p>
                        </div>
                    ))}
                </Suspense>
            </div>

            <button
                className="fixed bottom-6 right-6 w-14 h-14 bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-600 transition-colors"
                onClick={() => {/* TODO: Open input sheet */ }}
            >
                <span className="text-2xl">+</span>
            </button>
        </main>
    )
} 