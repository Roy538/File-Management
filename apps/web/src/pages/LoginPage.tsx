import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api-client';

interface BU     { id: string; name: string; code: string; }
interface Branch { id: string; name: string; code: string; }

const IS_DEV = import.meta.env.DEV;

export function LoginPage() {
  const { login, devLogin, user } = useAuth();
  const navigate = useNavigate();

  const [businessUnits, setBusinessUnits] = useState<BU[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [buId, setBuId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    api.get<BU[]>('/api/auth/business-units')
      .then(data => { setBusinessUnits(data); setApiOnline(true); })
      .catch(() => setApiOnline(false));
  }, []);

  useEffect(() => {
    if (!buId) { setBranches([]); setBranchId(''); return; }
    api.get<Branch[]>(`/api/auth/business-units/${buId}/branches`)
      .then(b => { setBranches(b); setBranchId(''); })
      .catch(() => setBranches([]));
  }, [buId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password, branchId, businessUnitId: buId });
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err?.message ?? 'Invalid credentials — please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = () => {
    devLogin();
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo + title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4">
            <span className="text-white text-2xl">🗂️</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">File Tracking System</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to continue</p>
        </div>

        {/* Dev bypass banner — only shown in development when API is offline */}
        {IS_DEV && apiOnline === false && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-amber-500 text-lg mt-0.5">⚡</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">API server is offline</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Use dev preview to browse all pages without a running backend.
                </p>
              </div>
            </div>
            <button
              onClick={handleDevLogin}
              className="mt-3 w-full py-2.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 active:bg-amber-700 rounded-lg transition-colors"
            >
              Preview as Admin (Dev Mode)
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Business Unit */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Business Unit
              </label>
              <select
                value={buId}
                onChange={e => setBuId(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select business unit…</option>
                {businessUnits.map(bu => (
                  <option key={bu.id} value={bu.id}>{bu.name} ({bu.code})</option>
                ))}
              </select>
              {apiOnline === false && businessUnits.length === 0 && (
                <p className="text-xs text-red-500 mt-1">Cannot load — API is offline</p>
              )}
            </div>

            {/* Branch */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Branch</label>
              <select
                value={branchId}
                onChange={e => setBranchId(e.target.value)}
                required
                disabled={!buId || branches.length === 0}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">Select branch…</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !buId || !branchId}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Dev mode shortcut — always visible in dev, even when API is online */}
          {IS_DEV && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={handleDevLogin}
                className="w-full py-2 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors border border-dashed border-gray-300"
              >
                Dev shortcut: enter as Admin without credentials
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
