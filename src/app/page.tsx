import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'

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
        <LogoutButton />
      </header>

      <div className="flex-1">
        {/* 콘텐츠 영역 */}
      </div>
    </main>
  )
}