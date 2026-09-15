const STATUS_STYLES: Record<string, string> = {
  DRAFT:       'bg-gray-100 text-gray-600',
  CHECKED_IN:  'bg-green-100 text-green-700',
  CHECKED_OUT: 'bg-yellow-100 text-yellow-700',
  ON_HOLD:     'bg-orange-100 text-orange-700',
  FINALIZED:   'bg-blue-100 text-blue-700',
  ARCHIVED:    'bg-gray-200 text-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT:       'Draft',
  CHECKED_IN:  'Checked In',
  CHECKED_OUT: 'Checked Out',
  ON_HOLD:     'On Hold',
  FINALIZED:   'Finalized',
  ARCHIVED:    'Archived',
};

export function DocumentStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export const ALLOWED_DOC_TRANSITIONS: Record<string, string[]> = {
  DRAFT:       ['CHECKED_IN'],
  CHECKED_IN:  ['CHECKED_OUT', 'ON_HOLD', 'FINALIZED', 'ARCHIVED'],
  CHECKED_OUT: ['CHECKED_IN', 'ARCHIVED'],
  ON_HOLD:     ['CHECKED_IN', 'ARCHIVED'],
  FINALIZED:   ['ARCHIVED'],
  ARCHIVED:    [],
};
