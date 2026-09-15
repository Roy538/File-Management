const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  AVAILABLE:  { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Available' },
  DISPATCHED: { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Dispatched' },
  RETURNED:   { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Returned' },
  ARCHIVED:   { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Archived' },
  MISSING:    { bg: 'bg-red-100',    text: 'text-red-800',    label: 'Missing' },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}
