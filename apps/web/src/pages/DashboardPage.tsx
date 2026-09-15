import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api-client';
import { Layout } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { CreateFileModal } from '../components/CreateFileModal';
import { ErrorState } from '../components/ErrorState';

interface DispatchItem {
  id: string;
  dispatchedTo: string;
  department: string;
  createdAt: string;
  expectedReturnAt: string | null;
  actualReturnAt: string | null;
  file: { fileNumber: string; customerName: string };
  dispatchedBy: { firstName: string; lastName: string };
}

interface ReturnItem {
  id: string;
  createdAt: string;
  actualReturnAt: string;
  file: { fileNumber: string; customerName: string };
  return: { createdAt: string; receivedBy: { firstName: string; lastName: string } } | null;
}

interface DashboardStats {
  totalFiles: number;
  available: number;
  dispatched: number;
  returned: number;
  archived: number;
  missing: number;
  inRegistry: number;
  overdue: number;
  dispatchedToday: number;
  returnedToday: number;
  recentDispatches: DispatchItem[];
  recentReturns: ReturnItem[];
  totalDocuments: number;
  checkedOutDocuments: number;
  pendingApprovals: number;
  unreadAlerts: number;
}

interface StatCardProps {
  label: string;
  value: number;
  color: 'green' | 'blue' | 'red' | 'orange' | 'gray' | 'indigo' | 'purple' | 'teal';
  sub?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}

const COLOR_MAP: Record<StatCardProps['color'], { bg: string; border: string; text: string; value: string }> = {
  green:  { bg: 'bg-green-50',   border: 'border-l-green-400',  text: 'text-green-700',  value: 'text-green-800'  },
  blue:   { bg: 'bg-blue-50',    border: 'border-l-blue-400',   text: 'text-blue-700',   value: 'text-blue-800'   },
  red:    { bg: 'bg-red-50',     border: 'border-l-red-400',    text: 'text-red-700',    value: 'text-red-800'    },
  orange: { bg: 'bg-orange-50',  border: 'border-l-orange-400', text: 'text-orange-700', value: 'text-orange-800' },
  gray:   { bg: 'bg-gray-50',    border: 'border-l-gray-300',   text: 'text-gray-600',   value: 'text-gray-800'   },
  indigo: { bg: 'bg-indigo-50',  border: 'border-l-indigo-400', text: 'text-indigo-700', value: 'text-indigo-800' },
  purple: { bg: 'bg-purple-50',  border: 'border-l-purple-400', text: 'text-purple-700', value: 'text-purple-800' },
  teal:   { bg: 'bg-teal-50',    border: 'border-l-teal-400',   text: 'text-teal-700',   value: 'text-teal-800'   },
};

