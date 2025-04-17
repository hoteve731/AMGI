"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import useSWR from 'swr';
import { useRouter } from 'next/navigation';

// ContentTabs와 동일한 fetcher 함수 사용
const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    console.error('Failed to fetch contents:', response.status);
    return { contents: [] };
  }
  return response.json();
};

const SideMenu: React.FC<{ open: boolean; onClose: () => void; }> = ({ open, onClose }) => {
  const router = useRouter();
  const { data, error, isLoading } = useSWR<{ contents: any[] }>('/api/contents', fetcher, {
    refreshInterval: 0,  // 자동 폴링 없음
    revalidateOnFocus: true,  // 창이 포커스를 얻을 때 재검증
    revalidateOnReconnect: true,  // 브라우저가 연결을 다시 얻을 때 재검증
    dedupingInterval: 5000, // 5초 내에 중복 요청 방지
  });

  const contents = data?.contents || [];

  // 디버깅을 위한 로그
  useEffect(() => {
    if (open) {
      console.log('SideMenu data:', data);
      console.log('SideMenu error:', error);
      console.log('SideMenu isLoading:', isLoading);
    }
  }, [open, data, error, isLoading]);

  const handleSelectContent = (contentId: string) => {
    router.push(`/content/${contentId}/groups`);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="side-menu"
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ type: "tween", duration: 0.35 }}
          className="fixed top-0 left-0 h-full z-[9999] w-2/3 max-w-[340px] bg-white shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Image src="/icons/translogo.png" alt="LOOPA Logo" width={32} height={32} />
              <span className="font-bold text-lg tracking-tight text-gray-900">LOOPA</span>
            </div>
            <button
              aria-label="메뉴 닫기"
              className="p-2 rounded hover:bg-gray-100 transition-colors duration-200"
              onClick={onClose}
            >
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" /></svg>
            </button>
          </div>
          {/* Content List */}
          <nav className="flex-1 overflow-y-auto py-3 px-2">
            {isLoading ? (
              <div className="text-gray-400 text-center mt-8">로딩 중...</div>
            ) : contents.length === 0 ? (
              <div className="text-gray-400 text-center mt-8">콘텐츠가 없습니다</div>
            ) : (
              <ul className="space-y-3">
                {contents.map((content) => (
                  <li key={content.id}>
                    <button
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                      onClick={() => handleSelectContent(content.id)}
                    >
                      <div className="truncate font-medium text-gray-900 text-base">{content.title}</div>
                      <div className="text-xs text-gray-500 mt-1 flex gap-3">
                        <span className="inline-flex items-center gap-1"><svg width="14" height="14" fill="none" stroke="#8B5CF6" strokeWidth="2" viewBox="0 0 20 20"><rect x="2.5" y="4" width="15" height="12" rx="2" /><path d="M6 2.5v3M14 2.5v3" /></svg>{content.groups_count ?? 0} 그룹</span>
                        <span className="inline-flex items-center gap-1"><svg width="14" height="14" fill="none" stroke="#F59E42" strokeWidth="2" viewBox="0 0 20 20"><rect x="4" y="4" width="12" height="12" rx="2" /><path d="M8 8h4v4H8z" /></svg>{content.chunks_count ?? 0} 카드</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        </motion.aside>
      )}
      {open && (
        <motion.div
          key="side-menu-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.32 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black z-[9998]"
          onClick={onClose}
        />
      )}
    </AnimatePresence>
  );
};

export default SideMenu;
