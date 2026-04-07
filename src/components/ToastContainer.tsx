import React, { useState, useEffect } from 'react'
import { subscribeToasts, getToasts, Toast } from '../lib/toast'
import { Check, X, Info } from 'lucide-react'

const iconMap = {
  success: Check,
  error: X,
  info: Info,
}

const colorMap = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-blue-600 text-white',
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>(getToasts())

  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map(toast => {
        const Icon = iconMap[toast.type]
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium pointer-events-auto animate-slide-up ${colorMap[toast.type]}`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span>{toast.message}</span>
          </div>
        )
      })}
    </div>
  )
}
