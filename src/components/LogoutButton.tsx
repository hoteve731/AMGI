'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
    const router = useRouter()
    // Use the consistent client creation function
    const supabase = createClient()

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.refresh()
        router.push('/auth') // Redirect to login page after logout
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