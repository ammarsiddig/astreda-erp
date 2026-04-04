import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
}

const sizeMap: Record<string, string> = {
  sm:  'max-w-sm',
  md:  'max-w-md',
  lg:  'max-w-lg',
  xl:  'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

export default function Modal({ isOpen, onClose, title, children, size = 'lg' }: ModalProps) {
  const { lang } = useTranslation();
  const maxW = sizeMap[size] ?? 'max-w-lg';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className={`bg-white sm:rounded-2xl shadow-2xl w-full ${maxW} h-full sm:h-auto max-h-full sm:max-h-[90vh] overflow-y-auto`}
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dark navy header */}
            <div className="bg-[#134e4a] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between sticky top-0 z-10">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button
                onClick={onClose}
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Body */}
            <div className="px-6 py-5">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
