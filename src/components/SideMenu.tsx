"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import LoadingOverlay from "./LoadingOverlay";
import { ChevronLeftIcon, ChevronRightIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import { SparklesIcon, ChatBubbleOvalLeftEllipsisIcon, InformationCircleIcon, ArrowRightOnRectangleIcon } from "@heroicons/react/24/solid";
import FeedbackModal from "./FeedbackModal";
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { getUserSubscriptionStatus } from '@/utils/subscription';
import { useSubscription } from '@/contexts/SubscriptionContext';

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
const MAX_FREE_CONTENTS = 3;

interface SideMenuProps {
  open: boolean;
  onClose: () => void;
  userName?: string;
  userEmail?: string;
}

const SideMenu: React.FC<SideMenuProps> = ({
  open,
  onClose,
  userName,
  userEmail
}) => {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showHowToUseModal, setShowHowToUseModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<{ email?: string; name?: string } | null>(
    userName || userEmail ? { name: userName, email: userEmail } : null
  );

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

  // 구독 상태 관리
  const { isSubscribed, contentLimit, isLoading: isLoadingSubscriptionContext, refreshSubscriptionStatus } = useSubscription();
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);

  // 구독 상태 확인 함수를 useCallback으로 메모이제이션
  const checkSubscriptionStatus = useCallback(async () => {
    try {
      setIsLoadingSubscription(true);

      // 사용자 정보 직접 가져오기
      const { data: userData } = await supabase.auth.getUser();

      if (userData?.user) {
        const userId = userData.user.id;
        console.log('사이드바 열림: 로그인된 사용자 ID', userId);

        // users 테이블에서 직접 is_premium 값 확인
        const { data: userDbData, error } = await supabase
          .from('users')
          .select('id, is_premium, subscription_status')
          .eq('id', userId)
          .single();

        if (error) {
          console.error('사용자 데이터 조회 오류:', error);
        } else {
          console.log('사용자 DB 데이터:', userDbData);
          console.log('is_premium 값:', userDbData?.is_premium);
          console.log('is_premium 타입:', typeof userDbData?.is_premium);
          console.log('subscription_status 값:', userDbData?.subscription_status);

          // 구독 상태 설정 - 컨텍스트 사용
          await refreshSubscriptionStatus();
        }
      } else {
        console.log('사이드바 열림: 로그인된 사용자 없음');
      }
    } catch (error) {
      console.error('구독 상태 확인 중 오류:', error);
    } finally {
      setIsLoadingSubscription(false);
    }
  }, [refreshSubscriptionStatus]);

  // 컴포넌트 마운트 시 구독 상태 확인
  useEffect(() => {
    if (open) {
      checkSubscriptionStatus();
    }
  }, [open, checkSubscriptionStatus]);

  // 디버깅을 위한 로그
  useEffect(() => {
    if (open) {
      console.log('SideMenu data:', data);
      console.log('SideMenu error:', error);
      console.log('SideMenu isLoading:', isLoading);
    }
  }, [open, data, error, isLoading]);

  // 사용자 정보 가져오기
  useEffect(() => {
    const getUserInfo = async () => {
      const { data, error } = await supabase.auth.getUser();
      console.log('supabase.auth.getUser data:', data);
      console.log('supabase.auth.getUser error:', error);

      const supaUser = data?.user;
      console.log('supaUser:', supaUser);

      if (supaUser) {
        const userName = supaUser.user_metadata?.full_name || supaUser.email?.split('@')[0] || '';
        const userEmail = supaUser.email || '';

        console.log('Setting user with name:', userName);
        console.log('Setting user with email:', userEmail);

        setUser({
          email: userEmail,
          name: userName
        });
      } else {
        console.log('No user found from supabase.auth.getUser');
        // 세션에서 사용자 정보 가져오기 시도
        const getSession = async () => {
          const { data: sessionData } = await supabase.auth.getSession();
          console.log('Session data:', sessionData);
          if (sessionData?.session?.user) {
            const sessionUser = sessionData.session.user;
            console.log('Found user from session:', sessionUser);
            const userName = sessionUser.user_metadata?.full_name || sessionUser.email?.split('@')[0] || '';
            setUser({
              email: sessionUser.email || '',
              name: userName
            });
          }
        };
        getSession();
      }
    };

    if (open && !userName && !userEmail) {
      console.log('SideMenu opened, getting user info');
      getUserInfo();
    }
  }, [open, supabase.auth, userName, userEmail]);

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
      await fetch('/auth/session/logout', {
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

  // 구독 취소 처리
  const handleCancelSubscription = async () => {
    if (confirm('정말 구독을 취소하시겠습니까? 현재 구독 기간이 끝날 때까지는 프리미엄 기능을 계속 사용할 수 있습니다.')) {
      try {
        setIsLoggingOut(true);
        // 구독 취소 API 호출
        const response = await fetch('/api/test-subscription?action=deactivate', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('구독 취소 실패');
        }

        // 구독 상태 업데이트 - 컨텍스트의 refreshSubscriptionStatus 함수 사용
        await refreshSubscriptionStatus();
        alert('구독이 취소되었습니다. 현재 구독 기간이 끝날 때까지는 프리미엄 기능을 계속 사용할 수 있습니다.');
      } catch (error) {
        console.error('구독 취소 중 오류:', error);
        alert('구독 취소 중 오류가 발생했습니다. 다시 시도해 주세요.');
      } finally {
        setIsLoggingOut(false);
      }
    }
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
            className="fixed top-0 left-0 h-full z-[9999] w-3/4 max-w-[340px] bg-[#F3F5FD] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between h-16 px-5 bg-[#F3F5FD]">
              <div className="flex items-center gap-2">
                <span className="text-xl tracking-tight text-black">
                  <span className="font-bold text-[#5F4BB6]">LOOPA</span> <span className="font-light text-gray-600">AI Notes</span>
                </span>
              </div>
              <button
                aria-label="메뉴 닫기"
                className="p-1.5 rounded-full bg-white shadow-sm hover:bg-gray-100 transition-colors duration-200"
                onClick={onClose}
              >
                <ChevronLeftIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* 사용자 정보 영역 */}
            <div className="px-5 py-4 bg-white/60 border-b border-gray-200/70">
              {user ? (
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-700">
                      Welcome, {user.name ? `${user.name}` : 'User'}
                    </span>
                  </div>
                  {user.email && (
                    <span className="text-sm text-gray-500">
                      {user.email}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold">
                    ?
                  </div>
                  <span className="text-gray-500">사용자 정보 로딩 중...</span>
                </div>
              )}
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
                  <div className="flex flex-col items-start">
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
                {/* 로딩 중이 아니고 구독하지 않은 경우에만 Unlimited notes 버튼 표시 */}
                {!isLoadingSubscriptionContext && !isSubscribed && (
                  <button
                    onClick={handleSubscriptionClick}
                    className="w-full flex items-center justify-center gap-1.5 bg-[#6C37F9] hover:bg-[#5C2DE0] text-white py-2.5 px-4 rounded-full font-bold shadow-lg hover:shadow-xl transition-all duration-200 active:scale-[0.98] mb-3"
                  >
                    <SparklesIcon className="w-5 h-5 text-yellow-300" />
                    <span className="text-base">Unlimited notes</span>
                  </button>
                )}

                {/* 로딩 중이 아니고 구독한 경우에만 Cancel Subscription 버튼 표시 */}
                {!isLoadingSubscriptionContext && isSubscribed && (
                  <button
                    onClick={handleCancelSubscription}
                    className="w-full py-2.5 px-4 border border-red-500 text-red-500 rounded-full font-bold hover:bg-red-50 transition-all duration-200 active:scale-[0.98] mb-3"
                  >
                    Cancel Subscription
                  </button>
                )}

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
                onClick={() => {
                  // Use the redirectToCheckout function from our subscription utility
                  import('@/utils/subscription').then(({ redirectToCheckout }) => {
                    redirectToCheckout();
                  });
                  // Close the modal
                  setShowSubscriptionModal(false);
                }}
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
                  <p className="text-xl font-semibold text-[#5F4BB6] leading-relaxed">
                    Master complex topics with ease, one note at a time
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                    <span className="mr-2">📝</span> Create AI Notes
                  </h4>
                  <div className="text-sm text-gray-600 space-y-2 ml-6">
                    <p>• Input text, PDFs, or web links to create clean note</p>
                    <p>• Loopa extracts key information and organizes it by topic</p>
                    <p>• Get perfectly formatted note with just one click</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                    <span className="mr-2">💾</span> Multiple Formats
                  </h4>
                  <div className="text-sm text-gray-600 space-y-2 ml-6">
                    <p>• <b>Markdown Notes</b>: Clean, organized summaries</p>
                    <p>• <b>Flash Cards</b>: Convert notes to memory cards</p>
                    <p>• <b>Visual Maps (Coming soon)</b>: See connections between concepts</p>
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
