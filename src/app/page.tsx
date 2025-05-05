import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import ShortcutButtons from '@/components/ShortcutButtons'
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
          <MenuButton
            userName={user?.user_metadata?.full_name || user?.email?.split('@')[0]}
            userEmail={user?.email}
          />
          <h1 className="text-2xl text-black">
            <span className="font-bold">LOOPA</span>
          </h1>
        </div>
        <UnlimitedNotesButton />
      </header>

      {/* 베타 공지 배너 */}
      <BetaBanner />

      {/* 리뷰 대시보드 대신 ShortcutButtons 사용 */}
      <div className="pt-4 px-4 pb-0">
        <ShortcutButtons userName={user?.user_metadata.full_name || user?.email} />
      </div>

      {/* My Notes 타이틀 추가 */}
      <div className="px-5 pt-10">
        <h3 className="text-2xl font-semibold text-black">My Notes</h3>
      </div>

      <div className="flex-1 overflow-hidden">
        <ContentList />
      </div>

      <BottomSheet />
    </main>
  )
}