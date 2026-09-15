import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../lib/api-client';
import { useAuth } from '../lib/auth';
import { Layout } from '../components/Layout';
import { WorkflowInstanceModal } from '../components/WorkflowInstanceModal';
import { ConfirmDialog } from '../components/ConfirmDialog';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WorkflowStep {
  id: string;
  name: string;
  assigneeRole: 'ADMIN' | 'OFFICER';
  order: number;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  steps: WorkflowStep[];
  isActive: boolean;
  createdAt: string;
  _count: { instances: number };
}

interface WorkflowInstance {
  id: string;
  status: string;
  currentState: string | null;
  createdAt: string;
  workflowDefinition: { id: string; name: string; steps: WorkflowStep[] };
  document: { id: string; title: string };
  initiatedBy: { id: string; firstName: string; lastName: string };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_CLASSES: Record<string, string> = {
  PENDING:     'text-gray-600 bg-gray-100',
  IN_PROGRESS: 'text-blue-700 bg-blue-100',
  APPROVED:    'text-green-700 bg-green-100',
  REJECTED:    'text-red-700 bg-red-100',
  CANCELLED:   'text-gray-500 bg-gray-100',
};

function getCurrentStepName(instance: WorkflowInstance): string {
  if (!instance.currentState) return '—';
  const step = instance.workflowDefinition.steps?.find(
    s => s.id === instance.currentState,
  );
  return step?.name ?? instance.currentState;
}

// ── Definitions tab ────────────────────────────────────────────────────────────

interface NewStep {
  id: string;
  name: string;
  assigneeRole: 'ADMIN' | 'OFFICER';
  order: number;
}

function DefinitionsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';

  const [showCreate, setShowCreate] = useState(false);
  const [defName, setDefName] = useState('');
  const [steps, setSteps] = useState<NewStep[]>([
    { id: 'step-1', name: '', assigneeRole: 'OFFICER', order: 1 },
  ]);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowDefinition | null>(null);

  const { data: definitions, isLoading } = useQuery({
    queryKey: ['workflow-definitions'],
    queryFn: () => api.get<WorkflowDefinition[]>('/api/workflow-definitions'),
    staleTime: 60_000,
  });

  const createDef = useMutation({
    mutationFn: (body: { name: string; steps: NewStep[] }) =>
      api.post('/api/workflow-definitions', body),
    onSuccess: (_, { name }) => {
      qc.invalidateQueries({ queryKey: ['workflow-definitions'] });
      setShowCreate(false);
      setDefName('');
      setSteps([{ id: 'step-1', name: '', assigneeRole: 'OFFICER', order: 1 }]);
      toast.success(`Workflow "${name}" created`);
    },
    onError: () => toast.error('Failed to create workflow definition'),
  });

