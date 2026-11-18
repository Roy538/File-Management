import { File, FileImage, FileSpreadsheet, FileText, Presentation } from 'lucide-react';
import { fileKind } from '@/lib/format';
import { cn } from '@/lib/cn';

const tint = { pdf: 'text-danger', image: 'text-info', word: 'text-navy-700', sheet: 'text-ok', slides: 'text-warn', text: 'text-muted', file: 'text-muted' };

export function FileIcon({ contentType, className }: { contentType: string | null | undefined; className?: string }) {
  const kind = fileKind(contentType);
  const Icon = kind === 'image' ? FileImage : kind === 'sheet' ? FileSpreadsheet : kind === 'slides' ? Presentation
    : kind === 'pdf' || kind === 'word' || kind === 'text' ? FileText : File;
  return <Icon className={cn('size-4 shrink-0', tint[kind], className)} aria-hidden />;
}
