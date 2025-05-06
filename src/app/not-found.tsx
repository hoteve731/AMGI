'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F3F5FD] px-4">
      {/* 404 Image and Message */}
      <div className="text-center mb-12">
        <div className="flex justify-center mb-4">
          <Image
            src="/images/loopaauth.png"
            alt="404"
            width={250}
            height={250}
            className="rounded-2xl"
          />
        </div>
        <h1 className="text-6xl font-bold text-black mb-4">404</h1>
        <h2 className="text-2xl text-gray-600 mb-6">
          Uh oh!
        </h2>
        <p className="text-lg text-gray-500 max-w-md mx-auto">
        The page you're looking for doesn't exist. <br></br>Why not go back and try again?
        </p>
      </div>

      {/* Home Button */}
      <div className="w-full max-w-md">
        <button
          onClick={() => router.push('/')}
          className="w-full bg-black text-white rounded-full py-3 px-4 text-lg font-semibold hover:bg-gray-800 transition-colors"
        >
          Go to Home
        </button>
      </div>
    </div>
  )
}