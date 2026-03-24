import { useState, useEffect, useCallback } from 'react'
import {
  getSyncStatus,
  onSyncStatusChange,
  fullPushToCloud,
  pullFromCloud,
  pushToCloud,
  initNetworkMonitoring,
  SyncStatus,
} from '../lib/syncEngine'
import type { AppState } from '../types'

export const useSync = (
  state: AppState,
  applyToState: (updates: Partial<AppState>) => void
) => {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus())

  useEffect(() => {
    initNetworkMonitoring()
    const unsub = onSyncStatusChange(setStatus)
    return unsub
  }, [])

  const manualSync = useCallback(async () => {
    await pushToCloud()
    await pullFromCloud(applyToState)
  }, [applyToState])

  const initialPull = useCallback(async () => {
    await pullFromCloud(applyToState)
  }, [applyToState])

  const fullPush = useCallback(async () => {
    await fullPushToCloud(state)
  }, [state])

  return {
    ...status,
    manualSync,
    initialPull,
    fullPush,
  }
}
