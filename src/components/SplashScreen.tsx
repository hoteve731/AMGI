import Image from 'next/image'

export default function SplashScreen() {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#8B5CF6]">
            <div className="text-center">
                <div className="w-32 h-32 mx-auto mb-4 animate-bounce relative">
                    <Image
                        src="/icons/icon-512x512.png"
                        alt="LOOPA"
                        fill
                        className="object-contain"
                    />
                </div>
                <h1 className="text-2xl font-bold text-white">LOOPA</h1>
                <p className="mt-2 text-white/80">아이디어를 기록하고 효과적으로 학습하세요</p>
            </div>
        </div>
    );
} 