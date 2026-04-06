import React, { useState, useRef, useEffect, useMemo } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  dir?: 'rtl' | 'ltr';
}

/** Normalize Arabic text for fuzzy matching */
function normalize(s: string): string {
  return s
    .replace(/[\u0640]/g, '')           // remove tatweel ـ
    .replace(/[\u064B-\u065F]/g, '')    // remove tashkeel
    .replace(/[أإآ]/g, 'ا')             // normalize alef variants
    .replace(/ة/g, 'ه')                 // taa marbuta → ha
    .replace(/ى/g, 'ي')                 // alef maqsura → ya
    .replace(/ؤ/g, 'و')                 // waw hamza → waw
    .replace(/ئ/g, 'ي')                 // ya hamza → ya
    .toLowerCase()
    .trim();
}

function fuzzyMatch(text: string, query: string): boolean {
  const nText = normalize(text);
  const nQuery = normalize(query);
  if (!nQuery) return true;
  // Check if all query words appear in text (order-independent)
  const words = nQuery.split(/\s+/).filter(Boolean);
  return words.every(w => nText.includes(w));
}

export default function SearchableSelect({
  options, value, onChange, placeholder, required, className, dir,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find(o => o.value === value)?.label || '';

  const filtered = useMemo(() => {
    if (!query) return options;
    return options.filter(o => fuzzyMatch(o.label, query));
  }, [options, query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className={`relative ${className || ''}`} dir={dir}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); setQuery(''); }}
        className="w-full text-right bg-white border border-gray-300 rounded-lg px-3 py-2 flex items-center justify-between gap-2 hover:border-teal-400 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
      >
        <span className={selectedLabel ? 'text-gray-900' : 'text-gray-400'}>
          {selectedLabel || placeholder || '—'}
        </span>
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Hidden native select for form validation */}
      {required && (
        <select
          required
          value={value}
          onChange={() => {}}
          className="absolute opacity-0 w-0 h-0"
          tabIndex={-1}
        >
          <option value="">{placeholder}</option>
          {value && <option value={value}>{selectedLabel}</option>}
        </select>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden flex flex-col">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث..."
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none"
              dir="rtl"
            />
          </div>

          {/* Options list */}
          <div className="overflow-y-auto max-h-48">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400 text-center">لا توجد نتائج</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full text-right px-3 py-2 text-sm hover:bg-teal-50 transition-colors ${
                    opt.value === value ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
