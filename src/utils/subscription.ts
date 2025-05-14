'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { User } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';

// Define types for subscription-related data
interface SubscriptionStatus {
  isSubscribed: boolean;
  expiresAt?: string | null;
  subscriptionId?: string | null;
  customerPortalUrl?: string | null;
  contentCount?: number;
  contentLimit?: number;
}

// Free tier content limit
const FREE_CONTENT_LIMIT = 5;

/**
 * 클라이언트 컴포넌트에서 사용할 수 있는 훅
 * AuthContext를 활용하여 현재 사용자의 구독 상태를 가져옵니다.
 */
export const useSubscription = () => {
  const { user, session, isLoading } = useAuth();

  const getSubscriptionStatus = async (): Promise<SubscriptionStatus> => {
    if (isLoading) {
      console.log('useSubscription: 인증 상태 로딩 중...');
      return { isSubscribed: false, contentLimit: FREE_CONTENT_LIMIT };
    }

    if (!user) {
      console.log('useSubscription: 로그인된 사용자 없음');
      return { isSubscribed: false, contentLimit: FREE_CONTENT_LIMIT };
    }

    return getUserSubscriptionStatus(user.id);
  };

  const checkContentLimit = async () => {
    if (isLoading) {
      return { canCreate: false };
    }

    if (!user) {
      return { canCreate: false };
    }

    const status = await getSubscriptionStatus();

    if (status.isSubscribed) {
      return { canCreate: true };
    }

    return {
      canCreate: (status.contentCount || 0) < (status.contentLimit || FREE_CONTENT_LIMIT),
      current: status.contentCount,
      limit: status.contentLimit || FREE_CONTENT_LIMIT
    };
  };

  return {
    getSubscriptionStatus,
    checkContentLimit,
    isLoading,
    userId: user?.id
  };
};

/**
 * Get the current user's subscription status
 */
export async function getUserSubscriptionStatus(userId?: string): Promise<SubscriptionStatus> {
  const supabase = createClientComponentClient();
  console.log('getUserSubscriptionStatus 호출됨, 전달된 userId:', userId);

  // 사용자 ID가 전달되지 않은 경우 세션에서 가져오기
  if (!userId) {
    const { data: { session } } = await supabase.auth.getSession();
    console.log('세션 정보:', session);

    if (!session) {
      console.log('세션이 없음, 비구독 상태 반환');
      return {
        isSubscribed: false,
        contentLimit: FREE_CONTENT_LIMIT
      };
    }
    userId = session.user.id;
    console.log('세션에서 가져온 userId:', userId);
  }

  // Get user data with subscription info
  console.log('Supabase 쿼리 실행, userId:', userId);
  const { data: userData, error } = await supabase
    .from('users')
    .select('*, contents(count)')
    .eq('id', userId)
    .single();

  if (error || !userData) {
    console.error('Error fetching user subscription data:', error);
    return {
      isSubscribed: false,
      contentLimit: FREE_CONTENT_LIMIT
    };
  }

  // 디버깅을 위한 로그 추가
  console.log('사용자 데이터 전체:', userData);
  console.log('사용자 데이터 구독 정보:', {
    is_premium: userData.is_premium,
    is_premium_type: typeof userData.is_premium,
    subscription_status: userData.subscription_status,
    id: userData.id,
    session_user_id: userId
  });

  // Check if subscription is active - 타입 변환 및 로직 개선
  // 데이터베이스에서 is_premium이 문자열 'true', 숫자 1, 또는 boolean true 등 다양한 형태로 저장될 수 있음
  let isPremium = false;

  if (typeof userData.is_premium === 'boolean') {
    isPremium = userData.is_premium;
  } else if (typeof userData.is_premium === 'string') {
    isPremium = userData.is_premium.toLowerCase() === 'true';
  } else if (typeof userData.is_premium === 'number') {
    isPremium = userData.is_premium === 1;
  } else {
    // 기본적으로 Boolean 생성자 사용
    isPremium = Boolean(userData.is_premium);
  }

  // subscription_status가 없거나 'active'가 아닌 경우에도 is_premium만으로 판단할 수 있도록 수정
  const isActiveStatus = userData.subscription_status === 'active';

  console.log('구독 상태 계산:', { isPremium, isActiveStatus });

  // 구독 상태 판단 로직 개선 - is_premium이 true이면 구독 중으로 간주
  // subscription_status는 부가 정보로만 사용
  const isSubscribed = isPremium;

  // Get content count
  const contentCount = userData.contents?.count || 0;

  return {
    isSubscribed,
    expiresAt: userData.subscription_expires_at,
    subscriptionId: userData.subscription_id,
    customerPortalUrl: userData.customer_portal_url,
    contentCount,
    contentLimit: isSubscribed ? Infinity : FREE_CONTENT_LIMIT
  };
}

/**
 * Get the LemonSqueezy checkout URL with user data
 */
export function getLemonSqueezyCheckoutUrl(user?: User | null): string {
  const baseUrl = 'https://loopa.lemonsqueezy.com/buy/e4592ee7-db91-498b-993e-166924eaa942';

  // If no user, return the base URL
  if (!user) {
    return baseUrl;
  }

  // Add user email to checkout URL if available
  const params = new URLSearchParams();

  if (user.email) {
    params.append('checkout[email]', user.email);
  }

  // Add user ID as custom data
  params.append('checkout[custom][user_id]', user.id);

  // Return URL with parameters
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Redirect to LemonSqueezy checkout
 */
export async function redirectToCheckout(): Promise<void> {
  const supabase = createClientComponentClient();
  const { data: { session } } = await supabase.auth.getSession();

  const checkoutUrl = getLemonSqueezyCheckoutUrl(session?.user || null);
  window.open(checkoutUrl, '_blank');
}
