import React from 'react';
import { ArrowDownAZ, ArrowUpZA, ArrowUpDown } from 'lucide-react';
import type { SortDirection } from '../hooks/useSortableData';

export function SortIcon({ direction, active }: { direction: SortDirection, active: boolean }) {
  if (!active || direction === null) {
    return <ArrowUpDown className="w-3.5 h-3.5 opacity-30 group-hover:opacity-100 transition-opacity" />;
  }
  if (direction === 'asc') {
    return <ArrowDownAZ className="w-3.5 h-3.5 text-[#134e4a]" />;
  }
  return <ArrowUpZA className="w-3.5 h-3.5 text-[#134e4a]" />;
}
