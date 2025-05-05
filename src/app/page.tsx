import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import ReviewDashboard from '@/components/ReviewDashboard'
import MenuButton from '@/components/MenuButton'
import ContentList from '@/components/ContentList'
import BottomSheet from '@/components/BottomSheet'
import BetaBanner from '@/components/BetaBanner'
import UnlimitedNotesButton from '@/components/UnlimitedNotesButton'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user

  return (
    <main className="flex min-h-screen flex-col bg-[#F3F5FD]">
      <header className="flex justify-between items-center py-3 px-4 border-b border-[#D4C4B7] bg-[#F3F5FD]">
        <div className="flex items-center gap-3">
          <MenuButton />
          <h1 className="text-2xl font-bold text-[#7969F7]">LOOPA</h1>
        </div>
        <UnlimitedNotesButton />
      </header>

      {/* 베타 공지 배너 */}
      <BetaBanner />

      {/* 리뷰 대시보드 추가 - 헤더 아래, 콘텐츠 위에 */}
      <div className="pt-4 px-4 pb-0">
        <ReviewDashboard userName={user?.user_metadata.full_name || user?.email} />
      </div>

      <div className="flex-1 overflow-hidden">
        <ContentList />
      </div>

      <BottomSheet />
    </main>
  )
}