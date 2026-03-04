import { useQuery } from 'react-query';
import { apiService } from '../services/api';

export function useTournaments() {
  return useQuery('tournaments', () => apiService.getTournaments(), {
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useAppHealth() {
  return useQuery('appHealth', () => apiService.checkHealth(), {
    refetchInterval: 30000,
    retry: 3,
    staleTime: 15000,
  });
}
