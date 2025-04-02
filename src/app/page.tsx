import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'
import ContentTabs from '@/components/ContentTabs'
import BottomSheet from '@/components/BottomSheet'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = createServerComponentClient({ cookies })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/auth')
  }

  const user = session.user

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex justify-between items-center p-4 border-b">
        <div>
          <h1 className="text-2xl font-bold">LOOPA</h1>
          <p className="text-sm text-gray-600">
            {user.user_metadata.full_name || user.email}
          </p>
        </div>
        <LogoutButton />
      </header>

      <div className="flex-1 overflow-hidden">
        <ContentTabs />
      </div>

      <BottomSheet />
    </main>
  )
}