function StatCard({ label, value, color, sub, icon, onClick }: StatCardProps) {
  const c = COLOR_MAP[color];
  return (
    <div
      onClick={onClick}
      className={`${c.bg} border-l-4 ${c.border} rounded-xl p-5 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <div className="flex items-start justify-between">
        <p className={`text-xs font-semibold uppercase tracking-wide ${c.text}`}>{label}</p>
        {icon && <span className={`text-lg opacity-60 ${c.text}`}>{icon}</span>}
      </div>
      <p className={`text-4xl font-bold mt-2 ${c.value}`}>{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function isOverdue(dispatch: DispatchItem) {
  return !dispatch.actualReturnAt && dispatch.expectedReturnAt && new Date(dispatch.expectedReturnAt) < new Date();
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>('/api/dashboard/stats'),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="p-6">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="h-4 w-64 bg-gray-100 rounded animate-pulse mb-8" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-gray-100 rounded-xl p-5 animate-pulse h-28" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (isError) {
    return (
      <Layout>
        <div className="p-6">
          <ErrorState
            title="Dashboard unavailable"
            message="Could not load dashboard statistics. Check that the API server is running."
            onRetry={refetch}
          />
        </div>
      </Layout>
    );
  }

  if (!data) return null;

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {data.totalFiles.toLocaleString()} files · {data.totalDocuments.toLocaleString()} documents in your registry
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            + Register File
          </button>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Register File
          </button>
          <Link
            to="/dispatch"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
            Pending Dispatches {data.dispatched > 0 && <span className="bg-blue-600 text-white rounded-full text-[10px] px-1.5 py-0.5">{data.dispatched}</span>}
          </Link>
          <Link
            to="/workflows"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>
            Workflows {data.pendingApprovals > 0 && <span className="bg-orange-500 text-white rounded-full text-[10px] px-1.5 py-0.5">{data.pendingApprovals}</span>}
          </Link>
        </div>

        {/* Primary stats — File Registry */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">File Registry</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="In Registry"
              value={data.inRegistry}
              color="green"
              icon="🗂️"
              sub={`${data.available} available · ${data.returned} returned`}
              onClick={() => navigate('/inventory')}
            />
            <StatCard
              label="Dispatched"
              value={data.dispatched}
              color="blue"
              icon="📤"
              sub="currently out"
              onClick={() => navigate('/dispatch')}
            />
            <StatCard
              label="Overdue"
              value={data.overdue}
              color={data.overdue > 0 ? 'red' : 'gray'}
              icon="⏰"
              sub="past expected return date"
              onClick={() => navigate('/dispatch')}
            />
            <StatCard
              label="Missing"
              value={data.missing}
              color={data.missing > 0 ? 'orange' : 'gray'}
              icon="🔍"
              sub="flagged missing"
              onClick={() => navigate('/inventory')}
            />
          </div>
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Dispatched Today" value={data.dispatchedToday} color="indigo" icon="↑" />
          <StatCard label="Returned Today"   value={data.returnedToday}   color="green"  icon="↓" />
          <StatCard label="Archived"         value={data.archived}        color="gray"   icon="📦" />
          <StatCard label="Total Files"      value={data.totalFiles}      color="gray"   onClick={() => navigate('/inventory')} />
        </div>

        {/* Document Management stats */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Document Management</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Documents"
              value={data.totalDocuments}
              color="teal"
              icon="📄"
              sub="across all cabinets"
              onClick={() => navigate('/cabinets')}
            />
            <StatCard
              label="Checked Out"
              value={data.checkedOutDocuments}
              color={data.checkedOutDocuments > 0 ? 'indigo' : 'gray'}
              icon="✏️"
              sub="currently being edited"
            />
            <StatCard
              label="Pending Approvals"
              value={data.pendingApprovals}
              color={data.pendingApprovals > 0 ? 'orange' : 'gray'}
              icon="⚙️"
              sub="workflows in progress"
              onClick={() => navigate('/workflows')}
            />
            <StatCard
              label="Unread Alerts"
              value={data.unreadAlerts}
              color={data.unreadAlerts > 0 ? 'red' : 'gray'}
              icon="🔔"
              sub="in your notification inbox"
            />
          </div>
        </div>

        {/* Recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Dispatches */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Recent Dispatches</h2>
              <button
                onClick={() => navigate('/dispatch')}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                View all →
              </button>
            </div>
            {data.recentDispatches.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-400">No dispatches yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {data.recentDispatches.map(d => (
                  <li key={d.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {d.file.fileNumber}
                        {isOverdue(d) && (
                          <span className="ml-2 text-xs text-red-600 font-semibold bg-red-50 px-1.5 py-0.5 rounded">
                            OVERDUE
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {d.file.customerName} → {d.dispatchedTo} ({d.department})
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent Returns */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Recent Returns</h2>
              <button
                onClick={() => navigate('/returns')}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                View all →
              </button>
            </div>
            {data.recentReturns.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-400">No returns yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {data.recentReturns.map(r => (
                  <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.file.fileNumber}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {r.file.customerName}
                        {r.return && ` · received by ${r.return.receivedBy.firstName} ${r.return.receivedBy.lastName}`}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {r.actualReturnAt ? new Date(r.actualReturnAt).toLocaleDateString() : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <CreateFileModal open={showCreate} onClose={() => setShowCreate(false)} />
    </Layout>
  );
}
