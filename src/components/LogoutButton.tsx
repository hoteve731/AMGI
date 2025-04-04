'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
    const router = useRouter()
    const supabase = createClientComponentClient()

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.refresh()
    }

    return (
        <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm bg-white rounded-lg hover:bg-gray-50"
        >
            Logout
        </button>
    )
} 