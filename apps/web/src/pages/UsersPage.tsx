import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../lib/api-client';
import { useAuth } from '../lib/auth';
import { Layout } from '../components/Layout';
import { ConfirmDialog } from '../components/ConfirmDialog';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'OFFICER' | 'DEPT_USER';
  branchId: string;
  businessUnitId: string;
  isActive: boolean;
  createdAt: string;
  branch: { name: string; code: string };
}

interface UsersResponse {
  data: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface BU     { id: string; name: string; code: string }
interface Branch { id: string; name: string; code: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, string> = {
  ADMIN:     'bg-purple-100 text-purple-700',
  OFFICER:   'bg-blue-100 text-blue-700',
  DEPT_USER: 'bg-gray-100 text-gray-600',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${ROLE_STYLES[role] ?? 'bg-gray-100 text-gray-600'}`}>
      {role.replace('_', ' ')}
    </span>
  );
}

// ── User form (shared by Create and Edit) ──────────────────────────────────────

interface FormValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  businessUnitId: string;
  branchId: string;
}

interface UserFormProps {
  initial?: Partial<FormValues>;
  isEdit?: boolean;
  onSubmit: (v: FormValues) => void;
  loading: boolean;
  serverError?: string;
}

function UserForm({ initial = {}, isEdit = false, onSubmit, loading, serverError }: UserFormProps) {
  const [firstName,      setFirstName]      = useState(initial.firstName      ?? '');
  const [lastName,       setLastName]       = useState(initial.lastName       ?? '');
  const [email,          setEmail]          = useState(initial.email          ?? '');
  const [password,       setPassword]       = useState('');
  const [role,           setRole]           = useState(initial.role           ?? 'OFFICER');
  const [buId,           setBuId]           = useState(initial.businessUnitId ?? '');
  const [branchId,       setBranchId]       = useState(initial.branchId       ?? '');

  const { data: businessUnits } = useQuery({
    queryKey: ['business-units'],
    queryFn: () => api.get<BU[]>('/api/auth/business-units'),
    staleTime: 300_000,
  });

  const { data: branches } = useQuery({
    queryKey: ['branches', buId],
    queryFn: () => api.get<Branch[]>(`/api/auth/business-units/${buId}/branches`),
    enabled: !!buId,
    staleTime: 300_000,
  });

  useEffect(() => {
    if (!isEdit) setBranchId('');
  }, [buId, isEdit]);

  const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <form
      onSubmit={e => { e.preventDefault(); onSubmit({ firstName, lastName, email, password, role, businessUnitId: buId, branchId }); }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
          <input value={firstName} onChange={e => setFirstName(e.target.value)} required className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
          <input value={lastName} onChange={e => setLastName(e.target.value)} required className={field} />
        </div>
      </div>

      {!isEdit && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className={field} placeholder="name@company.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="Min. 8 characters" className={field} />
          </div>
        </>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
        <select value={role} onChange={e => setRole(e.target.value)} className={`${field} bg-white`}>
          <option value="ADMIN">Admin</option>
          <option value="OFFICER">Officer</option>
          <option value="DEPT_USER">Dept User</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Business Unit</label>
        <select value={buId} onChange={e => setBuId(e.target.value)} required className={`${field} bg-white`}>
          <option value="">Select business unit…</option>
          {businessUnits?.map(bu => (
            <option key={bu.id} value={bu.id}>{bu.name} ({bu.code})</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
        <select value={branchId} onChange={e => setBranchId(e.target.value)} required disabled={!buId} className={`${field} bg-white disabled:bg-gray-50 disabled:text-gray-400`}>
          <option value="">Select branch…</option>
          {branches?.map(b => (
            <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
          ))}
        </select>
      </div>

      {serverError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <p className="text-xs text-red-700">{serverError}</p>
        </div>
      )}

      <button type="submit" disabled={loading} className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors">
        {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
      </button>
    </form>
  );
}

// ── Slide-over modal wrapper ──────────────────────────────────────────────────

function SlideOver({ open, onClose, title, subtitle, children }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
        <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function UsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const isAdmin = me?.role === 'ADMIN';

  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users', page],
    queryFn: () => api.get<UsersResponse>(`/api/users?page=${page}&pageSize=50`),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (body: FormValues) => api.post('/api/users', body),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowCreate(false);
      setFormError('');
      toast.success(`${v.firstName} ${v.lastName} added as ${v.role.replace('_', ' ')}`);
    },
    onError: (e: any) => setFormError(e?.message ?? 'Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<FormValues> }) =>
      api.patch(`/api/users/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditTarget(null);
      setFormError('');
      toast.success('User updated');
    },
    onError: (e: any) => setFormError(e?.message ?? 'Failed to update user'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      const name = `${deleteTarget?.firstName} ${deleteTarget?.lastName}`;
      setDeleteTarget(null);
      toast.success(`${name} deactivated`);
    },
    onError: () => {
      setDeleteTarget(null);
      toast.error('Failed to deactivate user');
    },
  });

  // Client-side filter (small user counts)
  const rows = (data?.data ?? []).filter(u => {
    const matchRole = !roleFilter || u.role === roleFilter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      u.firstName.toLowerCase().includes(q) ||
      u.lastName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.branch?.name.toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  return (
    <Layout>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Users</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage staff accounts and permissions</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => { setFormError(''); setShowCreate(true); }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New User
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email or branch…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={roleFilter}
            onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All roles</option>
            <option value="ADMIN">Admin</option>
            <option value="OFFICER">Officer</option>
            <option value="DEPT_USER">Dept User</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                  <div className="w-9 h-9 bg-gray-200 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 bg-gray-200 rounded w-40" />
                    <div className="h-3 bg-gray-100 rounded w-56" />
                  </div>
                  <div className="h-5 bg-gray-200 rounded-full w-20" />
                  <div className="h-4 bg-gray-100 rounded w-28" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">
                  {search || roleFilter ? 'No users match your search' : 'No users yet'}
                </p>
                {isAdmin && !search && !roleFilter && (
                  <p className="text-xs text-gray-400 mt-0.5">Add team members using the New User button</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['User', 'Role', 'Branch', 'Joined', isAdmin ? 'Actions' : ''].map(h => (
                        <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {u.firstName[0]}{u.lastName[0]}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{u.firstName} {u.lastName}</p>
                              <p className="text-xs text-gray-400">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4"><RoleBadge role={u.role} /></td>
                        <td className="px-6 py-4 text-gray-600 text-xs">{u.branch?.name} ({u.branch?.code})</td>
                        <td className="px-6 py-4 text-gray-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                        {isAdmin && (
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => { setFormError(''); setEditTarget(u); }}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                              >
                                Edit
                              </button>
                              {u.id !== me?.id && (
                                <button
                                  onClick={() => setDeleteTarget(u)}
                                  className="text-xs text-red-400 hover:text-red-600"
                                >
                                  Deactivate
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-gray-100">
                {rows.map(u => (
                  <div key={u.id} className="px-4 py-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {u.firstName[0]}{u.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{u.firstName} {u.lastName}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <RoleBadge role={u.role} />
                        <span className="text-xs text-gray-400">{u.branch?.name}</span>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <button onClick={() => { setFormError(''); setEditTarget(u); }} className="text-xs text-blue-600 font-medium">Edit</button>
                        {u.id !== me?.id && (
                          <button onClick={() => setDeleteTarget(u)} className="text-xs text-red-400">Remove</button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
            <span>Page {data.page} of {data.totalPages} ({data.total} total)</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40">
                Previous
              </button>
              <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}
                className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create slide-over */}
      <SlideOver open={showCreate} onClose={() => setShowCreate(false)} title="New User" subtitle="Add a staff member to the system">
        <UserForm
          onSubmit={v => createMutation.mutate(v)}
          loading={createMutation.isPending}
          serverError={formError}
        />
      </SlideOver>

      {/* Edit slide-over */}
      <SlideOver
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit User"
        subtitle={editTarget ? `${editTarget.firstName} ${editTarget.lastName}` : ''}
      >
        {editTarget && (
          <UserForm
            isEdit
            initial={{
              firstName: editTarget.firstName,
              lastName: editTarget.lastName,
              role: editTarget.role,
              businessUnitId: editTarget.businessUnitId,
              branchId: editTarget.branchId,
            }}
            onSubmit={v => updateMutation.mutate({
              id: editTarget.id,
              body: { firstName: v.firstName, lastName: v.lastName, role: v.role, businessUnitId: v.businessUnitId, branchId: v.branchId },
            })}
            loading={updateMutation.isPending}
            serverError={formError}
          />
        )}
      </SlideOver>

      {/* Deactivate confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Deactivate ${deleteTarget?.firstName} ${deleteTarget?.lastName}?`}
        description="They will lose access immediately. You can restore access later by contacting an admin."
        confirmLabel="Deactivate"
        onConfirm={() => deleteTarget && deactivateMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
        loading={deactivateMutation.isPending}
      />
    </Layout>
  );
}