  const deleteDef = useMutation({
    mutationFn: (id: string) => api.delete(`/api/workflow-definitions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-definitions'] });
      toast.success(`Workflow "${deleteTarget?.name}" deleted`);
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error('Cannot delete — there may be active instances');
      setDeleteTarget(null);
    },
  });

  function addStep() {
    const next = steps.length + 1;
    setSteps(s => [...s, { id: `step-${next}-${Date.now()}`, name: '', assigneeRole: 'OFFICER', order: next }]);
  }

  function removeStep(i: number) {
    setSteps(s => s.filter((_, idx) => idx !== i).map((st, idx) => ({ ...st, order: idx + 1 })));
  }

  function updateStep(i: number, field: keyof NewStep, value: string | number) {
    setSteps(s => s.map((st, idx) => idx === i ? { ...st, [field]: value } : st));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const valid = steps.filter(s => s.name.trim());
    if (!defName.trim() || !valid.length) return;
    createDef.mutate({ name: defName.trim(), steps: valid });
  }

  if (isLoading) {
    return (
      <div className="space-y-2 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowCreate(v => !v)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
          >
            {showCreate ? 'Cancel' : '+ New Definition'}
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && isAdmin && (
        <form
          onSubmit={handleCreate}
          className="border border-purple-200 rounded-lg p-4 bg-purple-50 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              value={defName}
              onChange={e => setDefName(e.target.value)}
              placeholder="e.g. Document Approval"
              required
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Steps</label>
              <button
                type="button"
                onClick={addStep}
                className="text-xs text-purple-600 hover:text-purple-800 font-medium"
              >
                + Add Step
              </button>
            </div>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={step.id} className="flex gap-2 items-center">
                  <span className="text-xs text-gray-400 w-5 shrink-0">{i + 1}.</span>
                  <input
                    value={step.name}
                    onChange={e => updateStep(i, 'name', e.target.value)}
                    placeholder="Step name"
                    required
                    className="flex-1 border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <select
                    value={step.assigneeRole}
                    onChange={e => updateStep(i, 'assigneeRole', e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="OFFICER">OFFICER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="text-red-400 hover:text-red-600 text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {createDef.isError && (
            <p className="text-xs text-red-600">Failed to create. Please try again.</p>
          )}

          <button
            type="submit"
            disabled={createDef.isPending}
            className="w-full py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 rounded-lg"
          >
            {createDef.isPending ? 'Creating…' : 'Create Workflow Definition'}
          </button>
        </form>
      )}

      {/* Definitions table */}
      {!definitions?.length ? (
        <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
          <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
          </svg>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">No workflow definitions yet</p>
            {isAdmin && (
              <p className="text-xs text-gray-400 mt-0.5">Create one to start routing documents for approval</p>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Steps</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Instances</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                {isAdmin && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {definitions.map(def => {
                const sorted = [...(def.steps ?? [])].sort((a, b) => a.order - b.order);
                return (
                  <tr key={def.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{def.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {sorted.map((s, i) => (
                          <span key={s.id} className="flex items-center gap-0.5 text-xs text-gray-600">
                            {i > 0 && <span className="text-gray-300 mx-0.5">→</span>}
                            <span className="bg-gray-100 rounded px-1.5 py-0.5">{s.name}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{def._count.instances}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(def.createdAt).toLocaleDateString()}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setDeleteTarget(def)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description={
          deleteTarget?._count.instances
            ? `This definition has ${deleteTarget._count.instances} instance(s). Deleting it may affect existing workflows.`
            : 'This action cannot be undone.'
        }
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteDef.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteDef.isPending}
      />
    </div>
  );
}

// ── Instances tab ──────────────────────────────────────────────────────────────

function InstancesTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: instances, isLoading } = useQuery({
    queryKey: ['workflow-instances', statusFilter],
    queryFn: () =>
      api.get<WorkflowInstance[]>(
        `/api/workflow-instances${statusFilter ? `?status=${statusFilter}` : ''}`,
      ),
    staleTime: 30_000,
  });

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600 font-medium">Status:</label>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !instances?.length ? (
        <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
          <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
          </svg>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">
              {statusFilter ? `No ${statusFilter.toLowerCase().replace('_', ' ')} instances` : 'No workflow instances yet'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Start a workflow from a document's detail page</p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Workflow</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Document</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Step</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Initiated By</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {instances.map(inst => (
                <tr
                  key={inst.id}
                  onClick={() => setSelectedId(inst.id)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {inst.workflowDefinition.name}
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                    {inst.document.title}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLASSES[inst.status] ?? ''}`}
                    >
                      {inst.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {getCurrentStepName(inst)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {inst.initiatedBy.firstName} {inst.initiatedBy.lastName}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(inst.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <WorkflowInstanceModal instanceId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = 'instances' | 'definitions';

export function WorkflowsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('instances');

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Workflows</h1>
            <p className="text-sm text-gray-500 mt-0.5">Document approval chains and workflow history</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {(['instances', ...(user?.role === 'ADMIN' ? ['definitions'] : [])] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'instances' && <InstancesTab />}
        {tab === 'definitions' && <DefinitionsTab />}
      </div>
    </Layout>
  );
}
