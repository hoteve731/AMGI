'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Snippet } from '@/utils/snippetUtils';
import { motion, AnimatePresence } from 'framer-motion';

type SnippetSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  snippets: Snippet[];
  title: string;
};

export default function SnippetSelectionModal({
  isOpen,
  onClose,
  snippets,
  title
}: SnippetSelectionModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // 모달이 열려있을 때 스크롤 방지
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  // 스니펫 선택 핸들러
  const handleSelectSnippet = (snippetId: string) => {
    router.push(`/snippets/${snippetId}`);
    onClose();
  };

  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // 스니펫 타입에 따른 배지 색상
  const getSnippetTypeBadge = (type: string) => {
    switch (type) {
      case 'summary':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800">Summary</span>
      case 'question':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">Question</span>
      case 'explanation':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">Explanation</span>
      case 'custom':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800">Custom</span>
      default:
        return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800">Other</span>
    }
  };

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white rounded-lg shadow-xl w-full max-w-md z-10 max-h-[80vh] flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-lg">
              <h3 className="text-lg font-semibold">{title}</h3>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="overflow-y-auto p-4 flex-1">
              <p className="text-sm text-gray-500 mb-4">
                Select the snippet you want to view.
              </p>
              
              <div className="space-y-3">
                {snippets.map(snippet => (
                  <div
                    key={snippet.id}
                    className="p-3 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-colors"
                    onClick={() => handleSelectSnippet(snippet.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium">{snippet.header_text}</div>
                      {getSnippetTypeBadge(snippet.snippet_type)}
                    </div>
                    {snippet.created_at && (
                      <div className="text-xs text-gray-500">
                        {formatDate(snippet.created_at)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
