import { redirect } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'
import ContentTabs from '@/components/ContentTabs'
import BottomSheet from '@/components/BottomSheet'
import { createClient } from '@/utils/supabase/server'
import ReviewDashboard from '@/components/ReviewDashboard'
import { SparklesIcon } from '@heroicons/react/24/solid'

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
        <h1 className="text-2xl font-bold text-[#7969F7]">LOOPA</h1>
        <LogoutButton />
      </header>

      {/* 리뷰 대시보드 추가 - 헤더 아래, 탭바 위에 */}
      <div className="pt-4 px-4">
        <ReviewDashboard userName={user?.user_metadata.full_name || user?.email} />
      </div>

      {/* 내 컨텐츠 제목 추가 */}
      <div className="px-6 mt-4">
        <div className="flex items-center gap-1">
          <SparklesIcon className="w-6 h-6 text-[#5F4BB6] stroke-1" />
          <h2 className="text-[#5F4BB6] font-extrabold text-2xl">모든 컨텐츠</h2>
        </div>
        {/* <p className="text-gray-500 text-m">모든 기억카드를 한눈에</p> */}
      </div>

      <div className="flex-1 overflow-hidden">
        <ContentTabs />
      </div>

      <BottomSheet />
    </main>
  )
}