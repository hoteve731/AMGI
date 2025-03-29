'use client'

export default function CreateMemoryButton() {
    const handleClick = () => {
        const bottomSheet = document.getElementById('bottom-sheet')
        if (bottomSheet) {
            bottomSheet.classList.remove('hidden')
        }
    }

    return (
        <button
            onClick={handleClick}
            className="bg-purple-500 text-white px-4 py-2 rounded-full hover:bg-purple-600 transition-colors"
        >
            + Create Memory
        </button>
    )
} 