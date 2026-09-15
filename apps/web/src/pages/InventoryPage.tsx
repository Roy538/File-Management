import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ColumnDef, PaginationState } from '@tanstack/react-table';
import { api } from '../lib/api-client';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { Layout } from '../components/Layout';
import { CreateFileModal } from '../components/CreateFileModal';
import { ErrorState } from '../components/ErrorState';

interface FileRecord {
  id: string;
  fileNumber: string;
  customerName: string;
  status: string;
  currentLocation: string | null;
  volumeNumber: number;
  createdAt: string;
}

interface FilesResponse {
  data: FileRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function InventoryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [holderFilter, setHolderFilter] = useState('');
  const [dispatchedFrom, setDispatchedFrom] = useState('');
  const [dispatchedTo, setDispatchedTo] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['inventory', pagination, search, statusFilter, holderFilter, dispatchedFrom, dispatchedTo],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(pagination.pageIndex + 1),
        pageSize: String(pagination.pageSize),
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(holderFilter && { holder: holderFilter }),
        ...(dispatchedFrom && { dispatchedFrom }),
        ...(dispatchedTo && { dispatchedTo }),
      });
      return api.get<FilesResponse>(`/api/inventory?${params}`);
    },
    staleTime: 30_000,
    retry: 1,
  });

  const columns: ColumnDef<FileRecord, any>[] = [
    { accessorKey: 'fileNumber',     header: 'File #' },
    { accessorKey: 'customerName',   header: 'Customer Name' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
    },
    {
      accessorKey: 'currentLocation',
      header: 'Location',
      cell: ({ getValue }) => getValue<string | null>() ?? <span className="text-gray-400">—</span>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Registered',
      cell: ({ getValue }) => new Date(getValue<string>()).toLocaleDateString(),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <button
          onClick={() => navigate(`/inventory/${row.original.id}`)}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          View →
        </button>
      ),
    },
  ];

  return (
    <Layout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">File Inventory</h1>
            {data && (
              <p className="text-sm text-gray-500 mt-0.5">{data.total.toLocaleString()} files total</p>
            )}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            + Register File
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            placeholder="Search file # or customer name…"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPagination(p => ({ ...p, pageIndex: 0 }));
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setPagination(p => ({ ...p, pageIndex: 0 }));
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="RETURNED">Returned</option>
            <option value="ARCHIVED">Archived</option>
            <option value="MISSING">Missing</option>
          </select>
          <input
            type="text"
            placeholder="Search by holder…"
            value={holderFilter}
            onChange={e => {
              setHolderFilter(e.target.value);
              setPagination(p => ({ ...p, pageIndex: 0 }));
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Dispatched:</span>
            <input type="date" value={dispatchedFrom} onChange={e => { setDispatchedFrom(e.target.value); setPagination(p => ({ ...p, pageIndex: 0 })); }} className="border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" title="Dispatched from" />
            <span className="text-xs text-gray-400">–</span>
            <input type="date" value={dispatchedTo} onChange={e => { setDispatchedTo(e.target.value); setPagination(p => ({ ...p, pageIndex: 0 })); }} className="border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" title="Dispatched to" />
          </div>
          {(search || statusFilter || holderFilter || dispatchedFrom || dispatchedTo) && (
            <button
              onClick={() => {
                setSearch(''); setStatusFilter(''); setHolderFilter('');
                setDispatchedFrom(''); setDispatchedTo('');
                setPagination(p => ({ ...p, pageIndex: 0 }));
              }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Error state */}
        {isError && <ErrorState onRetry={refetch} />}

        {/* Table */}
        {!isError && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <DataTable
              data={data?.data ?? []}
              columns={columns}
              pageCount={data?.totalPages ?? 0}
              pagination={pagination}
              onPaginationChange={setPagination}
              isLoading={isLoading}
              enableSorting
              emptyMessage="No files found"
              emptyDescription={search || statusFilter ? 'Try adjusting your search or filters' : 'Register the first file to get started'}
            />
          </div>
        )}

        <CreateFileModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
        />
      </div>
    </Layout>
  );
}
