import { useState, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig<T> {
  key: keyof T | null;
  direction: SortDirection;
}

function toComparableValue(value: any): string | number {
  if (value == null) return '';

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const timestamp = Date.parse(trimmed);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
    return trimmed.toLowerCase();
  }

  return value;
}

function compareValues(aValue: string | number, bValue: string | number, direction: SortDirection) {
  if (aValue < bValue) {
    return direction === 'asc' ? -1 : 1;
  }
  if (aValue > bValue) {
    return direction === 'asc' ? 1 : -1;
  }
  return 0;
}

export function useSortableData<T>(items: T[], config: SortConfig<T> | null = null) {
  const [sortConfig, setSortConfig] = useState<SortConfig<T> | null>(config);

  const sortedItems = useMemo(() => {
    let sortableItems = [...items];
    if (sortConfig !== null && sortConfig.key !== null && sortConfig.direction !== null) {
      sortableItems.sort((a, b) => {
        const key = sortConfig.key!;
        const aValue = toComparableValue(a[key]);
        const bValue = toComparableValue(b[key]);
        const primaryComparison = compareValues(aValue, bValue, sortConfig.direction);

        if (primaryComparison !== 0) {
          return primaryComparison;
        }

        if (key === 'date') {
          const aIdValue = toComparableValue((a as Record<string, unknown>).id);
          const bIdValue = toComparableValue((b as Record<string, unknown>).id);
          return compareValues(aIdValue, bIdValue, sortConfig.direction);
        }

        return 0;
      });
    }
    return sortableItems;
  }, [items, sortConfig]);

  const requestSort = (key: keyof T) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      // Third click removes sort (or could stay desc, we'll loop asc -> desc -> asc for simplicity, or asc->desc->none)
      direction = 'asc'; // Loop back to asc to keep it simple, or keep it strict 2-way toggle.
    }
    setSortConfig({ key, direction });
  };

  return { items: sortedItems, requestSort, sortConfig };
}
