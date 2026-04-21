import { useQuery } from '@tanstack/react-query';
import api from '../api';
import { SlaStatusResponse, SlaConfigEntry } from '../../types';

/** Obtiene el estado SLA de todos los comercios y tareas activos. Refresca cada 5 minutos. */
export function useSlaStatus() {
  return useQuery<SlaStatusResponse>({
    queryKey: ['sla', 'status'],
    queryFn: () => api.get('/sla/status').then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
    staleTime:       4 * 60 * 1000,
  });
}

/** Obtiene la configuración SLA actual (solo para admin). */
export function useSlaConfig() {
  return useQuery<SlaConfigEntry[]>({
    queryKey: ['sla', 'config'],
    queryFn: () => api.get('/sla/config').then(r => r.data),
    staleTime: 60 * 1000,
  });
}
