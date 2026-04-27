import React, { useMemo, useState } from 'react';
import { ShieldCheck, Search, FileText } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { AuditLogEntry, AuditLogDetail } from '../types';
import { TranslationKey } from '../lib/i18n';
import { formatDateTimeValue } from '../lib/utils';
import Modal from '../components/Modal';

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
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

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

  const renderDetailSection = (detail: AuditLogDetail) => {
    const moduleLabel = getModuleLabel(detail.stateKey);
    const hasBefore = !!detail.before;
    const hasAfter = !!detail.after;
    const isUpdate = (detail.updatedIds.length > 0) && hasBefore && hasAfter;
    const isCreate = (detail.addedIds.length > 0) && hasAfter && !hasBefore;
    const isDelete = (detail.deletedIds.length > 0) && hasBefore && !hasAfter;

    const allIds = [
      ...detail.addedIds.map(id => ({ id, op: 'add' as const })),
      ...detail.updatedIds.map(id => ({ id, op: 'edit' as const })),
      ...detail.deletedIds.map(id => ({ id, op: 'delete' as const })),
    ];

    return (
      <div key={detail.stateKey} className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
          <span className="font-semibold text-slate-800 text-sm">{moduleLabel}</span>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {detail.addedIds.length > 0 && (
              <span className="text-emerald-700">{t('add')} {detail.addedIds.length}</span>
            )}
            {detail.updatedIds.length > 0 && (
              <span className="text-amber-700">{t('edit')} {detail.updatedIds.length}</span>
            )}
            {detail.deletedIds.length > 0 && (
              <span className="text-rose-700">{t('delete')} {detail.deletedIds.length}</span>
            )}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {isUpdate && (
            <div>
              <div className="text-xs font-bold text-slate-500 mb-2">{t('changedFields')}</div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-right border border-slate-200 px-3 py-2 font-semibold text-slate-600 w-1/3">{t('fieldName')}</th>
                    <th className="text-right border border-slate-200 px-3 py-2 font-semibold text-rose-600 w-1/3">{t('before')}</th>
                    <th className="text-right border border-slate-200 px-3 py-2 font-semibold text-emerald-600 w-1/3">{t('after')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.changedFields.map(field => (
                    <tr key={field} className="odd:bg-white even:bg-slate-50">
                      <td className="border border-slate-200 px-3 py-2 font-mono text-xs text-slate-700">{field}</td>
                      <td className="border border-slate-200 px-3 py-2 text-rose-700 break-all">
                        {detail.before?.[field] !== undefined ? String(detail.before[field]) : '—'}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-emerald-700 break-all">
                        {detail.after?.[field] !== undefined ? String(detail.after[field]) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isCreate && (
            <div>
              <div className="text-xs font-bold text-emerald-600 mb-2">{t('after')}</div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-emerald-50">
                    <th className="text-right border border-slate-200 px-3 py-2 font-semibold text-slate-600 w-1/2">{t('fieldName')}</th>
                    <th className="text-right border border-slate-200 px-3 py-2 font-semibold text-emerald-600 w-1/2">{t('newValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(detail.after!).map(([field, value]) => (
                    <tr key={field} className="odd:bg-white even:bg-slate-50">
                      <td className="border border-slate-200 px-3 py-2 font-mono text-xs text-slate-700">{field}</td>
                      <td className="border border-slate-200 px-3 py-2 text-emerald-700 break-all">{String(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isDelete && (
            <div>
              <div className="text-xs font-bold text-rose-600 mb-2">{t('before')}</div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-rose-50">
                    <th className="text-right border border-slate-200 px-3 py-2 font-semibold text-slate-600 w-1/2">{t('fieldName')}</th>
                    <th className="text-right border border-slate-200 px-3 py-2 font-semibold text-rose-600 w-1/2">{t('oldValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(detail.before!).map(([field, value]) => (
                    <tr key={field} className="odd:bg-white even:bg-slate-50">
                      <td className="border border-slate-200 px-3 py-2 font-mono text-xs text-slate-700">{field}</td>
                      <td className="border border-slate-200 px-3 py-2 text-rose-700 break-all">{String(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isUpdate && !isCreate && !isDelete && (
            <div className="space-y-2">
              {allIds.length > 0 ? (
                <div>
                  <div className="text-xs font-bold text-slate-500 mb-2">{t('affectedRecords')}</div>
                  <div className="flex flex-wrap gap-2">
                    {allIds.map(({ id, op }) => (
                      <span key={id} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-mono border ${
                        op === 'add' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        op === 'delete' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              ) : detail.changedFields.length > 0 ? (
                <div className="text-sm text-slate-600">
                  <span className="font-semibold">{t('changedFields')}: </span>
                  {detail.changedFields.join(', ')}
                </div>
              ) : (
                <div className="text-sm text-slate-400 italic">{t('noDetails')}</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
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
                    <button
                      onClick={() => setSelectedEntry(entry)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {t('auditDetails')}
                    </button>
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

    {/* Audit detail modal */}
    <Modal
      isOpen={!!selectedEntry}
      onClose={() => setSelectedEntry(null)}
      title={t('auditDetails')}
      size="3xl"
    >
      {selectedEntry && (
        <div className="space-y-4">
          {/* Header summary */}
          <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-slate-200">
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${getActionBadgeClasses(selectedEntry.action)}`}>
              {getActionLabel(selectedEntry.action)}
            </span>
            <span className="text-sm text-slate-600">{formatDateTimeValue(selectedEntry.timestamp, true)}</span>
            <span className="text-sm text-slate-500">
              {t('changedBy')}: <span className="font-semibold text-slate-700">{selectedEntry.userName}</span>
            </span>
          </div>

          {/* Per-detail sections */}
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {selectedEntry.details.map(detail => renderDetailSection(detail))}
          </div>
        </div>
      )}
    </Modal>
    </>
  );
}
