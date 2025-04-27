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
  title: "LOOPA - 진짜 기억을 위한 반복 도우미",
  description: "기억할 가치가 있는 아이디어, 이제 진정으로 내 머리 속에.",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://loopa.app",
    title: "LOOPA - 진짜 기억을 위한 반복 도우미",
    description: "기억할 가치가 있는 아이디어, 이제 진정으로 내 머리 속에.",
    siteName: "LOOPA",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "LOOPA - 진짜 기억을 위한 반복 도우미"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "LOOPA - 진짜 기억을 위한 반복 도우미",
    description: "기억할 가치가 있는 아이디어, 이제 진정으로 내 머리 속에.",
    images: ["/og-image.png"]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: "LOOPA - 진짜 기억을 위한 반복 도우미",
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
    <html lang="ko" className="bg-[#E8DED0]">
      <head>
        <script dangerouslySetInnerHTML={{ __html: firebaseConfigScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-gray-100`}>
        <div className="flex justify-center min-h-screen w-full">
          <div className="w-full max-w-[700px] bg-white min-h-screen shadow-2xl shadow-black/20 rounded-xl">
            {children}
          </div>
        </div>
        <UpdatePrompt />
        {/* <PushTest /> */}
      </body>
    </html>
  );
}
