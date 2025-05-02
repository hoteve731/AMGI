'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

type EditNoteModalProps = {
    isOpen: boolean;
    onClose: () => void;
    contentId: string;
    initialTitle: string;
    initialIcon: string;
    onUpdate: (title: string, icon: string) => void;
}

export default function EditNoteModal({
    isOpen,
    onClose,
    contentId,
    initialTitle,
    initialIcon,
    onUpdate
}: EditNoteModalProps) {
    const [isVisible, setIsVisible] = useState(isOpen);
    const [title, setTitle] = useState(initialTitle);
    const [icon, setIcon] = useState(initialIcon || '');
    const [isUpdating, setIsUpdating] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const supabase = createClientComponentClient();

    // Handle modal open state
    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            setTitle(initialTitle);
            setIcon(initialIcon || '');
        }
    }, [isOpen, initialTitle, initialIcon]);

    // Handle client-side mounting for portal
    useEffect(() => {
        setIsMounted(true);
        return () => setIsMounted(false);
    }, []);

    // Close modal with animation
    const handleClose = () => {
        setIsVisible(false);
        setTimeout(() => {
            onClose();
        }, 300);
    };

    // Save changes
    const handleSave = async () => {
        if (!title.trim()) return;

        setIsUpdating(true);
        try {
            // Update via server-side API route
            const response = await fetch('/api/contents', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: contentId, title, icon }),
            });
            const result = await response.json();
            if (!response.ok) {
                console.error('Error updating note via API:', result.error || result);
                throw new Error(result.error || 'Failed to update note');
            }

            // Call the onUpdate callback with the new values
            onUpdate(title, icon);
            handleClose();
        } catch (error) {
            console.error('Error updating note:', error);
            alert('노트 업데이트 중 오류가 발생했습니다.');
        } finally {
            setIsUpdating(false);
        }
    };

    // Modal content
    const modalContent = (
        <AnimatePresence mode="wait">
            {(isOpen || isVisible) && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
                    onClick={handleClose}
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
                            <h3 className="text-lg font-semibold text-black flex items-center gap-1.5">
                                Edit note details
                            </h3>
                            <button
                                onClick={handleClose}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            {/* Icon input */}
                            <div className="mb-4">
                                <label className="block text-sm font-bold text-gray-700 mb-1">Icon</label>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="flex flex-wrap gap-2">
                                        {['📝', '📚', '📖', '✏️', '🔍', '💡', '🧠', '📊', '📈', '🗓️', '📌', '🏆'].map((emoji) => (
                                            <button
                                                key={emoji}
                                                type="button"
                                                onClick={() => setIcon(emoji)}
                                                className={`w-10 h-10 flex items-center justify-center text-xl rounded-lg hover:bg-gray-100 ${icon === emoji ? 'bg-purple-100 ring-2 ring-purple-500' : 'bg-gray-50'}`}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    value={icon}
                                    onChange={(e) => setIcon(e.target.value)}
                                    placeholder="or type emoji manually..."
                                    className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5f4bb6]"
                                    disabled={isUpdating}
                                    maxLength={2}
                                />
                                <div className="mt-2 flex items-center">
                                    <div className="w-12 h-12 rounded-full bg-[#F8F4F0] flex items-center justify-center text-2xl mr-3">
                                        {icon || '📄'}
                                    </div>
                                    <span className="text-sm text-gray-500">Preview</span>
                                </div>
                            </div>

                            {/* Title input */}
                            <div className="mb-4">
                                <label className="block text-sm font-bold text-gray-700 mt-2 mb-1">Title</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Enter note title"
                                    className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5f4bb6]"
                                    disabled={isUpdating}
                                />
                            </div>

                            {/* Save button */}
                            <button
                                onClick={handleSave}
                                disabled={isUpdating || !title.trim()}
                                className="w-full bg-[#5f4bb6] text-white font-bold py-2 px-4 rounded-lg disabled:opacity-30 mt-4"
                            >
                                {isUpdating ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return isMounted ? createPortal(modalContent, document.body) : null;
}