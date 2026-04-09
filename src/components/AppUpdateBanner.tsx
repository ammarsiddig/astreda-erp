import React, { useEffect, useState } from 'react';
import { RefreshCcw, X } from 'lucide-react';
import { activatePendingUpdate, subscribeAppUpdate } from '../lib/appUpdate';

export default function AppUpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    return subscribeAppUpdate((nextAvailable) => {
      setAvailable(nextAvailable);
      if (nextAvailable) setDismissed(false);
    });
  }, []);

  if (!available || dismissed) return null;

  return (
    <div className="fixed top-4 left-1/2 z-[10000] w-[min(92vw,42rem)] -translate-x-1/2 rounded-2xl border border-cyan-200 bg-white/95 px-4 py-3 shadow-[0_20px_60px_-20px_rgba(8,145,178,0.45)] backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
          <RefreshCcw className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">يوجد تحديث جديد للتطبيق</p>
          <p className="mt-1 text-sm text-slate-600">أعد التحميل للحصول على آخر نسخة وتفادي بقاء الملفات القديمة داخل التطبيق المثبت.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => activatePendingUpdate()}
              className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-700"
            >
              إعادة التحميل الآن
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              لاحقاً
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          aria-label="Dismiss update banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
