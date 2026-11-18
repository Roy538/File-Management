import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { DepartmentView } from './types';

export function useDepartments() {
  return useQuery({ queryKey: ['departments'], queryFn: () => api.get<DepartmentView[]>('/departments'), staleTime: 5 * 60_000 });
}

/** After any registry change: the file, the register, loans, requests and home figures may all have moved. */
export function useRefreshRegistry() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['records', 'dashboard', 'notifications']) void qc.invalidateQueries({ queryKey: [key] });
  };
}
