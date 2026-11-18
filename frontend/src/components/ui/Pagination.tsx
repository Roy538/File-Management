import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export function Pagination({ page, totalPages, totalElements, size, onPage }: {
  page: number; totalPages: number; totalElements: number; size: number; onPage: (p: number) => void;
}) {
  if (totalElements === 0) return null;
  const from = page * size + 1;
  const to = Math.min(totalElements, (page + 1) * size);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-rule px-4 py-2.5 text-[13px] text-muted">
      <span>{from}–{to} of {totalElements}</span>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page" icon={<ChevronLeft className="size-4" />} />
        <Button size="sm" variant="ghost" disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page" icon={<ChevronRight className="size-4" />} />
      </div>
    </div>
  );
}
