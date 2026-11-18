import type { DocumentStatus, Role } from './api/types';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');

export function formatRelative(iso: string, now = Date.now()): string {
  const diff = (now - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d ago`;
  return formatDate(iso);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export const statusLabel: Record<DocumentStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

/** "Officer Records" from "OFFICER"-style enum names. */
export const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replaceAll('_', ' ');

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export function fileKind(contentType: string | null | undefined): 'pdf' | 'image' | 'word' | 'sheet' | 'slides' | 'text' | 'file' {
  if (!contentType) return 'file';
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.includes('word')) return 'word';
  if (contentType.includes('sheet') || contentType.includes('excel') || contentType === 'text/csv') return 'sheet';
  if (contentType.includes('presentation') || contentType.includes('powerpoint')) return 'slides';
  if (contentType.startsWith('text/')) return 'text';
  return 'file';
}

/** How roles are named to people (never the enum spelling). */
const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Platform administrator',
  ADMIN: 'Administrator',
  OFFICER: 'Records officer',
  DEPT_USER: 'Department user',
};

export function roleLabel(role: Role, lower = false): string {
  const label = ROLE_LABELS[role];
  return lower ? label.toLowerCase() : label;
}

/** A calendar date from the API ("2026-11-18"), shown without any time-zone shift. */
export function formatDay(day: string | null | undefined): string {
  if (!day) return '—';
  const [y, m, d] = day.split('-').map(Number);
  return dateFmt.format(new Date(y!, m! - 1, d!));
}

/** Today as "YYYY-MM-DD" in the browser's zone (for date inputs). */
export function todayIso(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Whole days from one calendar date to another (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const ms = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y!, m! - 1, d!); };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}
