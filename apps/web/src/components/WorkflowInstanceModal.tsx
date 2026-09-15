import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuth } from '../lib/auth';

interface WorkflowStep {
  id: string;
  name: string;
  assigneeRole: 'ADMIN' | 'OFFICER';
  order: number;
}

interface HistoryEntry {
  stepId: string;
  stepName: string;
  action: 'APPROVED' | 'REJECTED' | 'CANCELLED';
  userId: string;
  userFullName: string;
  comment?: string;
  timestamp: string;
}

interface WorkflowInstance {
  id: string;
  status: string;
  currentState: string | null;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
  workflowDefinition: { id: string; name: string; steps: WorkflowStep[] };
  document: { id: string; title: string; status: string };
  initiatedBy: { id: string; firstName: string; lastName: string };
}

const STATUS_CLASSES: Record<string, string> = {
  PENDING:     'text-gray-700 bg-gray-100',
  IN_PROGRESS: 'text-blue-700 bg-blue-100',
  APPROVED:    'text-green-700 bg-green-100',
  REJECTED:    'text-red-700 bg-red-100',
  CANCELLED:   'text-gray-500 bg-gray-100',
};

interface Props {
  instanceId: string;
  onClose: () => void;
}

export function WorkflowInstanceModal({ instanceId, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');

  const { data: instance, isLoading } = useQuery({
    queryKey: ['workflow-instance', instanceId],
    queryFn: () => api.get<WorkflowInstance>(`/api/workflow-instances/${instanceId}`),
    staleTime: 30_000,
  });

  const takeAction = useMutation({
    mutationFn: (body: { action: string; comment?: string }) =>
      api.post(`/api/workflow-instances/${instanceId}/action`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-instance', instanceId] });
      qc.invalidateQueries({ queryKey: ['workflow-instances'] });
      setComment('');
    },
  });

  function act(action: 'APPROVE' | 'REJECT' | 'CANCEL') {
    takeAction.mutate({ action, ...(comment.trim() ? { comment: comment.trim() } : {}) });
  }

  if (isLoading || !instance) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl p-8 text-gray-400 text-sm">Loading…</div>
      </div>
    );
  }

  const steps = [...(instance.workflowDefinition.steps ?? [])].sort((a, b) => a.order - b.order);
  const history = instance.history as HistoryEntry[];
  const historyByStep = new Map(history.map(h => [h.stepId, h]));

  const currentStep = steps.find(s => s.id === instance.currentState);
  const isInProgress = instance.status === 'IN_PROGRESS';
  const canApproveReject =
    isInProgress &&
    currentStep &&
    (user?.role === 'ADMIN' || user?.role === currentStep.assigneeRole);
  const canCancel =
    isInProgress &&
    (user?.id === instance.initiatedBy.id || user?.role === 'ADMIN');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">{instance.workflowDefinition.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Link
                to={`/documents/${instance.document.id}/view`}
                onClick={onClose}
                className="text-xs text-blue-600 hover:underline truncate max-w-xs"
              >
                {instance.document.title} ↗
              </Link>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLASSES[instance.status] ?? ''}`}
              >
                {instance.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Started by {instance.initiatedBy.firstName} {instance.initiatedBy.lastName}
              {' · '}{new Date(instance.createdAt).toLocaleDateString()}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4">
            ×
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Step timeline */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Approval Steps
            </p>
            <div className="space-y-0">
              {steps.map((step, i) => {
                const entry = historyByStep.get(step.id);
                const isCurrent = instance.currentState === step.id && isInProgress;
                const isDone = !!entry;
                const isCancelled = instance.status === 'CANCELLED' && !isDone && isCurrent;

                let icon = '○';
                let iconClass = 'text-gray-300';
                let lineClass = 'bg-gray-200';
                let textClass = 'text-gray-400';

                if (isDone) {
                  if (entry!.action === 'APPROVED') {
                    icon = '✓'; iconClass = 'text-green-600'; lineClass = 'bg-green-200'; textClass = 'text-gray-700';
                  } else if (entry!.action === 'REJECTED') {
                    icon = '✗'; iconClass = 'text-red-600'; lineClass = 'bg-red-200'; textClass = 'text-gray-700';
                  } else {
                    icon = '⊘'; iconClass = 'text-gray-400'; textClass = 'text-gray-400';
                  }
                } else if (isCurrent) {
                  icon = '▶'; iconClass = 'text-blue-600'; textClass = 'text-gray-900 font-medium';
                } else if (isCancelled) {
                  icon = '⊘'; iconClass = 'text-gray-400';
                }

                return (
                  <div key={step.id} className="flex gap-3">
                    {/* Icon + connector line */}
                    <div className="flex flex-col items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${iconClass} border-2 ${
                        isDone ? 'border-current' : isCurrent ? 'border-blue-500' : 'border-gray-200'
                      } bg-white`}>
                        {icon}
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`w-0.5 flex-1 min-h-[24px] ${lineClass}`} />
                      )}
                    </div>

                    {/* Step content */}
                    <div className="flex-1 pb-4">
                      <div className={`text-sm ${textClass}`}>
                        {step.name}
                        <span className="ml-2 text-xs text-gray-400 font-normal">
                          ({step.assigneeRole})
                        </span>
                        {isCurrent && (
                          <span className="ml-2 text-xs text-blue-500 font-normal">← current</span>
                        )}
                      </div>
                      {entry && (
                        <div className="mt-1 text-xs text-gray-500 bg-gray-50 rounded-md px-2 py-1.5">
                          <span className="font-medium">{entry.userFullName}</span>
                          {' · '}{new Date(entry.timestamp).toLocaleString()}
                          {entry.comment && (
                            <p className="mt-0.5 text-gray-600 italic">"{entry.comment}"</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action section */}
          {(canApproveReject || canCancel) && (
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Your Action
                {currentStep && canApproveReject && (
                  <span className="ml-2 text-gray-400 font-normal normal-case">
                    Step: {currentStep.name}
                  </span>
                )}
              </p>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Optional comment…"
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex gap-2 flex-wrap">
                {canApproveReject && (
                  <>
                    <button
                      onClick={() => act('APPROVE')}
                      disabled={takeAction.isPending}
                      className="px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-300 rounded-lg transition-colors"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => act('REJECT')}
                      disabled={takeAction.isPending}
                      className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-lg transition-colors"
                    >
                      ✗ Reject
                    </button>
                  </>
                )}
                {canCancel && (
                  <button
                    onClick={() => act('CANCEL')}
                    disabled={takeAction.isPending}
                    className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Cancel Workflow
                  </button>
                )}
              </div>
              {takeAction.isError && (
                <p className="text-xs text-red-600">Action failed. Check your permissions and try again.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
