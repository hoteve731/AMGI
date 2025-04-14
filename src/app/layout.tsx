import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import UpdatePrompt from '@/components/UpdatePrompt'
// import PushTest from '@/components/PushTest'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Firebase 설정 정보를 서비스 워커에 전달하는 스크립트
const firebaseConfigScript = `
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then(function(registration) {
          console.log('서비스 워커 등록 성공:', registration.scope);
          
          // Firebase 설정 정보를 서비스 워커에 전달
          if (registration.active) {
            registration.active.postMessage({
              type: 'FIREBASE_CONFIG',
              config: {
                apiKey: '${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}',
                authDomain: '${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}',
                projectId: '${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}',
                storageBucket: '${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}',
                messagingSenderId: '${process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}',
                appId: '${process.env.NEXT_PUBLIC_FIREBASE_APP_ID}'
              }
            });
          }
        })
        .catch(function(error) {
          console.log('서비스 워커 등록 실패:', error);
        });
    });
  }
`;

export const viewport = {
  themeColor: "#F8F4EF",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "LOOPA",
  description: "아이디어를 기록하고 효과적으로 학습하세요",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: "LOOPA",
    startupImage: [
      {
        url: '/splash/apple-splash-2048-2732.png',
        media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)'
      },
      {
        url: '/splash/apple-splash-1290-2796.png',
        media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)'
      },
      {
        url: '/splash/apple-splash-1080-1920.png',
        media: '(device-width: 360px) and (device-height: 640px) and (-webkit-device-pixel-ratio: 3)'
      }
    ]
  },
  icons: [
    { rel: "icon", url: "/icons/icon-192x192.png", sizes: "192x192" },
    { rel: "icon", url: "/icons/icon-512x512.png", sizes: "512x512" },
    { rel: "apple-touch-icon", url: "/icons/icon-192x192.png" }
  ]
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5]">
      <head>
        <script dangerouslySetInnerHTML={{ __html: firebaseConfigScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gradient-to-b from-[#F8F4EF] to-[#E8D9C5] min-h-screen`}>
        {children}
        <UpdatePrompt />
        {/* <PushTest /> */}
      </body>
    </html>
  );
}
