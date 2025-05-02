"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import LoadingOverlay from "./LoadingOverlay";
import { FolderIcon, ChevronLeftIcon, DocumentTextIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { SparklesIcon } from "@heroicons/react/24/solid";

// ContentTabs와 동일한 fetcher 함수 사용
const fetcher = async (url: string) => {
  try {
    const response = await fetch(url, { credentials: 'include' });

    if (response.status === 401) {
      console.error('Authentication error: User not authenticated');
      // 로그인 페이지로 리다이렉트하는 대신 빈 데이터 반환
      return { contents: [] };
    }

    if (!response.ok) {
      console.error('Failed to fetch contents:', response.status);
      return { contents: [] };
    }

    // 응답이 JSON인지 확인
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('Invalid response format, expected JSON but got:', contentType);
      return { contents: [] };
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching contents:', error);
    return { contents: [] };
  }
};

// 최대 콘텐츠 수 상수 정의
const MAX_FREE_CONTENTS = 5;

const SideMenu: React.FC<{ open: boolean; onClose: () => void; }> = ({ open, onClose }) => {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [expandedContents, setExpandedContents] = useState<string[]>([]);
  const [contentGroups, setContentGroups] = useState<{ [key: string]: any[] }>({});

  const { data, error, isLoading } = useSWR<{ contents: any[] }>('/api/contents', fetcher, {
    refreshInterval: 0,  // 자동 폴링 없음
    revalidateOnFocus: true,  // 창이 포커스를 얻을 때 재검증
    revalidateOnReconnect: true,  // 브라우저가 연결을 다시 얻을 때 재검증
    dedupingInterval: 5000, // 5초 내에 중복 요청 방지
  });

  const contents = data?.contents || [];
  const contentCount = contents.length;
  const percentUsed = (contentCount / MAX_FREE_CONTENTS) * 100;
  const isLimitReached = contentCount >= MAX_FREE_CONTENTS;

  // 디버깅을 위한 로그
  useEffect(() => {
    if (open) {
      console.log('SideMenu data:', data);
      console.log('SideMenu error:', error);
      console.log('SideMenu isLoading:', isLoading);
    }
  }, [open, data, error, isLoading]);

  // 별도의 useEffect로 contents 로깅
  useEffect(() => {
    if (open && contents.length > 0) {
      console.log('Contents with groups:', contents);
    }
  }, [open, contents]);

  const handleSelectContent = (contentId: string) => {
    setIsNavigating(true);
    router.push(`/content/${contentId}/groups`);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleSubscriptionClick = () => {
    setShowSubscriptionModal(true);
  };

  // 이메일로 구독 신청 기능 추가
  const handleSubscriptionEmail = () => {
    const emailAddress = 'loopa.service@gmail.com';
    const subject = 'LOOPA Subscription Request';
    const body = 'Write your subscription request here:\n\n';

    window.location.href = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setShowSubscriptionModal(false); // 모달 닫기
  };

  // 1:1 문의 이메일 보내기
  const handleSendInquiryEmail = () => {
    const emailAddress = 'loopa.service@gmail.com';
    const subject = 'LOOPA Inquiry';
    const body = 'Write your inquiry here:\n\n';

    window.location.href = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // 카카오톡 채팅하기
  const handleKakaoChat = () => {
    window.open('https://open.kakao.com/me/Loopa', '_blank');
  };

  // 구독 모달 표시 이벤트 리스너
  useEffect(() => {
    const handleShowSubscriptionModal = () => {
      console.log('구독 모달 표시 이벤트 수신됨');
      setShowSubscriptionModal(true);
    };

    window.addEventListener('showSubscriptionModal', handleShowSubscriptionModal);
    return () => window.removeEventListener('showSubscriptionModal', handleShowSubscriptionModal);
  }, []);

  const toggleContentExpand = async (contentId: string) => {
    if (expandedContents.includes(contentId)) {
      // 접기
      setExpandedContents(expandedContents.filter(id => id !== contentId));
    } else {
      // 펼치기
      setExpandedContents([...expandedContents, contentId]);

      // 이미 그룹 데이터가 있는지 확인
      if (!contentGroups[contentId] || contentGroups[contentId].length === 0) {
        try {
          // 해당 콘텐츠의 그룹 데이터 가져오기
          const response = await fetch(`/api/contents?id=${contentId}`, { credentials: 'include' });
          if (!response.ok) {
            console.error(`Failed to fetch groups for content ${contentId}:`, response.status);
            return;
          }

          const data = await response.json();
          console.log(`Groups for content ${contentId}:`, data);

          if (data.content && data.content.id === contentId) {
            // 그룹 데이터 저장 - data.content.groups에서 가져옴
            const groups = data.content.groups || [];
            console.log(`Extracted groups for content ${contentId}:`, groups);

            setContentGroups(prev => ({
              ...prev,
              [contentId]: groups.map((group: any) => ({
                ...group,
                active_card_count: group.chunks_count || 0 // API가 반환하는 chunks_count 사용
              }))
            }));
          }
        } catch (error) {
          console.error(`Error fetching groups for content ${contentId}:`, error);
        }
      }
    }
  };

  const handleSelectGroup = (contentId: string, groupId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsNavigating(true);
    router.push(`/content/${contentId}/groups/${groupId}`);
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
            className="fixed top-0 left-0 h-full z-[9999] w-3/4 max-w-[340px] bg-[#F8F4EF] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between h-16 px-5 bg-[#F8F4EF]">
              <div className="flex items-center gap-2">
                <Image src="/icons/translogo.png" alt="LOOPA Logo" width={32} height={32} />
                <span className="font-semibold text-xl tracking-tight text-[#7969F7]">LOOPA</span>
              </div>
              <button
                aria-label="메뉴 닫기"
                className="p-1.5 rounded-full bg-white shadow-sm hover:bg-gray-100 transition-colors duration-200"
                onClick={onClose}
              >
                <ChevronLeftIcon className="w-5 h-5 text-gray-500" />
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
                      className="overflow-hidden"
                    >
                      <button
                        className="w-full text-left p-3 rounded-lg hover:bg-white/90 transition-all duration-200 active:scale-[0.98] bg-white/80 shadow-lg/60 backdrop-blur-sm flex items-center"
                        onClick={() => toggleContentExpand(content.id)}
                      >
                        <motion.div
                          animate={{ rotate: expandedContents.includes(content.id) ? 90 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="mr-2 flex-shrink-0"
                        >
                          <ChevronRightIcon className="w-5 h-5 text-gray-600" />
                        </motion.div>
                        <div className="flex-1">
                          <div className="line-clamp-2 font-medium text-gray-800 text-sm mb-2">{content.title}</div>
                          <div className="text-xs text-gray-600 flex items-center gap-1">
                            <FolderIcon className="w-4 h-4 text-[#7969F7]" />
                            <span>{content.groups_count ?? 0} Group</span>
                          </div>
                        </div>
                      </button>

                      {/* 그룹 목록 */}
                      <AnimatePresence>
                        {expandedContents.includes(content.id) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="pl-8 mt-3 space-y-3">
                              {contentGroups[content.id] && contentGroups[content.id].length > 0 ? (
                                contentGroups[content.id].map((group: any) => (
                                  <button
                                    key={group.id}
                                    className="w-full text-left p-3 rounded-lg bg-white/70 hover:bg-white/80 transition-all duration-200"
                                    onClick={(e) => handleSelectGroup(content.id, group.id, e)}
                                  >
                                    <div className="mb-1.5">
                                      <div className="line-clamp-1 text-sm font-medium text-gray-700">{group.title}</div>
                                    </div>
                                    <div className="text-xs text-gray-500 flex items-center gap-1">
                                      <svg
                                        className="w-3 h-3 text-[#F59E42]"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={1.5}
                                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                      </svg>
                                      <span>{group.active_card_count ?? 0} Cards</span>
                                    </div>
                                  </button>
                                ))
                              ) : (
                                <div className="text-xs text-gray-500 p-3 text-center">
                                  {contentGroups[content.id] === undefined ? (
                                    <div className="py-2">
                                      <span className="animate-pulse inline-block text-[#9F94F8]">Loading...</span>
                                    </div>
                                  ) : 'No groups.'}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.li>
                  ))}
                </ul>
              )}
            </nav>

            {/* 프로그레스 바 및 구독 버튼 */}
            <div className="p-4 bg-white/0 backdrop-blur-sm space-y-4">


              {/* 구독 및 프로그레스 바 */}
              <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3">
                <button
                  onClick={handleSubscriptionClick}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#7969F7] to-[#9F94F8] text-white py-2.5 px-4 rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.98] mb-3"
                >
                  <SparklesIcon className="w-5 h-5" />
                  <span className="text-sm font-bold">Unlimited notes</span>
                </button>

                <p className="text-gray-700 text-sm text-center mb-3">
                  More features and <br></br>unlimited access.
                </p>

                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <DocumentTextIcon className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">
                      <span className="font-bold">Free Notes {contentCount}</span>/{MAX_FREE_CONTENTS}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full ${isLimitReached ? 'bg-red-500' : 'bg-[#7969F7]'}`}
                      style={{ width: `${Math.min(percentUsed, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
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

      {/* 구독 모달 */}
      <AnimatePresence>
        {showSubscriptionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-[10000]"
            onClick={() => setShowSubscriptionModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
              className="w-[90%] max-w-md bg-white/95 backdrop-filter backdrop-blur-md rounded-2xl p-6 shadow-2xl z-[10001] overflow-hidden border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-3 right-3">
                <button
                  onClick={() => setShowSubscriptionModal(false)}
                  className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" /></svg>
                </button>
              </div>

              <div className="text-center mb-6">
                <div className="flex justify-center mb-4">
                  <div className="bg-[#F6F3FF] p-3 rounded-full">
                    <SparklesIcon className="w-8 h-8 text-[#7969F7]" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Unlimited Notes</h3>
                <p className="text-gray-600">More features and unlimited access.</p>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-[#F6F3FF] rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#7969F7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">Unlimited notes</p>
                    <p className="text-sm text-gray-600">Create as many notes as you want</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-[#F6F3FF] rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#7969F7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">Unlimited input</p>
                    <p className="text-sm text-gray-600">More characters, more details</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-[#F6F3FF] rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#7969F7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">Image/PDF upload support</p>
                    <p className="text-sm text-gray-600">Upload images and PDF documents to convert them into memory cards</p>
                  </div>
                </div>
              </div>

              <button
                className="w-full py-3 bg-gradient-to-r from-[#7969F7] to-[#9F94F8] text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 active:scale-[0.98]"
                onClick={handleSubscriptionEmail}
              >
                Upgrade to Premium
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SideMenu;
