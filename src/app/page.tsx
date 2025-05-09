import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import ShortcutButtons from '@/components/ShortcutButtons'
import MenuButton from '@/components/MenuButton'
import BottomSheet from '@/components/BottomSheet'
import BetaBanner from '@/components/BetaBanner'
import UnlimitedNotesButton from '@/components/UnlimitedNotesButton'
import EnsureDefaultContent from '@/components/EnsureDefaultContent'
import HomeTabs from '@/components/HomeTabs'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user

  return (
    <main className="flex min-h-screen flex-col bg-[#F3F5FD]">
      {/* 사용자가 로그인한 경우 기본 콘텐츠 확인 */}
      {user && <EnsureDefaultContent />}

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

      {/* <BetaBanner /> */}

      {/* 리뷰 대시보드 대신 ShortcutButtons 사용 */}
      <div className="pt-4 px-4 pb-0">
        <ShortcutButtons userName={user?.user_metadata.full_name || user?.email} />
      </div>

      {/* 탭 컴포넌트 추가 */}
      <HomeTabs />

      {/* <BottomSheet /> */}
    </main>
  )
}