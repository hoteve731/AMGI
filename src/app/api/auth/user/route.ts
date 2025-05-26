import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// Free tier content limit
const FREE_CONTENT_LIMIT = 3;

/**
 * 현재 인증된 사용자 정보와 구독 상태를 반환하는 API
 */
export async function GET(request: NextRequest) {
    try {
        console.log('🔍 API: 사용자 정보 요청 시작 ========================================');

        // 헤더에서 추가 정보 확인 (디버깅용)
        const clientInfo = request.headers.get('X-Client-Info');
        const authHeader = request.headers.get('Authorization');
        const supabaseClient = request.headers.get('X-Supabase-Client');

        console.log('🔍 API: 요청 헤더 정보', {
            hasAuth: !!authHeader,
            clientInfo,
            host: request.headers.get('host'),
            requestedWith: request.headers.get('x-requested-with'),
            isSupabaseClient: !!supabaseClient
        });

        // 요청 URL에서 쿼리 파라미터 확인
        const url = new URL(request.url);
        const urlParams = {
            directAuth: url.searchParams.get('direct_auth')
        };
        console.log('🔍 API: URL 파라미터', urlParams);

        const supabase = await createClient();

        // 헤더에서 토큰 추출
        let accessToken = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            accessToken = authHeader.substring(7); // 'Bearer ' 제거
        }

        // 액세스 토큰이 있으면 직접 세션 설정 시도
        let userFromToken = null;
        if (accessToken) {
            try {
                const { data, error } = await supabase.auth.getUser(accessToken);
                if (data.user && !error) {
                    userFromToken = data.user;
                    console.log('✅ API: 토큰에서 사용자 검증 성공', { userId: userFromToken.id });
                }
            } catch (err) {
                console.error('❌ API: 토큰 검증 오류', err);
            }
        }

        // 서버 측 인증 확인 - 이 방식이 클라이언트보다 안정적임
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        // 사용자 세션 가져오기
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        // 세션 쿠키 정보 기록 (디버깅용)
        console.log('🔍 API: 세션 확인', {
            hasSession: !!session,
            hasUser: !!user,
            hasTokenUser: !!userFromToken,
            userFromSession: session?.user?.id,
            userFromAuth: user?.id,
            userFromToken: userFromToken?.id,
            sessionError: sessionError?.message,
            userError: userError?.message
        });

        // 클라이언트에서 전달한 사용자 정보 확인
        let clientUserInfo = null;
        const userInfoHeader = request.headers.get('X-User-Info');
        if (userInfoHeader) {
            try {
                clientUserInfo = JSON.parse(userInfoHeader);
                console.log('✅ API: 클라이언트에서 사용자 정보 받음', clientUserInfo);

                // 클라이언트에서 보낸 사용자 ID를 이용해 직접 조회
                if (clientUserInfo.userId && !userFromToken) {
                    try {
                        // 사용자 정보를 직접 DB에서 조회
                        const { data: dbUser, error: dbError } = await supabase
                            .from('users')
                            .select('*')
                            .eq('id', clientUserInfo.userId)
                            .single();

                        if (dbUser && !dbError) {
                            console.log('✅ API: 클라이언트 사용자 ID로 DB 사용자 조회 성공', {
                                userId: dbUser.id,
                                email: dbUser.email
                            });
                        }
                    } catch (err) {
                        console.error('❌ API: 클라이언트 사용자 ID 검증 오류', err);
                    }
                }
            } catch (e) {
                console.error('❌ API: 클라이언트 사용자 정보 파싱 오류', e);
            }
        }

        // 쿠키에서 직접 액세스 토큰 확인 (supabase-auth-token)
        let cookieAccessToken = null;
        const allCookies = request.headers.get('cookie');
        if (allCookies) {
            const sbTokenMatch = allCookies.match(/sb-[^=]+-auth-token=([^;]+)/);
            if (sbTokenMatch) {
                try {
                    const tokenData = JSON.parse(decodeURIComponent(sbTokenMatch[1]));
                    if (tokenData.access_token) {
                        cookieAccessToken = tokenData.access_token;
                        console.log('✅ API: 쿠키에서 액세스 토큰 발견');

                        // 쿠키 토큰으로 사용자 확인
                        if (!userFromToken) {
                            try {
                                const { data, error } = await supabase.auth.getUser(cookieAccessToken);
                                if (data.user && !error) {
                                    userFromToken = data.user;
                                    console.log('✅ API: 쿠키 토큰으로 사용자 검증 성공', { userId: userFromToken.id });
                                }
                            } catch (err) {
                                console.error('❌ API: 쿠키 토큰 검증 오류', err);
                            }
                        }
                    }
                } catch (e) {
                    console.error('❌ API: 쿠키 토큰 파싱 오류', e);
                }
            }
        }

        // 직접 인증 요청 확인
        if (urlParams.directAuth === 'true' && clientUserInfo?.userId && !userFromToken) {
            console.log('🔄 API: 직접 인증 요청으로 사용자 정보 조회 시도');
            // 클라이언트에서 보낸 사용자 ID로 토큰 확인 없이 진행
            userFromToken = {
                id: clientUserInfo.userId,
                email: clientUserInfo.emailHash ? `user-${clientUserInfo.userId.substring(0, 8)}@example.com` : undefined,
                app_metadata: {},
                user_metadata: {},
                aud: 'authenticated',
                created_at: new Date().toISOString()
            };
        }

        // 직접 인증 모드 확인 - client 측 Supabase 클라이언트 확인
        const isDirectMode = request.headers.get('X-Supabase-Client') === 'true' || urlParams.directAuth === 'true';

        // 모든 소스에서 사용자를 확인 - 토큰, 일반 인증, 세션
        if (!user && !session?.user && !userFromToken) {
            console.log('❌ API: 인증된 사용자 없음');

            // 직접 모드에서는 인증 실패시에도 기본 정보만 반환
            if (isDirectMode) {
                console.log('⚠️ API: 직접 인증 모드에서 기본 정보 반환');
                return NextResponse.json({
                    authenticated: false,
                    error: 'User not authenticated',
                    subscription: {
                        isSubscribed: false,
                        contentLimit: 5,
                        contentCount: 0
                    }
                }, { status: 200 }); // 클라이언트 오류 방지를 위해 200 반환
            }

            // 일반 모드에서는 401 반환
            return NextResponse.json({ authenticated: false, error: 'User not authenticated' }, { status: 401 });
        }

        // 어느 쪽이든 사용자 정보가 있으면 진행 (우선순위: 토큰 > 일반 인증 > 세션)
        const authenticatedUser = userFromToken || user || session?.user;

        // authenticatedUser는 위에서 검사했지만 타입 안전성을 위해 다시 확인
        if (!authenticatedUser) {
            console.log('❌ API: 인증된 사용자 없음 (타입 체크)');
            return NextResponse.json({ authenticated: false, error: 'User not authenticated' }, { status: 401 });
        }

        console.log('✅ API: 사용자 인증 확인됨', { id: authenticatedUser.id, source: userFromToken ? 'token' : (user ? 'auth' : 'session') });

        console.log('✅ API: 인증된 사용자', {
            id: authenticatedUser.id,
            email: authenticatedUser.email
        });

        // 사용자 데이터 가져오기 - 더 안정적인 쿼리로 변경
        console.log('🔄 API: 사용자 데이터 조회 시도, userId:', authenticatedUser.id);
        const { data: userData, error: userDataError } = await supabase
            .from('users')
            .select('*, contents(count)')
            .eq('id', authenticatedUser.id)
            .single();

        // 사용자 데이터 조회 결과 로깅
        if (userDataError) {
            console.error('❌ API: 사용자 데이터 가져오기 오류:', userDataError);
        } else if (!userData) {
            console.error('❌ API: 사용자 데이터 없음, userId:', authenticatedUser.id);
        } else {
            console.log('✅ API: 사용자 데이터 조회 성공', {
                id: userData.id,
                email: userData.email,
                is_premium: userData.is_premium,
                subscription_status: userData.subscription_status
            });
        }

        // 콘텐츠 개수 가져오기 - 더 안정적인 쿼리로 변경
        console.log('🔄 API: 콘텐츠 개수 조회 시도, userId:', authenticatedUser.id);
        const { count, error: countError } = await supabase
            .from('contents')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', authenticatedUser.id);

        if (countError) {
            console.error('❌ API: 콘텐츠 개수 가져오기 오류:', countError);
        } else {
            console.log('✅ API: 콘텐츠 개수:', count);
        }

        // 구독 상태 확인 - 로직 강화
        let isPremium = false;
        if (userData) {
            console.log('🔍 API: 사용자 데이터 구독 상태 원본 값:', {
                is_premium: userData.is_premium,
                type: typeof userData.is_premium,
                raw_value: String(userData.is_premium)
            });

            if (typeof userData.is_premium === 'boolean') {
                isPremium = userData.is_premium;
            } else if (typeof userData.is_premium === 'string') {
                isPremium = userData.is_premium.toLowerCase() === 'true';
            } else if (typeof userData.is_premium === 'number') {
                isPremium = userData.is_premium === 1;
            } else {
                // 기본값은 false로 유지하되 로그 추가
                console.log('⚠️ API: is_premium 값이 예상치 못한 형식임:', typeof userData.is_premium);
                isPremium = false;
            }
        }

        console.log('🔍 API: 구독 상태 계산', {
            is_premium: userData?.is_premium,
            is_premium_type: typeof userData?.is_premium,
            calculated_isPremium: isPremium
        });

        // 구독 정보 구성
        const subscription = {
            isSubscribed: isPremium,
            contentCount: count || 0,
            contentLimit: isPremium ? Infinity : FREE_CONTENT_LIMIT,
            expiresAt: userData?.subscription_expires_at || null,
            subscriptionId: userData?.subscription_id || null,
            customerPortalUrl: userData?.customer_portal_url || null
        };

        console.log('✅ API: 구독 정보 계산 완료', subscription);

        // 요청, 응답 헤더에 캐시 무효화 설정
        const responseHeaders = new Headers();
        responseHeaders.set('Cache-Control', 'no-store, max-age=0');
        responseHeaders.set('Pragma', 'no-cache');

        // 응답 CORS 헤더 설정 (필요한 경우)
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Info');

        // 사용자 정보, 세션 및 구독 상태 반환
        console.log('🔍 API: 사용자 정보 요청 완료 ========================================');
        return NextResponse.json({
            authenticated: true,
            user: authenticatedUser,
            session: session ? {
                expires_at: session.expires_at,
                // access_token과 refresh_token은 보안을 위해 축약하여 반환
                access_token: session.access_token ? `${session.access_token.substring(0, 10)}...` : null,
                refresh_token: session.refresh_token ? `${session.refresh_token.substring(0, 10)}...` : null,
            } : null,
            subscription,
            contentCount: count || 0
        }, { headers: responseHeaders });
    } catch (error) {
        console.error('❌ API: 사용자 정보 요청 처리 오류', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
} 