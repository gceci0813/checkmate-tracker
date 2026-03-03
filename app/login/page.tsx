'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('Incorrect email or password.');
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: '#3D4F5F' }}
    >
      <div className="text-center mb-10">
        <div className="font-display text-4xl font-black text-white tracking-widest">✦ CHECKMATE</div>
        <div className="text-xs text-white/50 tracking-[3px] uppercase mt-1.5">Project Tracker</div>
      </div>

      <div className="bg-white rounded-xl p-9 w-[360px] max-w-[90vw] shadow-2xl animate-modal">
        <div className="text-[15px] font-semibold text-slate mb-1">Sign in</div>
        <div className="text-[13px] text-gray-400 mb-5">Access the Checkmate dashboard</div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@checkmate.com"
              required
              className="w-full border-2 border-gray-200 rounded-lg px-3.5 py-3 text-[14px] outline-none transition-colors focus:border-[#C12033]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full border-2 border-gray-200 rounded-lg px-3.5 py-3 text-[14px] outline-none transition-colors focus:border-[#C12033]"
            />
          </div>

          {error && (
            <div className="text-[12px] text-[#C12033] font-medium">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#C12033] hover:bg-[#9a1829] disabled:opacity-60 text-white rounded-lg py-3.5 text-[15px] font-bold transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>

      <div className="mt-6 text-[11px] text-white/25">Checkmate Government Relations — Confidential</div>
    </div>
  );
}
