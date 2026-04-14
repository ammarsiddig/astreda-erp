import React, { useMemo, useState } from 'react';
import { ShieldCheck, Search } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { AuditLogEntry } from '../types';
import { TranslationKey } from '../lib/i18n';
import { formatDateTimeValue } from '../lib/utils';

const MODULE_LABEL_KEYS: Record<string, TranslationKey> = {
  products: 'products',
  salespeople: 'salespeople',
  cities: 'cities',
  cars: 'cars',
  bankAccounts: 'bankAccounts',
  shipments: 'shipments',
  employees: 'employees',
  partners: 'partners',
  expenseCategories: 'expenseCategories',
  customers: 'customers',
  inventoryTransactions: 'inventory',
  invoices: 'invoices',
  payments: 'payments',
  expenses: 'expenses',
  salaries: 'salaries',
  generalTransfers: 'generalTransfers',
  accountTransfers: 'accountTransfers',
  savedSettlements: 'shipmentSettlement',
  capitalContributions: 'capitalContributions',
  settlementResults: 'shipmentSettlement',
  shipmentTransfers: 'shipmentTransfer',
  roles: 'manageRoles',
  users: 'manageUsers',
  language: 'settings',
  userRole: 'settings',
  exchangeRate: 'exchangeRate',
  managementFeePercent: 'managementFeePercent',
  managementFeeRecipientId: 'managementFeeRecipient',
};

function getActionBadgeClasses(action: AuditLogEntry['action']) {
  if (action === 'create') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (action === 'delete') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (action === 'update') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export default function AuditLog() {
  const { t } = useTranslation();
  const { state } = useAppStore();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | AuditLogEntry['action']>('all');

  const logs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return [...state.auditLogs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .filter((entry) => {
        if (actionFilter !== 'all' && entry.action !== actionFilter) return false;
        if (!normalizedSearch) return true;
        const detailsText = entry.details
          .flatMap((detail) => [
            detail.stateKey,
            ...detail.addedIds,
            ...detail.updatedIds,
            ...detail.deletedIds,
            ...detail.changedFields,
          ])
          .join(' ')
          .toLowerCase();
        return `${entry.userName} ${detailsText}`.includes(normalizedSearch);
      });
  }, [actionFilter, search, state.auditLogs]);

  const totals = useMemo(() => ({
    created: logs.filter((entry) => entry.action === 'create').length,
    updated: logs.filter((entry) => entry.action === 'update').length,
    deleted: logs.filter((entry) => entry.action === 'delete').length,
  }), [logs]);

  const getModuleLabel = (stateKey: string) => {
    const labelKey = MODULE_LABEL_KEYS[stateKey];
    return labelKey ? t(labelKey) : stateKey;
  };

  const getActionLabel = (action: AuditLogEntry['action']) => {
    if (action === 'create') return t('created');
    if (action === 'update') return t('updated');
    if (action === 'delete') return t('deleted');
    return t('mixed');
  };

  const renderSummary = (entry: AuditLogEntry) => (
    <div className="space-y-2">
      {entry.details.map((detail) => {
        const parts: string[] = [];
        if (detail.addedIds.length > 0) parts.push(`${t('add')} ${detail.addedIds.length}`);
        if (detail.updatedIds.length > 0) parts.push(`${t('edit')} ${detail.updatedIds.length}`);
        if (detail.deletedIds.length > 0) parts.push(`${t('delete')} ${detail.deletedIds.length}`);
        if (detail.changedFields.length > 0) parts.push(detail.changedFields.join(', '));

        return (
          <div key={`${entry.id}-${detail.stateKey}`} className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{getModuleLabel(detail.stateKey)}:</span>{' '}
            <span>{parts.join(' | ')}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ecfeff] text-[#0f766e] border border-[#99f6e4] text-sm font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>{t('auditHistory')}</span>
            </div>
            <h1 className="mt-4 text-3xl font-bold text-slate-900">{t('auditLog')}</h1>
            <p className="mt-2 text-slate-500">{t('currentTime')}: {formatDateTimeValue(new Date(), true)}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 min-w-[280px]">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-xs text-emerald-700">{t('created')}</div>
              <div className="mt-1 text-2xl font-bold text-emerald-800">{totals.created}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-xs text-amber-700">{t('updated')}</div>
              <div className="mt-1 text-2xl font-bold text-amber-800">{totals.updated}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <div className="text-xs text-rose-700">{t('deleted')}</div>
              <div className="mt-1 text-2xl font-bold text-rose-800">{totals.deleted}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 left-3 rtl:left-auto rtl:right-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search')}
              className="w-full h-11 rounded-xl border border-slate-300 bg-white px-10 rtl:px-4 rtl:pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#14b8a6]"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as 'all' | AuditLogEntry['action'])}
            className="h-11 min-w-[180px] rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#14b8a6]"
          >
            <option value="all">{t('all')}</option>
            <option value="create">{t('created')}</option>
            <option value="update">{t('updated')}</option>
            <option value="delete">{t('deleted')}</option>
            <option value="mixed">{t('mixed')}</option>
          </select>
        </div>

        {logs.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-400">
            {t('noAuditLogs')}
          </div>
        ) : (
          <div className="space-y-4">
            {logs.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${getActionBadgeClasses(entry.action)}`}>
                        {getActionLabel(entry.action)}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{formatDateTimeValue(entry.timestamp, true)}</span>
                    </div>
                    <div className="text-sm text-slate-500">
                      {t('changedBy')}: <span className="font-semibold text-slate-700">{entry.userName}</span>
                    </div>
                    <div className="text-sm text-slate-500">
                      {t('modules')}: <span className="font-semibold text-slate-700">{entry.details.map((detail) => getModuleLabel(detail.stateKey)).join('، ')}</span>
                    </div>
                  </div>
                  <div className="xl:max-w-[65%]">
                    <div className="text-xs font-bold text-slate-500 mb-2">{t('summary')}</div>
                    {renderSummary(entry)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
