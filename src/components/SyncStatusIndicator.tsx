import React, { useState, useEffect } from 'react'
import { getSyncStatus, onSyncStatusChange, SyncStatus } from '../lib/syncEngine'
import { AlertTriangle, Cloud, CloudOff, RefreshCw, Check } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'

export const SyncStatusIndicator: React.FC<{ onManualSync?: () => void }> = ({ onManualSync }) => {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus())

  useEffect(() => {
    const unsub = onSyncStatusChange(setStatus)
    return unsub
  }, [])

  return (
    <div className="flex items-center gap-1.5">
      {/* Online / Offline dot */}
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border"
        style={{
          background: status.connectionMode === 'online' ? '#ecfdf5' : status.connectionMode === 'degraded' ? '#fffbeb' : '#fef2f2',
          borderColor: status.connectionMode === 'online' ? '#a7f3d0' : status.connectionMode === 'degraded' ? '#fde68a' : '#fecaca',
          color: status.connectionMode === 'online' ? '#047857' : status.connectionMode === 'degraded' ? '#92400e' : '#b91c1c',
        }}
      >
        {status.connectionMode === 'online' && <Cloud className="w-3.5 h-3.5" />}
        {status.connectionMode === 'degraded' && <AlertTriangle className="w-3.5 h-3.5" />}
        {status.connectionMode === 'offline' && <CloudOff className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">
          {status.connectionMode === 'online'
            ? t('connected')
            : status.connectionMode === 'degraded'
            ? (t('degraded') || 'اتصال غير مستقر')
            : t('disconnected')}
        </span>
      </div>

      {/* Pending badge */}
      {status.pendingChanges > 0 && (
        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded text-[10px] font-bold">
          {status.pendingChanges}
        </span>
      )}

      {/* Syncing spinner */}
      {status.isSyncing && (
        <RefreshCw className="w-3.5 h-3.5 text-[#14b8a6] animate-spin" />
      )}

      {/* Synced checkmark */}
      {!status.isSyncing && status.lastSynced && status.pendingChanges === 0 && status.connectionMode === 'online' && (
        <Check className="w-3.5 h-3.5 text-emerald-500" />
      )}

      {/* Manual sync button */}
      {onManualSync && (
        <button
          onClick={() => { console.log('[sync] manual sync triggered'); onManualSync(); }}
          disabled={!status.isOnline || status.isSyncing}
          className="p-1 text-slate-400 hover:text-[#14b8a6] hover:bg-[#f0fdfa] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title={t('syncing')}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
