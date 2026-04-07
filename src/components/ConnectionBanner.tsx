import { useState, useEffect } from 'react'
import { getSyncStatus, onSyncStatusChange, SyncStatus } from '../lib/syncEngine'
import { WifiOff } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'

export default function ConnectionBanner() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus())

  useEffect(() => {
    const unsub = onSyncStatusChange(setStatus)
    return unsub
  }, [])

  if (status.isOnline) return null

  return (
    <div className="bg-red-600 text-white text-center text-sm font-medium py-2 px-4 flex items-center justify-center gap-2 z-50">
      <WifiOff className="w-4 h-4 flex-shrink-0" />
      <span>{t('offlineBanner') || 'أنت غير متصل بالإنترنت — التغييرات معلقة حتى يعود الاتصال'}</span>
    </div>
  )
}
