// src/app/content/[id]/groups/page.tsx
'use server'

import { redirect } from 'next/navigation'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function Page(props: any) {
  // 그룹 리스트 페이지는 더 이상 사용하지 않으므로 홈으로 리다이렉트
  redirect('/')
}