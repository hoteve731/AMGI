import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import UpdatePrompt from '@/components/UpdatePrompt'
import { AuthProvider } from '@/contexts/AuthContext';
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
  themeColor: "#F3F5FD",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL('https://loopa.my'),
  title: "LOOPA - AI notes for busy learners",
  description: "Master complex topics with ease, one note at a time",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://loopa.my",
    title: "LOOPA - AI notes for busy learners",
    description: "Master complex topics with ease, one note at a time",
    siteName: "LOOPA",
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: "LOOPA - AI notes for busy learners"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "LOOPA - AI notes for busy learners",
    description: "Master complex topics with ease, one note at a time",
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: "LOOPA - AI notes for busy learners"
      }
    ]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: "LOOPA - AI notes for busy learners",
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
    <html lang="ko" className="bg-[#F3F5FD]">
      <head>
        <script dangerouslySetInnerHTML={{ __html: firebaseConfigScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-gray-100`}>
        <div className="flex justify-center min-h-screen w-full">
          <div className="w-full max-w-[700px] bg-white min-h-screen shadow-2xl shadow-black/20 rounded-xl">
            <AuthProvider>
              {children}
            </AuthProvider>
          </div>
        </div>
        <UpdatePrompt />
        {/* <PushTest /> */}
      </body>
    </html>
  );
}
