import { redirect } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'
import { createClient } from '@/utils/supabase/server'
import ReviewDashboard from '@/components/ReviewDashboard'
import MenuButton from '@/components/MenuButton'
import ContentList from '@/components/ContentList'
import BottomSheet from '@/components/BottomSheet'
import BetaBanner from '@/components/BetaBanner'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
      <header className="flex justify-between items-center py-3 px-4 border-b border-[#D4C4B7] bg-[#F8F4EF]">
        <div className="flex items-center gap-3">
          <MenuButton />
          <h1 className="text-2xl font-bold text-[#7969F7]">LOOPA</h1>
        </div>
        <LogoutButton />
      </header>

      {/* 리뷰 대시보드 추가 - 헤더 아래, 콘텐츠 위에 */}
      <div className="pt-4 px-4 pb-0">
        <ReviewDashboard userName={user?.user_metadata.full_name || user?.email} />
      </div>

      {/* 베타 공지 배너 */}
      <BetaBanner />

      <div className="flex-1 overflow-hidden">
        <ContentList />
      </div>

      <BottomSheet />
    </main>
  )
}