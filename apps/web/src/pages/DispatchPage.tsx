import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { ReturnModal } from '../components/ReturnModal';
import { ErrorState } from '../components/ErrorState';
import { useAuth } from '../lib/auth';

interface DispatchRow {
  id: string;
  fileId: string;
  dispatchedTo: string;
  department: string;
  reason: string | null;
  expectedReturnAt: string | null;
  actualReturnAt: string | null;
  createdAt: string;
  file: { fileNumber: string; customerName: string; currentLocation: string | null };
  dispatchedBy: { firstName: string; lastName: string };
  return: {
    createdAt: string;
    notes: string | null;
    receivedBy: { firstName: string; lastName: string };
  } | null;
}

interface DispatchListResponse {
  data: DispatchRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function fmt(dt: string | null) {
  return dt ? new Date(dt).toLocaleDateString() : '—';
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function DispatchPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pendingOnly, setPendingOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [returnTarget, setReturnTarget] = useState<DispatchRow | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [departmentInput, setDepartmentInput] = useState('');

  const search = useDebounce(searchInput, 300);
  const department = useDebounce(departmentInput, 300);

  const hasFilters = !!searchInput || !!departmentInput;

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (pendingOnly) params.set('pending', 'true');
  if (search) params.set('search', search);
  if (department) params.set('department', department);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dispatches', { pendingOnly, page, search, department }],
    queryFn: () => api.get<DispatchListResponse>(`/api/dispatches?${params}`),
    staleTime: 30_000,
  });

  const canReturn = user?.role !== 'DEPT_USER';

  function clearFilters() {
    setSearchInput('');
    setDepartmentInput('');
    setPage(1);
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Dispatches</h1>
            {data && (
              <span className="text-sm text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
                {data.total}
              </span>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-gray-600">Pending only</span>
            <button
              onClick={() => { setPendingOnly(v => !v); setPage(1); }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                pendingOnly ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  pendingOnly ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            placeholder="Search file # or customer…"
            value={searchInput}
            onChange={e => { setSearchInput(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Filter by department…"
            value={departmentInput}
            onChange={e => { setDepartmentInput(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700 underline self-center"
            >
              Clear filters
            </button>
          )}
        </div>

        {isError ? (
          <ErrorState
            title="Failed to load dispatches"
            message="Check your network connection and try again."
            onRetry={refetch}
          />
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-24" />
                    <div className="h-4 bg-gray-200 rounded w-32" />
                    <div className="h-4 bg-gray-200 rounded w-28" />
                    <div className="h-4 bg-gray-200 rounded w-20" />
                    <div className="h-4 bg-gray-200 rounded flex-1" />
                  </div>
                ))}
              </div>
            ) : !data?.data.length ? (
              <div className="flex flex-col items-center gap-3 py-16 px-8 text-center">
                <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    {hasFilters
                      ? 'No dispatches match your filters'
                      : pendingOnly
                      ? 'No pending dispatches'
                      : 'No dispatches found'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {hasFilters
                      ? 'Try adjusting your search or clearing the filters.'
                      : pendingOnly
                      ? 'All dispatched files have been returned.'
                      : 'Dispatch a file from its detail page to get started.'}
                  </p>
                  {hasFilters && (
                    <button onClick={clearFilters} className="mt-2 text-xs text-blue-600 hover:underline">
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      {[
                        'File #', 'Customer', 'Dispatched To', 'Department',
                        'Dispatched By', 'Dispatch Date', 'Expected Return', 'Status', 'Actions',
                      ].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.data.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{row.file.fileNumber}</td>
                        <td className="px-4 py-3 text-gray-700">{row.file.customerName}</td>
                        <td className="px-4 py-3 text-gray-700">{row.dispatchedTo}</td>
                        <td className="px-4 py-3 text-gray-700">{row.department}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {row.dispatchedBy.firstName} {row.dispatchedBy.lastName}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{fmt(row.createdAt)}</td>
                        <td className="px-4 py-3 text-gray-500">{fmt(row.expectedReturnAt)}</td>
                        <td className="px-4 py-3">
                          {row.actualReturnAt ? (
                            <StatusBadge status="RETURNED" />
                          ) : (
                            <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {!row.actualReturnAt && canReturn && (
                            <button
                              onClick={() => setReturnTarget(row)}
                              className="text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-md transition-colors"
                            >
                              Return
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
            <span>
              Page {data.page} of {data.totalPages} ({data.total} total)
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

      {returnTarget && (
        <ReturnModal
          dispatchId={returnTarget.id}
          fileNumber={returnTarget.file.fileNumber}
          fileId={returnTarget.fileId}
          onClose={() => setReturnTarget(null)}
        />
      )}
    </Layout>
  );
}
