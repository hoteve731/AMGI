"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

interface ContentInfo {
  id: string;
  title: string;
  groupCount: number;
  cardCount: number;
}

interface SideMenuProps {
  open: boolean;
  onClose: () => void;
  contents: ContentInfo[];
  onSelectContent: (contentId: string) => void;
}

const SideMenu: React.FC<SideMenuProps> = ({ open, onClose, contents, onSelectContent }) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="side-menu"
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ type: "tween", duration: 0.35 }}
          className="fixed top-0 left-0 h-full z-[9999] w-2/3 max-w-[340px] bg-white shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Image src="/logo.svg" alt="LOOPA Logo" width={28} height={28} />
              <span className="font-bold text-lg tracking-tight text-gray-900">LOOPA</span>
            </div>
            <button
              aria-label="메뉴 닫기"
              className="p-2 rounded hover:bg-gray-100 transition-colors duration-200"
              onClick={onClose}
            >
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" /></svg>
            </button>
          </div>
          {/* Content List */}
          <nav className="flex-1 overflow-y-auto py-3 px-2">
            {contents.length === 0 ? (
              <div className="text-gray-400 text-center mt-8">콘텐츠가 없습니다</div>
            ) : (
              <ul className="space-y-3">
                {contents.map((content) => (
                  <li key={content.id}>
                    <button
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                      onClick={() => onSelectContent(content.id)}
                    >
                      <div className="truncate font-medium text-gray-900 text-base">{content.title}</div>
                      <div className="text-xs text-gray-500 mt-1 flex gap-3">
                        <span>그룹 {content.groupCount}</span>
                        <span>기억카드 {content.cardCount}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        </motion.aside>
      )}
      {open && (
        <motion.div
          key="side-menu-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.32 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black z-[9998]"
          onClick={onClose}
        />
      )}
    </AnimatePresence>
  );
};

export default SideMenu;
