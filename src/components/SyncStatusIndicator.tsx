import React, { useState, useEffect } from 'react'
import { getSyncStatus, onSyncStatusChange, SyncStatus } from '../lib/syncEngine'
import { Cloud, CloudOff, RefreshCw, Check } from 'lucide-react'

export const SyncStatusIndicator: React.FC<{ onManualSync?: () => void }> = ({ onManualSync }) => {
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
          background: status.isOnline ? '#ecfdf5' : '#fef2f2',
          borderColor: status.isOnline ? '#a7f3d0' : '#fecaca',
          color: status.isOnline ? '#047857' : '#b91c1c',
        }}
      >
        {status.isOnline
          ? <Cloud className="w-3.5 h-3.5" />
          : <CloudOff className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">
          {status.isOnline ? 'متصل' : 'غير متصل'}
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
        <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
      )}

      {/* Synced checkmark */}
      {!status.isSyncing && status.lastSynced && status.pendingChanges === 0 && status.isOnline && (
        <Check className="w-3.5 h-3.5 text-emerald-500" />
      )}

      {/* Manual sync button */}
      {onManualSync && (
        <button
          onClick={() => { console.log('[sync] manual sync triggered'); onManualSync(); }}
          disabled={!status.isOnline || status.isSyncing}
          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="مزامنة يدوية"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
