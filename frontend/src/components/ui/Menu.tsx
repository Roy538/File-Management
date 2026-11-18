import * as DM from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className="z-50 min-w-48 rounded-md border border-rule bg-surface p-1 shadow-pop"
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function MenuItem({ children, onSelect, danger, icon, disabled }: {
  children: ReactNode; onSelect?: () => void; danger?: boolean; icon?: ReactNode; disabled?: boolean;
}) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-sm outline-none',
        'data-[highlighted]:bg-navy-50 data-[disabled]:cursor-not-allowed data-[disabled]:text-subtle',
        danger ? 'text-danger' : 'text-ink',
      )}
    >
      {icon}
      {children}
    </DM.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2.5 pb-1 pt-2 text-[12px] text-muted">{children}</DM.Label>;
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-rule" />;
}
