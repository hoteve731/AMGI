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
        {/* 콘텐츠 영역 */}
      </div>
    </main>
  )
}