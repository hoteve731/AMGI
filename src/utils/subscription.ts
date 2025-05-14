import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { User } from '@supabase/supabase-js';

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
 * Get the current user's subscription status
 */
export async function getUserSubscriptionStatus(): Promise<SubscriptionStatus> {
  const supabase = createClientComponentClient();

  // Get current user
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return {
      isSubscribed: false,
      contentLimit: FREE_CONTENT_LIMIT
    };
  }

  // Get user data with subscription info
  const { data: userData, error } = await supabase
    .from('users')
    .select('*, contents(count)')
    .eq('id', session.user.id)
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
    session_user_id: session.user.id
  });

  // Check if subscription is active - 타입 변환 명시적 처리
  // Boolean 생성자를 사용하여 명시적으로 불리언으로 변환
  const isPremium = Boolean(userData.is_premium);
  const isActiveStatus = userData.subscription_status === 'active';

  console.log('구독 상태 계산:', { isPremium, isActiveStatus });

  // 두 조건 모두 충족하는지 확인
  const isSubscribed = isPremium && isActiveStatus;

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
 * Check if a user can create more content
 */
export async function checkContentLimit(): Promise<{
  canCreate: boolean;
  current?: number;
  limit?: number;
}> {
  const { isSubscribed, contentCount, contentLimit } = await getUserSubscriptionStatus();

  // Premium users can create unlimited content
  if (isSubscribed) {
    return { canCreate: true };
  }

  // Free users are limited
  return {
    canCreate: (contentCount || 0) < (contentLimit || FREE_CONTENT_LIMIT),
    current: contentCount,
    limit: contentLimit
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
