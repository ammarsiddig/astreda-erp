import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Eye, EyeOff, LogIn } from 'lucide-react';

export default function Login() {
  const { login } = useAppStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(username, password);
      if (!result.success) {
        setError(result.error || 'خطأ غير معروف');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#134e4a] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo-medium.png" alt="أستريدا" className="w-24 h-24 mx-auto mb-3 object-contain" />
          <h1 className="text-3xl font-bold text-amber-400 tracking-wide">أستريدا</h1>
          <p className="text-slate-400 mt-1 text-sm">نظام التوزيع</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-slate-800 text-center mb-6">تسجيل الدخول</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">اسم المستخدم</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
                placeholder="أدخل اسم المستخدم"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm pl-10"
                  placeholder="أدخل كلمة المرور"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm font-medium text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-[#134e4a] text-white py-3 rounded-lg hover:bg-[#0c3531] font-semibold transition-colors shadow-sm text-sm disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              {loading ? 'جاري التحقق...' : 'دخول'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">أستريدا للتوزيع — نظام إدارة التوزيع</p>
      </div>
    </div>
  );
}
