/**
 * API сервис для взаимодействия с бэкендом
 * Централизованное управление всеми HTTP запросами
 */

import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import {
  Player,
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
    this.baseURL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api';
    
    // Создаём экземпляр axios
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 10000, // 10 секунд
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

  // === Методы для загрузки файлов ===

  async uploadExcelFile(
    file: File,
    tournamentId?: number,
    options?: {
      importToMain?: boolean;
      importToLastRound?: boolean;
      roundNumber?: number;
    }
  ): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    if (tournamentId !== undefined) {
      formData.append('tournament_id', tournamentId.toString());
    }
    if (options?.importToMain !== undefined) {
      formData.append('import_to_main', options.importToMain.toString());
    }
    if (options?.importToLastRound !== undefined) {
      formData.append('import_to_last_round', options.importToLastRound.toString());
    }
    if (options?.roundNumber) {
      formData.append('round_number', options.roundNumber.toString());
    }

    const response = await this.api.post<FileUploadResponse>('/upload-excel', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  }

  async getSupportedFormats(): Promise<any> {
    const response = await this.api.get('/upload/supported-formats');
    return response.data;
  }

  async getUploadedFiles(): Promise<any> {
    const response = await this.api.get('/upload/files');
    return response.data;
  }

  async deleteUploadedFile(fileName: string): Promise<any> {
    const response = await this.api.delete(`/upload/${fileName}`);
    return response.data;
  }

  // === Служебные методы ===

  /**
   * Получить все данные из базы players_stats_raw
   */
  async getAllPlayersDatabase(): Promise<PlayerListResponse> {
    const response = await this.api.get('/players/raw-data');
    return response.data;
  }

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


