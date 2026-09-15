import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/Layout';
import { ErrorState } from '../components/ErrorState';

interface AuditEntry {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string } | null;
}

interface AuditListResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const METHOD_STYLE: Record<string, string> = {
  POST:   'bg-blue-50 text-blue-700',
  PATCH:  'bg-amber-50 text-amber-700',
  PUT:    'bg-amber-50 text-amber-700',
  DELETE: 'bg-red-50 text-red-700',
  GET:    'bg-gray-100 text-gray-600',
};

const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [resource, setResource] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [method, setMethod] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (resource) params.set('resource', resource);
  if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
  if (dateTo) params.set('dateTo', new Date(dateTo + 'T23:59:59').toISOString());
  if (method) params.set('method', method);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit', { page, resource, dateFrom, dateTo, method }],
    queryFn: () => api.get<AuditListResponse>(`/api/audit?${params}`),
    staleTime: 15_000,
  });

  function clearAll() {
    setResource(''); setDateFrom(''); setDateTo(''); setMethod(''); setPage(1);
  }

  const hasFilters = !!(resource || dateFrom || dateTo || method);

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          {data && (
            <span className="text-sm text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
              {data.total.toLocaleString()} entries
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Resource</label>
              <input
                type="text"
                value={resource}
                onChange={e => { setResource(e.target.value); setPage(1); }}
                placeholder="e.g. inventory, dispatches"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Method</label>
              <select
                value={method}
                onChange={e => { setMethod(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All methods</option>
                {HTTP_METHODS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {hasFilters && (
              <button
                onClick={clearAll}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 underline transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {isError ? (
          <ErrorState
            title="Failed to load audit log"
            message="Check your network connection or permissions."
            onRetry={refetch}
          />
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex gap-4 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-32" />
                    <div className="h-4 bg-gray-200 rounded w-28" />
                    <div className="h-4 bg-gray-200 rounded w-20" />
                    <div className="h-4 bg-gray-200 rounded w-24" />
                    <div className="h-4 bg-gray-200 rounded flex-1" />
                  </div>
                ))}
              </div>
            ) : !data?.data.length ? (
              <div className="flex flex-col items-center gap-3 py-16 px-8 text-center">
                <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm font-medium text-gray-500">No audit entries found</p>
                {hasFilters && (
                  <button onClick={clearAll} className="text-xs text-blue-600 hover:underline">
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-5" />
                      {['Timestamp', 'User', 'Action', 'Resource', 'Resource ID', 'IP'].map(h => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.data.map(entry => {
                      const isExpanded = expandedIds.has(entry.id);
                      const hasMetadata = entry.metadata && Object.keys(entry.metadata).length > 0;
                      return (
                        <>
                          <tr
                            key={entry.id}
                            onClick={() => hasMetadata && toggleExpand(entry.id)}
                            className={`transition-colors ${hasMetadata ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-gray-50'}`}
                          >
                            <td className="px-4 py-3 text-center">
                              {hasMetadata && (
                                <span className={`text-gray-400 text-xs transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>
                                  ▶
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                              {new Date(entry.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {entry.user
                                ? `${entry.user.firstName} ${entry.user.lastName}`
                                : <span className="text-gray-400 italic">System</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  METHOD_STYLE[entry.action] ?? 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {entry.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900">{entry.resource}</td>
                            <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                              {entry.resourceId
                                ? entry.resourceId.slice(0, 12) + '…'
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{entry.ipAddress ?? '—'}</td>
                          </tr>
                          {isExpanded && hasMetadata && (
                            <tr key={`${entry.id}-meta`} className="bg-gray-50 border-b border-gray-100">
                              <td />
                              <td colSpan={6} className="px-4 py-3">
                                <pre className="text-xs bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap text-gray-700">
                                  {JSON.stringify(entry.metadata, null, 2)}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
            <span>
              Page {data.page} of {data.totalPages} ({data.total.toLocaleString()} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={data.page === 1}
                className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={data.page === data.totalPages}
                className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
