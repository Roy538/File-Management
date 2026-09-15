import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

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
  _count: { instances: number };
}

interface Props {
  documentId: string;
  documentTitle: string;
  onClose: () => void;
  onStarted?: () => void;
}

export function StartWorkflowModal({ documentId, documentTitle, onClose, onStarted }: Props) {
  const qc = useQueryClient();
  const [selectedDefId, setSelectedDefId] = useState<string | null>(null);

  const { data: definitions, isLoading } = useQuery({
    queryKey: ['workflow-definitions'],
    queryFn: () => api.get<WorkflowDefinition[]>('/api/workflow-definitions'),
    staleTime: 60_000,
  });

  const startInstance = useMutation({
    mutationFn: (body: { documentId: string; workflowDefinitionId: string }) =>
      api.post('/api/workflow-instances', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-instances'] });
      onStarted?.();
      onClose();
    },
  });

  function handleStart() {
    if (!selectedDefId) return;
    startInstance.mutate({ documentId, workflowDefinitionId: selectedDefId });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">Start Workflow</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{documentTitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading workflows…</p>
          ) : !definitions?.length ? (
            <p className="text-sm text-gray-500">
              No workflow definitions available. An ADMIN must create one first.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Select Workflow
              </p>
              {definitions.map(def => {
                const steps = [...(def.steps ?? [])].sort((a, b) => a.order - b.order);
                return (
                  <button
                    key={def.id}
                    onClick={() => setSelectedDefId(def.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedDefId === def.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-900">{def.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {steps.map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && <span className="mx-1 text-gray-300">→</span>}
                          <span>{s.name}</span>
                          <span className="ml-0.5 text-gray-400">({s.assigneeRole})</span>
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {startInstance.isError && (
            <p className="text-xs text-red-600">Failed to start workflow. Please try again.</p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleStart}
              disabled={!selectedDefId || startInstance.isPending}
              className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 rounded-lg transition-colors"
            >
              {startInstance.isPending ? 'Starting…' : 'Start Workflow'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
