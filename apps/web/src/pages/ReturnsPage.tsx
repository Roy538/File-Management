import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/Layout';
import { ErrorState } from '../components/ErrorState';

interface ReturnRow {
  id: string;
  dispatchedTo: string;
  department: string;
  createdAt: string;
  actualReturnAt: string;
  file: { fileNumber: string; customerName: string };
  dispatchedBy: { firstName: string; lastName: string };
  return: {
    createdAt: string;
    notes: string | null;
    receivedBy: { firstName: string; lastName: string };
  } | null;
}

interface ReturnListResponse {
  data: ReturnRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function fmt(dt: string | null) {
  return dt ? new Date(dt).toLocaleString() : '—';
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function ReturnsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);

  const params = new URLSearchParams({ pending: 'false', page: String(page), pageSize: '20' });
  if (search) params.set('search', search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['returns', { page, search }],
    queryFn: () => api.get<ReturnListResponse>(`/api/dispatches?${params}`),
    staleTime: 30_000,
  });

  function clearFilters() {
    setSearchInput('');
    setPage(1);
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Returns</h1>
          {data && (
            <span className="text-sm text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
              {data.total}
            </span>
          )}
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
          {searchInput && (
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
            title="Failed to load returns"
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
                    <div className="h-4 bg-gray-200 rounded w-36" />
                    <div className="h-4 bg-gray-200 rounded w-28" />
                    <div className="h-4 bg-gray-200 rounded flex-1" />
                  </div>
                ))}
              </div>
            ) : !data?.data.length ? (
              <div className="flex flex-col items-center gap-3 py-16 px-8 text-center">
                <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    {searchInput ? 'No returns match your search' : 'No returns recorded yet'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {searchInput
                      ? 'Try a different search term.'
                      : 'Returned files will appear here once recorded.'}
                  </p>
                  {searchInput && (
                    <button onClick={clearFilters} className="mt-2 text-xs text-blue-600 hover:underline">
                      Clear search
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
                        'File #', 'Customer', 'Dispatched To', 'Dept',
                        'Dispatched', 'Returned', 'Received By', 'Notes',
                      ].map(h => (
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
                    {data.data.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{row.file.fileNumber}</td>
                        <td className="px-4 py-3 text-gray-700">{row.file.customerName}</td>
                        <td className="px-4 py-3 text-gray-700">{row.dispatchedTo}</td>
                        <td className="px-4 py-3 text-gray-700">{row.department}</td>
                        <td className="px-4 py-3 text-gray-500">{fmt(row.createdAt)}</td>
                        <td className="px-4 py-3 text-gray-500">{fmt(row.actualReturnAt)}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {row.return
                            ? `${row.return.receivedBy.firstName} ${row.return.receivedBy.lastName}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-400 italic text-xs max-w-[180px] truncate">
                          {row.return?.notes ?? '—'}
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
    </Layout>
  );
}
