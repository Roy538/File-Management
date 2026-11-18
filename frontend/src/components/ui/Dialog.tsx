import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' };

/** Accessible modal: focus trap, Escape to close, labelled by its title (Radix Dialog). */
export function Dialog({ open, onOpenChange, title, description, children, footer, width = 'md' }: DialogProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-navy-950/40" />
        <RD.Content
          className={cn(
            'fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] -translate-x-1/2 rounded-lg bg-surface shadow-pop',
            'max-h-[76vh] flex flex-col', widths[width],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
            <div>
              <RD.Title className="doc-title text-lg text-ink">{title}</RD.Title>
              {description ? <RD.Description className="mt-0.5 text-[13px] text-muted">{description}</RD.Description> : null}
            </div>
            <RD.Close className="rounded p-1 text-muted hover:bg-navy-50 hover:text-ink" aria-label="Close">
              <X className="size-4" />
            </RD.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-rule px-5 py-3">{footer}</div> : null}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
