const withPWA = require('next-pwa')({
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development', // 개발 환경에서 비활성화
    // PWA 설정 개선
    runtimeCaching: [
        {
            urlPattern: /^https:\/\/loopa\.my\/api\//,
            handler: 'NetworkFirst',
            options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 10,
                expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 60 * 60 // 1시간
                }
            }
        },
        {
            urlPattern: /^https:\/\/loopa\.my\/((?!api|auth).*)$/,
            handler: 'StaleWhileRevalidate',
            options: {
                cacheName: 'page-cache',
                expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 24 * 60 * 60 // 24시간
                }
            }
        }
    ],
    // 개발 환경에서 중복 생성 방지
    buildExcludes: [/middleware-manifest\.json$/],
    // 인증 관련 경로 제외
    exclude: [
        /\/api\/auth\/.*/,
        /\/auth\/.*/,
        /supabase\.co/
    ]
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    // 기존 설정 유지
};

module.exports = withPWA(nextConfig); 