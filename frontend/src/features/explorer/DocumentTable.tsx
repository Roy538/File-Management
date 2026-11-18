import { Link } from 'react-router';
import { Lock } from 'lucide-react';
import type { DocumentSummary } from '@/lib/api/types';
import { FileIcon } from '@/components/ui/FileIcon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatBytes, formatRelative, formatDateTime } from '@/lib/format';

/** The folder's documents: a dense table on wide screens, a stacked list on phones. */
export function DocumentTable({ docs }: { docs: DocumentSummary[] }) {
  return (
    <>
      <table className="hidden w-full text-left text-[13.5px] md:table">
        <thead className="border-b border-rule text-[12.5px] text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Name</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Version</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Size</th>
            <th scope="col" className="px-4 py-2 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {docs.map((d) => (
            <tr key={d.id} className="hover:bg-navy-50/50">
              <td className="max-w-0 px-4 py-2">
                <div className="flex items-center gap-2">
                  <FileIcon contentType={d.contentType} />
                  <Link to={`/documents/${d.id}`} className="doc-title truncate text-[14.5px] text-ink hover:text-navy-800 hover:underline">
                    {d.title}
                  </Link>
                  {d.lockedBy ? <Lock className="size-3.5 shrink-0 text-warn" aria-label="Checked out" /> : null}
                </div>
                {d.fileName ? <p className="truncate pl-6 text-[12px] text-subtle">{d.fileName}</p> : null}
              </td>
              <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">v{d.currentVersionNo}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{d.sizeBytes ? formatBytes(d.sizeBytes) : '—'}</td>
              <td className="whitespace-nowrap px-4 py-2 text-muted" title={formatDateTime(d.updatedAt)}>{formatRelative(d.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-rule md:hidden">
        {docs.map((d) => (
          <li key={d.id} className="px-4 py-3">
            <Link to={`/documents/${d.id}`} className="flex items-start gap-2">
              <FileIcon contentType={d.contentType} className="mt-1" />
              <span className="min-w-0 flex-1">
                <span className="doc-title block truncate text-[15px] text-ink">{d.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                  <StatusBadge status={d.status} />
                  <span>v{d.currentVersionNo}</span>
                  <span>{formatRelative(d.updatedAt)}</span>
                  {d.lockedBy ? <Lock className="size-3.5 text-warn" aria-label="Checked out" /> : null}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
