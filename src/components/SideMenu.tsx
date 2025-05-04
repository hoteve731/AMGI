"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import LoadingOverlay from "./LoadingOverlay";
import { ChevronLeftIcon, ChevronRightIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import { SparklesIcon, ChatBubbleOvalLeftEllipsisIcon, InformationCircleIcon, ArrowRightOnRectangleIcon } from "@heroicons/react/24/solid";
import FeedbackModal from "./FeedbackModal";
import { createClient } from '@/utils/supabase/client';

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
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showHowToUseModal, setShowHowToUseModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const supabase = createClient();

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

  // 로그아웃 처리
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      // 전역 범위 로그아웃 사용 (모든 기기에서 로그아웃)
      await supabase.auth.signOut({ scope: 'global' });

      // 세션 API 호출하여 서버 측 세션도 정리
      await fetch('/api/auth/session/logout', {
        method: 'POST',
        credentials: 'include',
      });

      // 쿠키 및 로컬 스토리지 정리를 위한 짧은 지연 추가
      setTimeout(() => {
        // 로그아웃 후 인증 페이지로 리다이렉트 (브라우저 내장 기능 사용)
        window.location.href = '/auth';
      }, 500);
    } catch (error) {
      console.error('로그아웃 중 오류 발생:', error);
      setIsLoggingOut(false); // 에러 발생 시에만 로딩 상태 초기화
    }
    // 리다이렉트가 발생하므로 finally에서 isLoading을 false로 설정하지 않음
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

            {/* 상단 버튼 영역 */}
            <div className="px-4 py-3 border-b border-gray-200/70">
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setShowFeedbackModal(true)}
                  className="w-full flex items-center justify-between bg-white text-gray-800 py-4 px-4 rounded-xl font-semibold shadow-sm border border-transparent hover:border-gray-300 transition-colors duration-200 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <ChatBubbleOvalLeftEllipsisIcon className="w-5 h-5 text-gray-600" />
                    </div>
                    <span className="text-base">Send Feedback</span>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                </button>

                <button
                  onClick={() => setShowHowToUseModal(true)}
                  className="w-full flex items-center justify-between bg-white text-gray-800 py-4 px-4 rounded-xl font-semibold shadow-sm border border-transparent hover:border-gray-300 transition-colors duration-200 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <InformationCircleIcon className="w-5 h-5 text-gray-600" />
                    </div>
                    <span className="text-base">How to use</span>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                </button>

                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="w-full flex items-center justify-between bg-white text-gray-800 py-4 px-4 rounded-xl font-semibold shadow-sm border border-transparent hover:border-gray-300 transition-colors duration-200 active:scale-[0.98] disabled:opacity-70"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      {isLoggingOut ? (
                        <div className="relative w-5 h-5">
                          {[0, 1, 2, 3].map((i) => (
                            <motion.div
                              key={i}
                              className="absolute w-1 h-1 bg-gray-600 rounded-full"
                              style={{
                                left: '50%',
                                top: '50%',
                                transform: 'translate(-50%, -50%)',
                              }}
                              animate={{
                                x: [
                                  '0px',
                                  `${Math.cos(i * (2 * Math.PI / 4)) * 6}px`,
                                  '0px'
                                ],
                                y: [
                                  '0px',
                                  `${Math.sin(i * (2 * Math.PI / 4)) * 6}px`,
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
                      ) : (
                        <ArrowRightOnRectangleIcon className="w-5 h-5 text-gray-600" />
                      )}
                    </div>
                    <span className="text-base">{isLoggingOut ? "Signing out..." : "Sign out"}</span>
                  </div>
                  {!isLoggingOut && <ChevronRightIcon className="w-5 h-5 text-gray-400" />}
                </button>
              </div>
            </div>

            {/* 빈 공간 */}
            <div className="flex-1"></div>

            {/* 프로그레스 바 및 구독 버튼 */}
            <div className="p-4 bg-white/0 backdrop-blur-sm space-y-4">
              {/* 구독 및 프로그레스 바 */}
              <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3">
                <button
                  onClick={handleSubscriptionClick}
                  className="w-full flex items-center justify-center gap-1.5 bg-[#6C37F9] hover:bg-[#5C2DE0] text-white py-2.5 px-4 rounded-full font-bold shadow-lg hover:shadow-xl transition-all duration-200 active:scale-[0.98] mb-3"
                >
                  <SparklesIcon className="w-5 h-5 text-yellow-300" />
                  <span className="text-base">Unlimited notes</span>
                </button>

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
                <div className="flex justify-center">
                  <div className="bg-[#F6F3FF] p-3 rounded-full">
                    <SparklesIcon className="w-8 h-8 text-[#7969F7]" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900">Get Unlimited notes</h3>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-[#F6F3FF] rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#7969F7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">🚀 Unlimited notes</p>
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
                    <p className="font-semibold text-gray-800">✏️ Unlimited text characters</p>
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
                    <p className="font-semibold text-gray-800">🖼️ Image/PDF upload support</p>
                    <p className="text-sm text-gray-600">Upload images and PDF to convert into notes/flashcards</p>
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

      {/* 피드백 모달 */}
      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
      />

      {/* How to Use 모달 */}
      <AnimatePresence>
        {showHowToUseModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={() => setShowHowToUseModal(false)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
                <h3 className="text-xl font-bold text-gray-800">How to Use</h3>
                <button
                  onClick={() => setShowHowToUseModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-8 overflow-y-auto">
                <div className="text-center mb-2">
                  <p className="text-xl font-semibold text-gray-700 leading-relaxed">
                    ✨ Review cards at optimal intervals to strengthen your memory ✨
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                    <span className="mr-2">📊</span> Card Status
                  </h4>
                  <div className="text-sm text-gray-600 space-y-1 ml-6">
                    <p>• New: First-time cards</p>
                    <p>• Learning: Short interval cards</p>
                    <p>• Review: Long interval cards</p>
                    <p>• Due: Today's cards</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                    <span className="mr-2">🧠</span> Memory Algorithm
                  </h4>
                  <div className="text-sm text-gray-600 space-y-1 ml-6">
                    <p>• ❌ Forgotten: Reset learning</p>
                    <p>• 😐 Recalled partially: Shorter interval</p>
                    <p>• 😄 Recalled with effort: Standard interval</p>
                    <p>• 👑 Immediately: Longer interval</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SideMenu;
