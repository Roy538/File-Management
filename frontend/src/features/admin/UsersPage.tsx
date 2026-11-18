import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, MoreHorizontal, Pencil, UserPlus, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import type { Paged, Role, UserView } from '@/lib/api/types';
import { useCan, useSession } from '@/features/auth/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu';
import { formatDateTime, roleLabel } from '@/lib/format';
import type { CatalogEntry } from './types';

const ROLES: Role[] = ['ADMIN', 'OFFICER', 'DEPT_USER'];
const PAGE_SIZE = 25;

export function UsersPage() {
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserView | null>(null);
  const [permsFor, setPermsFor] = useState<UserView | null>(null);
  const canManage = useCan('users:manage');
  const myId = useSession((s) => s.user?.id);

  const users = useQuery({
    queryKey: ['users', page],
    queryFn: () => api.get<Paged<UserView>>('/users', { page, size: PAGE_SIZE }),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Users"
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Users' }]}
        actions={canManage ? <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>Add user</Button> : null}
      />
      <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
        {users.isLoading ? <SkeletonRows cols={5} /> : users.isError ? <ErrorState error={users.error} onRetry={() => users.refetch()} /> :
          users.data && users.data.content.length === 0 ? (
            <EmptyState icon={<Users className="size-6" />} title="No users yet" />
          ) : (
            <table className="w-full text-left text-[13.5px]">
              <thead className="border-b border-rule bg-paper text-[12.5px] text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Last sign-in</th>
                  {canManage ? <th className="w-12 px-4 py-2"><span className="sr-only">Actions</span></th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {users.data?.content.map((u) => (
                  <tr key={u.id} className="hover:bg-navy-50/40">
                    <td className="px-4 py-2.5 font-medium text-ink">{u.firstName} {u.lastName}{u.id === myId ? <span className="ml-2 text-[12px] font-normal text-muted">(you)</span> : null}</td>
                    <td className="px-4 py-2.5 text-muted">{u.email}</td>
                    <td className="px-4 py-2.5">{roleLabel(u.role)}</td>
                    <td className="px-4 py-2.5"><UserStatus user={u} /></td>
                    <td className="px-4 py-2.5 text-muted">{formatDateTime(u.lastLoginAt)}</td>
                    {canManage ? (
                      <td className="px-4 py-1.5 text-right">
                        {u.id === myId ? null : (
                          <Menu>
                            <MenuTrigger className="rounded p-1.5 text-muted hover:bg-navy-50 hover:text-ink" aria-label={`Actions for ${u.firstName} ${u.lastName}`}>
                              <MoreHorizontal className="size-4" />
                            </MenuTrigger>
                            <MenuContent>
                              <MenuItem icon={<Pencil className="size-4" />} onSelect={() => setEditing(u)}>Change role or status</MenuItem>
                              <MenuItem icon={<KeyRound className="size-4" />} onSelect={() => setPermsFor(u)}>Adjust permissions</MenuItem>
                            </MenuContent>
                          </Menu>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        {users.data ? <Pagination page={users.data.page} totalPages={users.data.totalPages} totalElements={users.data.totalElements} size={PAGE_SIZE} onPage={setPage} /> : null}
      </div>
      <CreateUserDialog open={creating} onOpenChange={setCreating} />
      {editing ? <EditUserDialog user={editing} onClose={() => setEditing(null)} /> : null}
      {permsFor ? <PermissionsDialog user={permsFor} onClose={() => setPermsFor(null)} /> : null}
    </div>
  );
}

function UserStatus({ user }: { user: UserView }) {
  if (!user.active) return <span className="text-muted">Deactivated</span>;
  if (user.locked) return <span className="text-warn">Locked after failed sign-ins</span>;
  return <span className="text-ok">Active</span>;
}

const createSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter a first name').max(100),
  lastName: z.string().trim().min(1, 'Enter a last name').max(100),
  email: z.string().trim().email('Enter a valid email address').max(254),
  role: z.enum(['ADMIN', 'OFFICER', 'DEPT_USER']),
  temporaryPassword: z.string().min(12, 'Use at least 12 characters').max(72, 'Use at most 72 characters'),
});
type CreateValues = z.infer<typeof createSchema>;

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'DEPT_USER' },
  });
  const create = useMutation({
    mutationFn: (v: CreateValues) => api.post<UserView>('/users', v),
    onSuccess: (u) => {
      toast.success(`Added ${u.firstName} ${u.lastName}`);
      void qc.invalidateQueries({ queryKey: ['users'] });
      reset();
      onOpenChange(false);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'USER_EXISTS') setError('email', { message: e.message });
      else if (e instanceof ApiError && Object.keys(e.fieldErrors).length) {
        for (const [k, m] of Object.entries(e.fieldErrors)) setError(k as keyof CreateValues, { message: m });
      } else toast.error(e instanceof ApiError ? e.message : 'The user could not be added.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add user"
      description="They sign in with your organisation code, this email and the temporary password you set."
      footer={<>
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" type="submit" form="create-user" loading={create.isPending}>Add user</Button>
      </>}>
      <form id="create-user" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => create.mutate(v))} noValidate>
        <Field label="First name" error={errors.firstName?.message}>{(a) => <Input {...a} {...register('firstName')} autoFocus />}</Field>
        <Field label="Last name" error={errors.lastName?.message}>{(a) => <Input {...a} {...register('lastName')} />}</Field>
        <Field label="Email" error={errors.email?.message} className="sm:col-span-2">{(a) => <Input {...a} type="email" {...register('email')} />}</Field>
        <Field label="Role" error={errors.role?.message}>
          {(a) => <Select {...a} {...register('role')}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</Select>}
        </Field>
        <Field label="Temporary password" hint="12–72 characters. Share it with them privately." error={errors.temporaryPassword?.message}>
          {(a) => <Input {...a} type="password" autoComplete="new-password" {...register('temporaryPassword')} />}
        </Field>
      </form>
    </Dialog>
  );
}

function EditUserDialog({ user, onClose }: { user: UserView; onClose: () => void }) {
  const qc = useQueryClient();
  const [role, setRole] = useState<Role>(user.role);
  const [active, setActive] = useState(user.active);
  const save = useMutation({
    mutationFn: () => api.put<UserView>(`/users/${user.id}`, { role, active }),
    onSuccess: () => {
      toast.success('Changes saved');
      void qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });
  const unchanged = role === user.role && active === user.active;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${user.firstName} ${user.lastName}`} width="sm"
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={active ? 'primary' : 'danger'} loading={save.isPending} disabled={unchanged} onClick={() => save.mutate()}>Save changes</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <Field label="Role">
          {(a) => (
            <Select {...a} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {(ROLES.includes(user.role) ? ROLES : [user.role, ...ROLES]).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </Select>
          )}
        </Field>
        <label className="flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" className="size-4 accent-navy-800" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Account active
        </label>
        <p className="rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn">
          Saving ends {user.firstName}’s current sessions. They’ll need to sign in again{active ? '' : ', and a deactivated account cannot sign in at all'}.
        </p>
      </div>
    </Dialog>
  );
}

type Override = 'default' | 'grant' | 'deny';

function PermissionsDialog({ user, onClose }: { user: UserView; onClose: () => void }) {
  const qc = useQueryClient();
  const catalog = useQuery({ queryKey: ['permission-catalog'], queryFn: () => api.get<CatalogEntry[]>('/users/permission-catalog') });
  const current = useQuery({
    queryKey: ['users', user.id, 'permissions'],
    queryFn: () => api.get<{ grant: string[]; deny: string[] }>(`/users/${user.id}/permissions`),
  });
  const [edited, setEdited] = useState<Record<string, Override>>({});
  // Start from the user's saved adjustments; local edits sit on top until saved.
  const choices: Record<string, Override> = {
    ...Object.fromEntries((current.data?.grant ?? []).map((n) => [n, 'grant' as Override])),
    ...Object.fromEntries((current.data?.deny ?? []).map((n) => [n, 'deny' as Override])),
    ...edited,
  };
  const setChoices = (fn: (c: Record<string, Override>) => Record<string, Override>) => setEdited((e) => fn({ ...choices, ...e }));
  const save = useMutation({
    mutationFn: () => api.put<void>(`/users/${user.id}/permissions`, {
      grant: Object.keys(choices).filter((k) => choices[k] === 'grant'),
      deny: Object.keys(choices).filter((k) => choices[k] === 'deny'),
    }),
    onSuccess: () => {
      toast.success('Permissions updated');
      void qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Permissions for ${user.firstName} ${user.lastName}`} width="lg"
      description={`Starts from what a ${roleLabel(user.role, true)} can do. Grant adds a permission; deny removes one.`}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Update permissions</Button>
      </>}>
      <p className="mb-3 rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn">
        Saving ends {user.firstName}’s current sessions. You can only grant permissions you hold yourself.
      </p>
      {catalog.isLoading || current.isLoading ? <SkeletonRows rows={8} cols={2} /> : catalog.isError || current.isError
        ? <ErrorState error={catalog.error ?? current.error} compact onRetry={() => { void catalog.refetch(); void current.refetch(); }} /> : (
        <table className="w-full text-[13.5px]">
          <thead className="text-left text-[12.5px] text-muted">
            <tr><th className="py-1.5 font-medium">Permission</th><th className="w-40 py-1.5 font-medium">Adjustment</th></tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {catalog.data?.map((p) => (
              <tr key={p.name}>
                <td className="py-1.5 pr-3">{permissionLabel(p.code)}</td>
                <td className="py-1.5">
                  <Select aria-label={`Adjustment for ${permissionLabel(p.code)}`} className="h-8"
                    value={choices[p.name] ?? 'default'}
                    onChange={(e) => setChoices((c) => ({ ...c, [p.name]: e.target.value as Override }))}>
                    <option value="default">Role default</option>
                    <option value="grant">Grant</option>
                    <option value="deny">Deny</option>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialog>
  );
}

/** "documents:lock_override" → "Documents: lock override". */
function permissionLabel(code: string): string {
  const [resource = '', action = ''] = code.split(':');
  const r = resource.replaceAll('_', ' ');
  return `${r.charAt(0).toUpperCase()}${r.slice(1)}: ${action.replaceAll('_', ' ')}`;
}
