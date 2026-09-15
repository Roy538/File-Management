import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api-client';

interface BU     { id: string; name: string; code: string; }
interface Branch { id: string; name: string; code: string; }

type Mode = 'admin' | 'staff';

const IS_DEV = import.meta.env.DEV;

export function LoginPage() {
  const { login, devLogin, user } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode]         = useState<Mode>('admin');
  const [businessUnits, setBUs] = useState<BU[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [buId, setBuId]         = useState('');
  const [branchId, setBranchId] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  // Load BUs once on mount
  useEffect(() => {
    api.get<BU[]>('/api/auth/business-units')
      .then(data => { setBUs(data); setApiOnline(true); })
      .catch(() => setApiOnline(false));
  }, []);

  // Load branches when BU selected
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
      if (mode === 'admin') {
        await login({ email, password });
      } else {
        await login({ email, password, branchId, businessUnitId: buId });
      }
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

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setBuId('');
    setBranchId('');
  };

  const staffReady = mode === 'staff' && buId && branchId;
  const canSubmit  = mode === 'admin' ? (email && password) : (staffReady && email && password);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo + title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-white text-3xl">🗂️</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">File Tracking System</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to continue</p>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">

          {/* Mode tabs */}
          <div className="flex border-b border-gray-100">
            <button
              type="button"
              onClick={() => switchMode('admin')}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                mode === 'admin'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/60'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              Admin Login
            </button>
            <button
              type="button"
              onClick={() => switchMode('staff')}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                mode === 'staff'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/60'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              Staff Login
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-4">

            {/* Staff-only: BU + Branch */}
            {mode === 'staff' && (
              <>
                {apiOnline === false && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <span className="text-red-500 text-sm">⚠</span>
                    <p className="text-xs text-red-700">API is offline — staff login unavailable. Use Admin Login instead.</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Unit</label>
                  <select
                    value={buId}
                    onChange={e => setBuId(e.target.value)}
                    required
                    disabled={apiOnline === false}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">Select business unit…</option>
                    {businessUnits.map(bu => (
                      <option key={bu.id} value={bu.id}>{bu.name} ({bu.code})</option>
                    ))}
                  </select>
                </div>

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

                <div className="border-t border-gray-100 pt-1" />
              </>
            )}

            {/* Admin hint */}
            {mode === 'admin' && (
              <p className="text-xs text-gray-400 -mb-1">
                System administrators sign in here with their global credentials.
              </p>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
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
              disabled={loading || !canSubmit}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors mt-2"
            >
              {loading ? 'Signing in…' : mode === 'admin' ? 'Sign in as Admin' : 'Sign in'}
            </button>
          </form>

          {/* Dev bypass */}
          {IS_DEV && (
            <div className="px-8 pb-6 -mt-2">
              <button
                onClick={handleDevLogin}
                className="w-full py-2 text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors border border-dashed border-gray-200"
              >
                ⚡ Dev shortcut — enter as Admin without credentials
              </button>
            </div>
          )}
        </div>

        {/* API offline fallback banner when in admin mode too */}
        {IS_DEV && apiOnline === false && mode === 'admin' && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-xs text-amber-700">
              API is offline. Admin login will also fail — use the dev shortcut above or start the API first.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
