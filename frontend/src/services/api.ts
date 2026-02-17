/**
 * API сервис для взаимодействия с бэкендом
 * Централизованное управление всеми HTTP запросами
 */

import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import {
  PlayerListResponse,
  PlayerDetailResponse,
  PlayerSearchResponse,
  Tournament,
  TournamentListResponse,
  TournamentStats,
  TopPerformersResponse,
  FileUploadResponse,
  TrackingStatus,
  PlayerFilters,
  SortOptions,
  PaginationParams,
  ApiError,
} from '../types';

class ApiService {
  private api: AxiosInstance;
  private baseURL: string;

  constructor() {
    // Определяем базовый URL API
    // Используем относительный путь /api, который будет проксироваться на бэкенд
    this.baseURL = process.env.REACT_APP_API_BASE_URL || '/api';
    
    // Создаём экземпляр axios
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 300000, // 5 минут для больших файлов
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Настраиваем перехватчики
    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Перехватчик запросов
    this.api.interceptors.request.use(
      (config) => {
        // Логируем запросы в dev режиме
        if (process.env.NODE_ENV === 'development') {
          console.log('📤 API Request:', config.method?.toUpperCase(), config.url);
        }
        return config;
      },
      (error) => {
        console.error('📤 Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Перехватчик ответов
    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        // Логируем успешные ответы в dev режиме
        if (process.env.NODE_ENV === 'development') {
          console.log('📥 API Response:', response.status, response.config.url);
        }
        return response;
      },
      (error: AxiosError) => {
        // Обрабатываем ошибки
        console.error('📥 Response Error:', error.response?.status, error.config?.url);
        return Promise.reject(this.handleError(error));
      }
    );
  }

  private handleError(error: AxiosError): ApiError {
    // Стандартизируем формат ошибок
    if (error.response?.data) {
      return error.response.data as ApiError;
    }

    return {
      success: false,
      error: error.code || 'UNKNOWN_ERROR',
      message: error.message || 'Произошла неизвестная ошибка',
      status_code: error.response?.status || 500,
    };
  }

  // === Методы для работы с игроками ===

  async getPlayers(
    filters?: PlayerFilters,
    sort?: SortOptions,
    pagination?: PaginationParams
  ): Promise<PlayerListResponse> {
    const params = new URLSearchParams();

    // Добавляем фильтры
    if (filters?.tournament_id !== undefined) {
      params.append('tournament_id', filters.tournament_id.toString());
    }
    if (filters?.team_name) {
      params.append('team_name', filters.team_name);
    }
    if (filters?.position) {
      params.append('position', filters.position);
    }
    if (filters?.tracking_status) {
      params.append('tracking_status', filters.tracking_status);
    }
    if (filters?.min_goals !== undefined) {
      params.append('min_goals', filters.min_goals.toString());
    }
    if (filters?.min_assists !== undefined) {
      params.append('min_assists', filters.min_assists.toString());
    }
    if (filters?.min_minutes !== undefined) {
      params.append('min_minutes', filters.min_minutes.toString());
    }
    if (filters?.search_query) {
      params.append('search_query', filters.search_query);
    }

    // Добавляем сортировку
    if (sort?.field) {
      params.append('sort_field', sort.field);
      params.append('sort_order', sort.order);
    }

    // Добавляем пагинацию
    if (pagination?.page) {
      params.append('page', pagination.page.toString());
    }
    if (pagination?.per_page) {
      params.append('per_page', pagination.per_page.toString());
    }

    const response = await this.api.get<PlayerListResponse>(`/players?${params}`);
    return response.data;
  }

  async getPlayer(playerId: string): Promise<PlayerDetailResponse> {
    const response = await this.api.get<PlayerDetailResponse>(`/players/${playerId}`);
    return response.data;
  }

  async searchPlayers(query: string, tournamentId?: number): Promise<PlayerSearchResponse> {
    const params = new URLSearchParams();
    params.append('query', query);
    if (tournamentId !== undefined) {
      params.append('tournament_id', tournamentId.toString());
    }

    const response = await this.api.get<PlayerSearchResponse>(`/players/search?${params}`);
    return response.data;
  }

  async updatePlayerStatus(playerId: string, status: TrackingStatus, notes?: string): Promise<any> {
    const response = await this.api.put(`/players/${playerId}/status`, {
      tracking_status: status,
      notes,
    });
    return response.data;
  }

  async getTrackedPlayers(tournamentId?: number, pagination?: PaginationParams): Promise<PlayerListResponse> {
    const params = new URLSearchParams();
    if (tournamentId !== undefined) {
      params.append('tournament_id', tournamentId.toString());
    }
    if (pagination?.page) {
      params.append('page', pagination.page.toString());
    }
    if (pagination?.per_page) {
      params.append('per_page', pagination.per_page.toString());
    }

    const response = await this.api.get<PlayerListResponse>(`/players/tracked?${params}`);
    return response.data;
  }

  async getAllPlayersFromDatabase(
    page: number = 1,
    limit: number = 100,
    sliceType: 'TOTAL' | 'PER90' = 'TOTAL',
    search?: string,
    tournamentId?: number,
    positionGroup?: string,
    sortField?: string,
    sortOrder?: 'asc' | 'desc',
    periodType: 'SEASON' | 'ROUND' = 'SEASON',
    roundNumber?: number
  ): Promise<PlayerListResponse> {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('slice_type', sliceType);
    params.append('period_type', periodType);
    
    if (search) {
      params.append('search', search);
    }
    if (tournamentId !== undefined) {
      params.append('tournament_id', tournamentId.toString());
    }
    if (positionGroup) {
      params.append('position_group', positionGroup);
    }
    if (sortField) {
      params.append('sort_field', sortField);
    }
    if (sortOrder) {
      params.append('sort_order', sortOrder);
    }
    if (periodType === 'ROUND' && roundNumber !== undefined) {
      params.append('round_number', roundNumber.toString());
    }

    const response = await this.api.get<PlayerListResponse>(`/players/database?${params}`);
    return response.data;
  }

  async uploadTournamentFile(
    file: File,
    tournamentId: number,
    sliceType: 'TOTAL' | 'PER90',
    season?: string,
    round?: number
  ): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tournament_id', tournamentId.toString());
    formData.append('slice_type', sliceType);
    
    if (season) {
      formData.append('season', season);
    }
    if (round !== undefined) {
      formData.append('round', round.toString());
    }

    const response = await this.api.post('/upload/tournament', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  /**
   * Загрузка данных за конкретный тур
   * Данные хранятся отдельно от сезонных (period_type='ROUND')
   * Всегда используем TOTAL (тур = 90 минут, PER90 не имеет смысла)
   */
  async uploadRoundFile(
    file: File,
    tournamentId: number,
    roundNumber: number,
    season?: string
  ): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tournament_id', tournamentId.toString());
    formData.append('slice_type', 'TOTAL');
    formData.append('round_number', roundNumber.toString());
    
    if (season) {
      formData.append('season', season);
    }

    const response = await this.api.post('/upload/round', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async clearDatabase(): Promise<any> {
    const response = await this.api.post('/database/clear');
    return response.data;
  }

  /**
   * Получить список загруженных туров для турнира
   */
  async getTournamentRounds(tournamentId: number): Promise<{
    success: boolean;
    tournament_id: number;
    rounds: number[];
    total: number;
    message: string;
  }> {
    const response = await this.api.get(`/tournaments/${tournamentId}/rounds`);
    return response.data;
  }

  async getTournamentPlayers(
    tournamentId: number,
    sort?: SortOptions,
    pagination?: PaginationParams
  ): Promise<PlayerListResponse> {
    const params = new URLSearchParams();
    if (sort?.field) {
      params.append('sort_field', sort.field);
      params.append('sort_order', sort.order);
    }
    if (pagination?.page) {
      params.append('page', pagination.page.toString());
    }
    if (pagination?.per_page) {
      params.append('per_page', pagination.per_page.toString());
    }

    const response = await this.api.get<PlayerListResponse>(
      `/tournaments/${tournamentId}/players?${params}`
    );
    return response.data;
  }

  async getLastRoundPlayers(
    tournamentId?: number,
    trackingStatus?: TrackingStatus
  ): Promise<PlayerListResponse> {
    const params = new URLSearchParams();
    if (tournamentId !== undefined) {
      params.append('tournament_id', tournamentId.toString());
    }
    if (trackingStatus) {
      params.append('tracking_status', trackingStatus);
    }

    const response = await this.api.get<PlayerListResponse>(`/last-round/players?${params}`);
    return response.data;
  }

  // === Методы для работы с турнирами ===

  async getTournaments(): Promise<TournamentListResponse> {
    const response = await this.api.get<TournamentListResponse>('/tournaments');
    return response.data;
  }

  async getTournament(tournamentId: number): Promise<Tournament> {
    const response = await this.api.get<Tournament>(`/tournaments/${tournamentId}`);
    return response.data;
  }

  async getTournamentStats(tournamentId: number): Promise<TournamentStats> {
    const response = await this.api.get<TournamentStats>(`/tournaments/${tournamentId}/stats`);
    return response.data;
  }

  async getTournamentTeams(tournamentId: number): Promise<any> {
    const response = await this.api.get(`/tournaments/${tournamentId}/teams`);
    return response.data;
  }

  async getTopPerformers(
    period: 'all_time' | 'last_round' = 'all_time',
    limit: number = 10,
    tournamentId?: number
  ): Promise<TopPerformersResponse> {
    const params = new URLSearchParams();
    params.append('period', period);
    params.append('limit', limit.toString());
    if (tournamentId !== undefined) {
      params.append('tournament_id', tournamentId.toString());
    }

    const response = await this.api.get<TopPerformersResponse>(`/top-performers?${params}`);
    return response.data;
  }

  // === Методы для страницы игрока ===

  /**
   * Получить базовую информацию об игроке
   */
  async getPlayerInfo(playerId: number): Promise<{
    success: boolean;
    data: {
      player_id: number;
      full_name: string;
      birth_year: number | null;
      team_name: string;
      height: number | null;
      weight: number | null;
      citizenship: string | null;
      tournament_id: number;
      position_code: string;
      position_group: string;
      position_name: string;
      tournament_name: string;
      tournament_full_name: string;
      current_round: number | null;
    };
  }> {
    const response = await this.api.get(`/players/${playerId}`);
    return response.data;
  }

  /**
   * Получить статистику игрока для конкретного слайса
   */
  async getPlayerStats(
    playerId: number,
    sliceType: 'TOTAL' | 'PER90' = 'TOTAL',
    periodType: 'SEASON' | 'ROUND' = 'SEASON',
    roundNumber?: number
  ): Promise<{
    success: boolean;
    player_id: number;
    slice_type: string;
    period_type: string;
    round_number: number | null;
    stats: Record<string, number | null>;
    stats_detailed: Array<{
      code: string;
      value: number | null;
      display_name: string;
      data_type: string;
      category: string;
      is_key_metric: boolean;
    }>;
    total_metrics: number;
    message: string;
  }> {
    const params = new URLSearchParams();
    params.append('slice_type', sliceType);
    params.append('period_type', periodType);
    if (periodType === 'ROUND' && roundNumber !== undefined) {
      params.append('round_number', roundNumber.toString());
    }
    const response = await this.api.get(`/players/${playerId}/stats?${params}`);
    return response.data;
  }

  /**
   * Получить список доступных слайсов для игрока
   */
  async getPlayerAvailableSlices(playerId: number): Promise<{
    success: boolean;
    player_id: number;
    tournament_id: number;
    slices: {
      season: { TOTAL: boolean; PER90: boolean };
      rounds: number[];
    };
    message: string;
  }> {
    const response = await this.api.get(`/players/${playerId}/available-slices`);
    return response.data;
  }

  // === Методы Talent Scouting (анализ) ===

  /**
   * Получить конфигурацию метрик по позициям
   */
  async getPositionMetrics(positionCode?: string): Promise<any> {
    const params = positionCode ? `?position_code=${positionCode}` : '';
    const response = await this.api.get(`/positions/metrics${params}`);
    return response.data;
  }

  /**
   * Получить корзины команд для турнира
   */
  async getTeamTiers(tournamentId: number, season?: string): Promise<any> {
    const params = season ? `?season=${season}` : '';
    const response = await this.api.get(`/tiers/${tournamentId}${params}`);
    return response.data;
  }

  /**
   * Заполнить список команд из БД (auto-populate)
   */
  async populateTeamTiers(tournamentId: number): Promise<any> {
    const response = await this.api.post(`/tiers/${tournamentId}/populate`);
    return response.data;
  }

  /**
   * Обновить корзины команд
   */
  async updateTeamTiers(
    tournamentId: number,
    teams: Array<{ team_name: string; tier: string | null }>,
    season?: string
  ): Promise<any> {
    const response = await this.api.put(`/tiers/${tournamentId}`, {
      teams,
      season,
    });
    return response.data;
  }

  /**
   * Получить эталонный сезон для турнира
   */
  async getBenchmark(tournamentId: number): Promise<any> {
    const response = await this.api.get(`/benchmarks/${tournamentId}`);
    return response.data;
  }

  /**
   * Загрузить эталонный сезон
   */
  async uploadBenchmark(
    tournamentId: number,
    file: File,
    label?: string
  ): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (label) formData.append('label', label);
    const response = await this.api.post(`/benchmarks/${tournamentId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  /**
   * Удалить эталонный сезон
   */
  async deleteBenchmark(tournamentId: number): Promise<any> {
    const response = await this.api.delete(`/benchmarks/${tournamentId}`);
    return response.data;
  }

  /**
   * Получить топ выступления за тур (Talent Scouting)
   */
  /**
   * Пересчитать анализ тура
   */
  async recomputeRoundAnalysis(tournamentId: number, roundNumber: number): Promise<any> {
    const response = await this.api.post(`/rounds/${tournamentId}/${roundNumber}/recompute`);
    return response.data;
  }

  /**
   * Пересчитать сезонный анализ (стабильность за весь сезон)
   */
  async recomputeSeasonAnalysis(tournamentId: number): Promise<any> {
    const response = await this.api.post(`/season/${tournamentId}/recompute`);
    return response.data;
  }

  /**
   * Топ по позициям за сезон
   */
  async getSeasonTopByPosition(
    tournamentId: number,
    options?: { sort_by?: string; funnel?: string; baseline_kind?: string; limit_per_position?: number }
  ): Promise<any> {
    const params = new URLSearchParams();
    if (options?.sort_by) params.append('sort_by', options.sort_by);
    if (options?.funnel) params.append('funnel', options.funnel);
    if (options?.baseline_kind) params.append('baseline_kind', options.baseline_kind);
    if (options?.limit_per_position) params.append('limit_per_position', options.limit_per_position.toString());
    const response = await this.api.get(`/season/${tournamentId}/top-by-position?${params}`);
    return response.data;
  }

  /**
   * Общий топ за сезон
   */
  async getSeasonTop(
    tournamentId: number,
    options?: { sort_by?: string; funnel?: string; baseline_kind?: string; position_code?: string; limit?: number }
  ): Promise<any> {
    const params = new URLSearchParams();
    if (options?.sort_by) params.append('sort_by', options.sort_by);
    if (options?.funnel) params.append('funnel', options.funnel);
    if (options?.baseline_kind) params.append('baseline_kind', options.baseline_kind);
    if (options?.position_code) params.append('position_code', options.position_code);
    if (options?.limit) params.append('limit', options.limit.toString());
    const response = await this.api.get(`/season/${tournamentId}/top?${params}`);
    return response.data;
  }

  /**
   * Получить перцентили игрока по позиции (сезон + тур)
   */
  async getPlayerPercentiles(
    playerId: number,
    roundNumber?: number
  ): Promise<any> {
    const params = new URLSearchParams();
    if (roundNumber) params.append('round_number', roundNumber.toString());
    const response = await this.api.get(`/player/${playerId}/percentiles?${params}`);
    return response.data;
  }

  async getRoundTop(
    tournamentId: number,
    roundNumber: number,
    options?: {
      baseline_kind?: string;
      sort_by?: string;
      funnel?: string;
      position_code?: string;
      limit?: number;
    }
  ): Promise<any> {
    const params = new URLSearchParams();
    if (options?.baseline_kind) params.append('baseline_kind', options.baseline_kind);
    if (options?.sort_by) params.append('sort_by', options.sort_by);
    if (options?.funnel) params.append('funnel', options.funnel);
    if (options?.position_code) params.append('position_code', options.position_code);
    if (options?.limit) params.append('limit', options.limit.toString());
    const response = await this.api.get(`/rounds/${tournamentId}/${roundNumber}/top?${params}`);
    return response.data;
  }

  /**
   * Получить топ по позициям за тур
   */
  async getRoundTopByPosition(
    tournamentId: number,
    roundNumber: number,
    options?: {
      baseline_kind?: string;
      sort_by?: string;
      funnel?: string;
      limit_per_position?: number;
    }
  ): Promise<any> {
    const params = new URLSearchParams();
    if (options?.baseline_kind) params.append('baseline_kind', options.baseline_kind);
    if (options?.sort_by) params.append('sort_by', options.sort_by);
    if (options?.funnel) params.append('funnel', options.funnel);
    if (options?.limit_per_position) params.append('limit_per_position', options.limit_per_position.toString());
    const response = await this.api.get(`/rounds/${tournamentId}/${roundNumber}/top-by-position?${params}`);
    return response.data;
  }

  /**
   * Получить сравнение игрока по трём baselines
   */
  async getPlayerComparison(
    tournamentId: number,
    roundNumber: number,
    playerId: number
  ): Promise<any> {
    const response = await this.api.get(`/rounds/${tournamentId}/${roundNumber}/player/${playerId}/comparison`);
    return response.data;
  }

  /**
   * Получить историю скоров игрока по турам
   */
  async getPlayerHistory(
    tournamentId: number,
    playerId: number,
    baselineKind?: string
  ): Promise<any> {
    const params = baselineKind ? `?baseline_kind=${baselineKind}` : '';
    const response = await this.api.get(`/rounds/${tournamentId}/history/${playerId}${params}`);
    return response.data;
  }

  // === Служебные методы ===

  async checkHealth(): Promise<any> {
    const response = await this.api.get('/health', { baseURL: this.baseURL.replace('/api', '') });
    return response.data;
  }

  async getAppInfo(): Promise<any> {
    const response = await this.api.get('/info', { baseURL: this.baseURL.replace('/api', '') });
    return response.data;
  }

  // === Методы для работы с кэшем ===

  clearCache(): void {
    // В будущем здесь может быть логика очистки кэша
    console.log('API cache cleared');
  }

  getBaseURL(): string {
    return this.baseURL;
  }
}

// Создаём единственный экземпляр API сервиса
export const apiService = new ApiService();

// Экспортируем класс для тестирования
export default ApiService;


