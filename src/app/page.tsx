import { redirect } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'
import ContentTabs from '@/components/ContentTabs'
import BottomSheet from '@/components/BottomSheet'
import { createClient } from '@/utils/supabase/server'
import ReviewDashboard from '@/components/ReviewDashboard'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/auth')
  }

  const user = session.user

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
      <header className="flex justify-between items-center p-4 border-b border-[#D4C4B7] bg-[#F8F4EF]">
        <div className="flex flex-col">
          <div className="flex items-center">
            <img
              src="/icons/translogo.png"
              alt="Loopa Logo"
              className="w-8 h-8 mr-2"
            />
            <h1 className="text-2xl font-bold text-[#7969F7]">LOOPA</h1>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {user.user_metadata.full_name || user.email}
          </p>
        </div>
        <LogoutButton />
      </header>

      {/* 리뷰 대시보드 추가 - 헤더 아래, 탭바 위에 */}
      <div className="pt-4 px-4">
        <ReviewDashboard />
      </div>

      <div className="flex-1 overflow-hidden">
        <ContentTabs />
      </div>

      <BottomSheet />
    </main>
  )
}