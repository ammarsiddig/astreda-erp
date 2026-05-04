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

  const resolveValue = (fieldName: string, value: unknown): string | null => {
    if (typeof value !== 'string' || !value) return null;
    type LookupEntry = { arr: { id: string; name: string }[] };
    const FIELD_LOOKUPS: Record<string, LookupEntry> = {
      salespersonId: { arr: state.salespeople },
      customerId:    { arr: state.customers },
      bankAccountId: { arr: state.bankAccounts },
      shipmentId:    { arr: state.shipments },
      cityId:        { arr: state.cities },
      partnerId:     { arr: state.partners },
      carId:         { arr: state.cars },
      categoryId:    { arr: state.expenseCategories },
      employeeId:    { arr: state.employees },
    };
    const lookup = FIELD_LOOKUPS[fieldName];
    if (!lookup) return null;
    const entity = lookup.arr.find(item => item.id === value);
    return entity ? `${entity.name} (ID: ${value})` : null;
  };

  const renderFieldValue = (value: unknown, fieldName?: string): React.ReactNode => {
    if (value === null || value === undefined)
      return <span className="text-slate-400 italic">—</span>;
    if (typeof value === 'boolean')
      return <span className={value ? 'text-emerald-700' : 'text-rose-700'}>{value ? 'نعم' : 'لا'}</span>;
    if (typeof value === 'object')
      return (
        <pre className="text-xs font-mono whitespace-pre-wrap break-all text-slate-600 bg-slate-100 rounded p-1.5 max-h-24 overflow-auto leading-relaxed">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    if (fieldName) {
      const resolved = resolveValue(fieldName, value);
      if (resolved) return <span className="break-all">{resolved}</span>;
    }
    return <span className="break-all">{String(value)}</span>;
  };

  const renderRecordTable = (record: Record<string, unknown>, headerBg: string, headerColor: string) => (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className={headerBg}>
            <th className="text-right px-3 py-2 font-semibold text-slate-600 w-2/5 border-b border-slate-200">{t('fieldName')}</th>
            <th className={`text-right px-3 py-2 font-semibold ${headerColor} w-3/5 border-b border-slate-200`}>{t('value')}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(record).map(([field, val]) => (
            <tr key={field} className="odd:bg-white even:bg-slate-50/50">
              <td className="px-3 py-2 font-mono text-xs text-slate-600 border-b border-slate-100 align-top">{field}</td>
              <td className="px-3 py-2 border-b border-slate-100 align-top">{renderFieldValue(val, field)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderDiffTable = (before: Record<string, unknown>, after: Record<string, unknown>): React.ReactNode => {
    const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const changedKeys = allKeys.filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    if (changedKeys.length === 0)
      return <p className="text-xs text-slate-400 italic">{t('noDetails')}</p>;
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-right px-3 py-2 font-semibold text-slate-600 w-1/4 border-b border-slate-200">{t('fieldName')}</th>
              <th className="text-right px-3 py-2 font-semibold text-rose-600 w-[37.5%] border-b border-slate-200">{t('oldValue')}</th>
              <th className="text-right px-3 py-2 font-semibold text-emerald-600 w-[37.5%] border-b border-slate-200">{t('newValue')}</th>
            </tr>
          </thead>
          <tbody>
            {changedKeys.map(field => (
              <tr key={field} className="odd:bg-white even:bg-slate-50/50">
                <td className="px-3 py-2 font-mono text-xs font-bold text-slate-800 border-b border-slate-100 align-top">{field}</td>
                <td className="px-3 py-2 text-rose-700 border-b border-slate-100 align-top">{renderFieldValue(before[field], field)}</td>
                <td className="px-3 py-2 text-emerald-700 border-b border-slate-100 align-top">{renderFieldValue(after[field], field)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const formatSimpleValue = (fieldName: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return '-';
    const resolved = resolveValue(fieldName, value);
    if (resolved) return resolved.replace(/ \(ID: .+\)$/, '');
    if (fieldName === 'date' && typeof value === 'string') return formatDateTimeValue(value, true);
    if (fieldName === 'paymentType') return value === 'cash' ? t('cash') : t('credit');
    if (typeof value === 'number') return new Intl.NumberFormat('en-US').format(value);
    if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
    return String(value);
  };

  const getFieldLabel = (fieldName: string): string => {
    const labels: Record<string, string> = {
      id: t('recordId'),
      date: t('date'),
      customerId: t('customer'),
      salespersonId: t('salesperson'),
      cityId: t('city'),
      carId: t('car'),
      shipmentId: t('shipments'),
      paymentType: t('paymentType'),
      bankAccountId: t('bankAccount'),
      productId: t('product'),
      qty: t('qty'),
      unitPrice: t('unitPrice'),
      total: t('total'),
      fromLocation: t('from'),
      toLocation: t('to'),
      type: t('type'),
      referenceId: 'المرجع',
      invoiceId: t('invoiceNumber'),
      amount: t('amount'),
      notes: t('notes'),
    };
    return labels[fieldName] || fieldName;
  };

  const productName = (productId: unknown) =>
    state.products.find(product => product.id === String(productId))?.name || String(productId || '-');

  const renderHumanRow = (label: string, before: string, after: string) => (
    <div key={`${label}-${before}-${after}`} className="grid grid-cols-[minmax(120px,1fr)_minmax(110px,1fr)_minmax(110px,1fr)] gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      <div className="font-semibold text-slate-700">{label}</div>
      <div className="text-rose-700">{before}</div>
      <div className="text-emerald-700">{after}</div>
    </div>
  );

  const renderInvoiceHumanSummary = (detail: AuditLogDetail): React.ReactNode => {
    if (detail.stateKey !== 'invoices' || !detail.snapshots) return null;
    const rows: React.ReactNode[] = [];
    Object.entries(detail.snapshots).forEach(([id, snap]) => {
      const before = snap.before;
      const after = snap.after;
      const title = `فاتورة ${id}`;
      if (before && after) {
        rows.push(<div key={`${id}-title`} className="text-sm font-bold text-slate-900">{title}</div>);
        ['date', 'customerId', 'salespersonId', 'cityId', 'carId', 'paymentType', 'bankAccountId', 'total'].forEach((field) => {
          if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
            rows.push(renderHumanRow(getFieldLabel(field), formatSimpleValue(field, before[field]), formatSimpleValue(field, after[field])));
          }
        });

        const beforeLines = new Map<string, any>((Array.isArray(before.lines) ? before.lines : []).map((line: any) => [String(line.productId), line]));
        const afterLines = new Map<string, any>((Array.isArray(after.lines) ? after.lines : []).map((line: any) => [String(line.productId), line]));
        const lineProductIds = [...new Set([...beforeLines.keys(), ...afterLines.keys()])];
        lineProductIds.forEach((productId) => {
          const oldLine = beforeLines.get(productId);
          const newLine = afterLines.get(productId);
          if (JSON.stringify(oldLine) === JSON.stringify(newLine)) return;
          const name = productName(productId);
          rows.push(<div key={`${id}-${productId}-product`} className="mt-2 text-sm font-semibold text-slate-800">{name}</div>);
          rows.push(renderHumanRow(t('qty'), oldLine ? formatSimpleValue('qty', oldLine.qty) : '-', newLine ? formatSimpleValue('qty', newLine.qty) : '-'));
          rows.push(renderHumanRow(t('unitPrice'), oldLine ? formatSimpleValue('unitPrice', oldLine.unitPrice) : '-', newLine ? formatSimpleValue('unitPrice', newLine.unitPrice) : '-'));
          rows.push(renderHumanRow(t('total'), oldLine ? formatSimpleValue('total', oldLine.total) : '-', newLine ? formatSimpleValue('total', newLine.total) : '-'));
        });
      } else if (after || before) {
        const record = after || before!;
        const isCreate = !!after;
        rows.push(
          <div key={`${id}-${isCreate ? 'create' : 'delete'}`} className={`text-sm font-bold ${isCreate ? 'text-emerald-700' : 'text-rose-700'}`}>
            {isCreate ? t('add') : t('delete')} {title}
          </div>
        );
        ['date', 'customerId', 'salespersonId', 'cityId', 'carId', 'paymentType', 'bankAccountId', 'total'].forEach((field) => {
          rows.push(renderHumanRow(getFieldLabel(field), isCreate ? '-' : formatSimpleValue(field, record[field]), isCreate ? formatSimpleValue(field, record[field]) : '-'));
        });
        (Array.isArray(record.lines) ? record.lines : []).forEach((line: any) => {
          const name = productName(line.productId);
          rows.push(<div key={`${id}-${line.productId}-line-${isCreate ? 'create' : 'delete'}`} className="mt-2 text-sm font-semibold text-slate-800">{name}</div>);
          rows.push(renderHumanRow(t('qty'), isCreate ? '-' : formatSimpleValue('qty', line.qty), isCreate ? formatSimpleValue('qty', line.qty) : '-'));
          rows.push(renderHumanRow(t('unitPrice'), isCreate ? '-' : formatSimpleValue('unitPrice', line.unitPrice), isCreate ? formatSimpleValue('unitPrice', line.unitPrice) : '-'));
          rows.push(renderHumanRow(t('total'), isCreate ? '-' : formatSimpleValue('total', line.total), isCreate ? formatSimpleValue('total', line.total) : '-'));
        });
      }
    });
    if (rows.length === 0) return null;
    return <div className="space-y-2 rounded-xl border border-cyan-100 bg-cyan-50/40 p-3">{rows}</div>;
  };

  const renderInventoryHumanSummary = (detail: AuditLogDetail): React.ReactNode => {
    if (detail.stateKey !== 'inventoryTransactions' || !detail.snapshots) return null;
    const rows = Object.entries(detail.snapshots).map(([id, snap]) => {
      const record = snap.after || snap.before;
      if (!record) return null;
      const action = snap.before && snap.after ? t('edit') : snap.after ? t('add') : t('delete');
      const color = snap.before && snap.after ? 'text-amber-700' : snap.after ? 'text-emerald-700' : 'text-rose-700';
      return (
        <div key={id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <div className={`font-bold ${color}`}>{action}: {productName(record.productId)}</div>
          <div className="mt-1 text-slate-600">
            {t('qty')}: {formatSimpleValue('qty', record.qty)} | {t('invoiceNumber')}: {formatSimpleValue('invoiceId', record.invoiceId || record.referenceId)}
          </div>
        </div>
      );
    }).filter(Boolean);
    if (rows.length === 0) return null;
    return <div className="space-y-2 rounded-xl border border-cyan-100 bg-cyan-50/40 p-3">{rows}</div>;
  };

  const renderHumanSummary = (detail: AuditLogDetail): React.ReactNode =>
    renderInvoiceHumanSummary(detail) || renderInventoryHumanSummary(detail);

  const renderDetailSection = (detail: AuditLogDetail) => {
    const moduleLabel = getModuleLabel(detail.stateKey);
    const hasSnapshots = !!detail.snapshots && Object.keys(detail.snapshots).length > 0;
    const hasLegacyData = !!detail.before || !!detail.after;
    const updatedSet = new Set(detail.updatedIds);
    const addedSet = new Set(detail.addedIds);
    const deletedSet = new Set(detail.deletedIds);
    const humanSummary = renderHumanSummary(detail);

    return (
      <div key={detail.stateKey} className="border border-slate-200 rounded-xl overflow-hidden">
        {/* Section header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <span className="font-semibold text-slate-800 text-sm">{moduleLabel}</span>
          <div className="flex items-center gap-2 text-xs">
            {detail.addedIds.length > 0 && (
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">{t('add')} {detail.addedIds.length}</span>
            )}
            {detail.updatedIds.length > 0 && (
              <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">{t('edit')} {detail.updatedIds.length}</span>
            )}
            {detail.deletedIds.length > 0 && (
              <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">{t('delete')} {detail.deletedIds.length}</span>
            )}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {humanSummary && (
            <div>
              <div className="text-xs font-bold text-cyan-700 mb-2">ملخص واضح</div>
              {humanSummary}
            </div>
          )}
          {hasSnapshots ? (
            // ── New entries: full per-record snapshots ──────────────────────
            <div className="space-y-6">
              {Object.entries(detail.snapshots!).map(([id, snap], idx) => {
                const isUpdate = updatedSet.has(id) || id === '_';
                const isCreate = addedSet.has(id);
                const isDelete = deletedSet.has(id);
                return (
                  <div key={id} className={idx > 0 ? 'pt-5 border-t border-slate-100' : ''}>
                    {id !== '_' && (
                      <div className="text-xs text-slate-400 font-mono mb-3">{t('recordId')}: {id}</div>
                    )}

                    {/* UPDATE: old data → new data → diff */}
                    {isUpdate && snap.before && snap.after && (
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 mb-2">
                            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                            {t('oldData')}
                          </div>
                          {renderRecordTable(snap.before, 'bg-rose-50', 'text-rose-600')}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 mb-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            {t('newData')}
                          </div>
                          {renderRecordTable(snap.after, 'bg-emerald-50', 'text-emerald-600')}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mb-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                            {t('changedFields')}
                          </div>
                          {renderDiffTable(snap.before, snap.after)}
                        </div>
                      </div>
                    )}

                    {/* CREATE: new data only */}
                    {isCreate && snap.after && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 mb-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          {t('newData')}
                        </div>
                        {renderRecordTable(snap.after, 'bg-emerald-50', 'text-emerald-600')}
                      </div>
                    )}

                    {/* DELETE: old data only */}
                    {isDelete && snap.before && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 mb-2">
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                          {t('oldData')}
                        </div>
                        {renderRecordTable(snap.before, 'bg-rose-50', 'text-rose-600')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : hasLegacyData ? (
            // ── Previous-session entries: first-record only, partial coverage ──
            <div className="space-y-4">
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {t('legacyEntry')}
              </div>
              {detail.before && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 mb-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                    {t('oldData')}
                  </div>
                  {renderRecordTable(detail.before, 'bg-rose-50', 'text-rose-600')}
                </div>
              )}
              {detail.after && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 mb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    {t('newData')}
                  </div>
                  {renderRecordTable(detail.after, 'bg-emerald-50', 'text-emerald-600')}
                </div>
              )}
              {detail.before && detail.after && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mb-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    {t('changedFields')}
                  </div>
                  {renderDiffTable(detail.before, detail.after)}
                </div>
              )}
            </div>
          ) : (
            // ── Very old entries: no snapshot data at all ──────────────────
            <div className="space-y-3">
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                {t('legacyEntry')}
              </div>
              {[
                { ids: detail.addedIds, label: t('add'), cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                { ids: detail.updatedIds, label: t('edit'), cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                { ids: detail.deletedIds, label: t('delete'), cls: 'bg-rose-50 text-rose-700 border-rose-200' },
              ]
                .filter(({ ids }) => ids.length > 0)
                .map(({ ids, label, cls }) => (
                  <div key={label}>
                    <div className="text-xs font-bold text-slate-600 mb-1.5">{label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ids.map(id => (
                        <span key={id} className={`inline-flex px-2 py-1 rounded-full text-xs font-mono border ${cls}`}>{id}</span>
                      ))}
                    </div>
                  </div>
                ))}
              {detail.changedFields.length > 0 && (
                <div className="text-xs text-slate-600">
                  <span className="font-semibold">{t('changedFields')}: </span>
                  {detail.changedFields.join(', ')}
                </div>
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
