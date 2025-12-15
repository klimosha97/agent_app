/**
 * Кастомные хуки для работы с API
 * Упрощают взаимодействие с бэкендом и управление состоянием
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import {
  TrackingStatus,
  PlayerFilters,
  SortOptions,
  PaginationParams,
} from '../types';

// === Типы для хуков ===

interface UseApiOptions {
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
  retry?: number;
}

// === Хук для работы с игроками ===

export function usePlayers(
  filters?: PlayerFilters,
  sort?: SortOptions,
  pagination?: PaginationParams,
  options?: UseApiOptions
) {
  return useQuery(
    ['players', filters, sort, pagination],
    () => apiService.getPlayers(filters, sort, pagination),
    {
      enabled: options?.enabled ?? true,
      refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
      retry: options?.retry ?? 1,
      staleTime: 5 * 60 * 1000, // 5 минут
    }
  );
}

export function usePlayer(playerId: string, options?: UseApiOptions) {
  return useQuery(
    ['player', playerId],
    () => apiService.getPlayer(playerId),
    {
      enabled: !!playerId && (options?.enabled ?? true),
      refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
      retry: options?.retry ?? 1,
    }
  );
}

export function usePlayerSearch(query: string, tournamentId?: number) {
  return useQuery(
    ['playerSearch', query, tournamentId],
    () => apiService.searchPlayers(query, tournamentId),
    {
      enabled: query.length >= 2,
      retry: 1,
      staleTime: 2 * 60 * 1000, // 2 минуты
    }
  );
}

export function useTrackedPlayers(tournamentId?: number, pagination?: PaginationParams) {
  return useQuery(
    ['trackedPlayers', tournamentId, pagination],
    () => apiService.getTrackedPlayers(tournamentId, pagination),
    {
      refetchOnWindowFocus: true,
      staleTime: 1 * 60 * 1000, // 1 минута
    }
  );
}

export function useTournamentPlayers(
  tournamentId: number,
  sort?: SortOptions,
  pagination?: PaginationParams
) {
  return useQuery(
    ['tournamentPlayers', tournamentId, sort, pagination],
    () => apiService.getTournamentPlayers(tournamentId, sort, pagination),
    {
      enabled: tournamentId !== undefined && tournamentId >= 0 && tournamentId <= 3,
      staleTime: 5 * 60 * 1000, // 5 минут
    }
  );
}

// === Хук для работы с турнирами ===

export function useTournaments() {
  return useQuery('tournaments', () => apiService.getTournaments(), {
    staleTime: 30 * 1000, // 30 секунд - чтобы players_count обновлялся быстрее
    refetchOnWindowFocus: true,
  });
}

export function useTournament(tournamentId: number) {
  return useQuery(
    ['tournament', tournamentId],
    () => apiService.getTournament(tournamentId),
    {
      enabled: tournamentId !== undefined && tournamentId >= 0 && tournamentId <= 3,
      staleTime: 10 * 60 * 1000, // 10 минут
    }
  );
}

export function useTournamentStats(tournamentId: number) {
  return useQuery(
    ['tournamentStats', tournamentId],
    () => apiService.getTournamentStats(tournamentId),
    {
      enabled: tournamentId !== undefined && tournamentId >= 0 && tournamentId <= 3,
      staleTime: 5 * 60 * 1000, // 5 минут
    }
  );
}

export function useTopPerformers(
  period: 'all_time' | 'last_round' = 'all_time',
  limit: number = 10,
  tournamentId?: number
) {
  return useQuery(
    ['topPerformers', period, limit, tournamentId],
    () => apiService.getTopPerformers(period, limit, tournamentId),
    {
      staleTime: 2 * 60 * 1000, // 2 минуты
    }
  );
}

// === Хуки для мутаций ===

export function useUpdatePlayerStatus() {
  const queryClient = useQueryClient();

  return useMutation(
    ({ playerId, status, notes }: { playerId: string; status: TrackingStatus; notes?: string }) =>
      apiService.updatePlayerStatus(playerId, status, notes),
    {
      onSuccess: () => {
        // Инвалидируем связанные запросы
        queryClient.invalidateQueries(['players']);
        queryClient.invalidateQueries(['trackedPlayers']);
        queryClient.invalidateQueries(['player']);
      },
      onError: (error) => {
        console.error('Failed to update player status:', error);
      },
    }
  );
}

// === Составной хук для страницы турнира ===

export function useTournamentPage(tournamentId: number) {
  const tournament = useTournament(tournamentId);
  const stats = useTournamentStats(tournamentId);
  const [sort, setSort] = useState<SortOptions>({ field: 'player_name', order: 'asc' });
  const [pagination, setPagination] = useState<PaginationParams>({ page: 1, per_page: 50 });

  const players = useTournamentPlayers(tournamentId, sort, pagination);

  return {
    tournament,
    stats,
    players,
    sort,
    setSort,
    pagination,
    setPagination,
  };
}

// === Хук для управления фильтрами и поиском ===

export function usePlayerFilters() {
  const [filters, setFilters] = useState<PlayerFilters>({});
  const [sort, setSort] = useState<SortOptions>({ field: 'player_name', order: 'asc' });
  const [pagination, setPagination] = useState<PaginationParams>({ page: 1, per_page: 50 });

  const players = usePlayers(filters, sort, pagination);

  const updateFilter = useCallback((key: keyof PlayerFilters, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
    setPagination((prev) => ({ ...prev, page: 1 })); // Сбрасываем на первую страницу
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
    setPagination({ page: 1, per_page: 50 });
  }, []);

  const updateSort = useCallback((field: string) => {
    setSort((prev) => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  return {
    filters,
    sort,
    pagination,
    players,
    updateFilter,
    clearFilters,
    updateSort,
    setSort,
    setPagination,
  };
}

// === Хук для отслеживаемых игроков ===

export function useTrackedPlayersPage() {
  const [tournamentFilter, setTournamentFilter] = useState<number>();
  const [pagination, setPagination] = useState<PaginationParams>({ page: 1, per_page: 50 });

  const trackedPlayers = useTrackedPlayers(tournamentFilter, pagination);
  const tournaments = useTournaments();

  return {
    trackedPlayers,
    tournaments,
    tournamentFilter,
    setTournamentFilter,
    pagination,
    setPagination,
  };
}

// === Хук для поиска и добавления игроков ===

export function usePlayerSearchWithState() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTournament, setSelectedTournament] = useState<number>();
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Дебаунсинг поискового запроса
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchResults = usePlayerSearch(debouncedQuery, selectedTournament);
  const updateStatus = useUpdatePlayerStatus();
  const tournaments = useTournaments();

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleStatusUpdate = useCallback(
    (playerId: string, status: TrackingStatus, notes?: string) => {
      return updateStatus.mutateAsync({ playerId, status, notes });
    },
    [updateStatus]
  );

  return {
    searchQuery,
    selectedTournament,
    setSelectedTournament,
    searchResults,
    tournaments,
    updateStatus,
    handleSearch,
    handleStatusUpdate,
  };
}

// === Хук для проверки состояния приложения ===

export function useAppHealth() {
  return useQuery('appHealth', () => apiService.checkHealth(), {
    refetchInterval: 30000, // Каждые 30 секунд
    retry: 3,
    staleTime: 15000, // 15 секунд
  });
}


