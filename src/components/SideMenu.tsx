"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import LoadingOverlay from "./LoadingOverlay";
import { FolderIcon } from "@heroicons/react/24/outline";

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
  const [isNavigating, setIsNavigating] = useState(false);
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
    setIsNavigating(true);
    router.push(`/content/${contentId}/groups`);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  return (
    <>
      {isNavigating && <LoadingOverlay />}
      <AnimatePresence>
        {open && (
          <motion.aside
            key="side-menu"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "tween", duration: 0.35 }}
            className="fixed top-0 left-0 h-full z-[9999] w-2/3 max-w-[340px] bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between h-16 px-5 bg-[#F8F4EF]">
              <div className="flex items-center gap-2">
                <Image src="/icons/translogo.png" alt="LOOPA Logo" width={32} height={32} />
                <span className="font-semibold text-xl tracking-tight text-[#7969F7]">LOOPA</span>
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
            <nav className="flex-1 overflow-y-auto py-4 px-4">
              {isLoading ? (
                <div className="flex justify-center items-center h-20">
                  <div className="relative w-10 h-10">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <motion.div
                        key={i}
                        className="absolute w-2 h-2 bg-[#7969F7] rounded-full"
                        style={{
                          left: '50%',
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                        }}
                        animate={{
                          x: [
                            '0px',
                            `${Math.cos(i * (2 * Math.PI / 5)) * 16}px`,
                            '0px'
                          ],
                          y: [
                            '0px',
                            `${Math.sin(i * (2 * Math.PI / 5)) * 16}px`,
                            '0px'
                          ],
                        }}
                        transition={{
                          duration: 1.2,
                          repeat: Infinity,
                          delay: i * 0.1,
                          ease: [0.4, 0, 0.2, 1],
                          times: [0, 0.5, 1]
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : contents.length === 0 ? (
                <div className="text-gray-600 text-center mt-8 font-medium">콘텐츠가 없습니다</div>
              ) : (
                <ul className="space-y-3">
                  {contents.map((content, index) => (
                    <motion.li
                      key={content.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: 0.3,
                        delay: index * 0.05,
                        ease: [0.25, 0.1, 0.25, 1.0]
                      }}
                    >
                      <button
                        className="w-full text-left p-3 rounded-lg hover:bg-white/90 transition-all duration-200 active:scale-[0.98] bg-white/80 shadow-lg/60 backdrop-blur-sm"
                        onClick={() => handleSelectContent(content.id)}
                      >
                        <div className="line-clamp-2 font-medium text-gray-800 text-sm mb-3">{content.title}</div>
                        <div className="text-xs text-gray-600 mt-1 flex gap-3">
                          <span className="inline-flex items-center gap-1">
                            <FolderIcon className="w-4 h-4 text-[#7969F7]" />
                           그룹 {content.groups_count ?? 0} 
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <svg
                              className="w-4 h-4 text-[#F59E42]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                            카드 {content.chunks_count ?? 0}
                          </span>
                        </div>
                      </button>
                    </motion.li>
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
    </>
  );
};

export default SideMenu;
