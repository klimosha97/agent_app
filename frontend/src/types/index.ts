/**
 * TypeScript типы для приложения статистики футболистов
 */

// === Базовые типы ===

export interface BaseResponse {
  success: boolean;
  message?: string;
  timestamp: string;
}

export interface ApiError {
  success: false;
  error: string;
  message: string;
  status_code: number;
  details?: Record<string, any>;
}

// === Типы игроков ===

export type TrackingStatus = 'non interesting' | 'interesting' | 'to watch' | 'my player';

export interface Player {
  id: string;
  player_name: string;
  team_name: string;
  position?: string;
  age?: number;
  height?: string;
  weight?: string;
  citizenship?: string;
  player_index?: string;
  tournament_id: number;
  tracking_status: TrackingStatus;
  minutes_played?: number;
  player_number?: number;
  
  // Основная статистика
  goals?: number;
  assists?: number;
  shots?: number;
  shots_on_target?: number;
  passes_total?: number;
  passes_accuracy?: number;
  tackles?: number;
  tackles_success_rate?: number;
  interceptions?: number;
  yellow_cards?: number;
  red_cards?: number;
  xg?: number;
  goal_attempts?: number;
  goal_attempts_successful?: number;
  goal_attempts_success_rate?: number;
  goal_moments_created?: number;
  goal_attacks_participation?: number;
  goal_errors?: number;
  rough_errors?: number;
  fouls_committed?: number;
  fouls_suffered?: number;
  passes_key?: number;
  passes_key_accuracy?: number;
  crosses?: number;
  crosses_accuracy?: number;
  passes_progressive?: number;
  passes_progressive_accuracy?: number;
  passes_progressive_clean?: number;
  passes_long?: number;
  passes_long_accuracy?: number;
  passes_super_long?: number;
  passes_super_long_accuracy?: number;
  passes_final_third?: number;
  passes_final_third_accuracy?: number;
  passes_penalty_area?: number;
  passes_penalty_area_accuracy?: number;
  passes_for_shot?: number;
  duels_total?: number;
  duels_success_rate?: number;
  duels_defensive?: number;
  duels_defensive_success_rate?: number;
  duels_offensive?: number;
  duels_offensive_success_rate?: number;
  duels_aerial?: number;
  duels_aerial_success_rate?: number;
  dribbles?: number;
  dribbles_success_rate?: number;
  dribbles_final_third?: number;
  dribbles_final_third_success_rate?: number;
  recoveries?: number;
  
  // Метаданные
  created_at: string;
  updated_at: string;
  notes?: string;
}

export interface PlayerListResponse extends BaseResponse {
  data: Player[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface PlayerDetailResponse extends BaseResponse {
  data: Player;
}

export interface PlayerSearchResult {
  id: string;
  player_name: string;
  team_name: string;
  position?: string;
  tournament_id: number;
  current_status: TrackingStatus;
  basic_stats: Record<string, any>;
}

export interface PlayerSearchResponse extends BaseResponse {
  query: string;
  results: PlayerSearchResult[];
  total_found: number;
}

// === Типы турниров ===

export interface Tournament {
  id: number;
  name: string;
  full_name: string;
  code: string;
  players_count: number;
  last_update?: string;
}

export interface TournamentListResponse extends BaseResponse {
  data: Tournament[];
}

export interface TournamentStats {
  tournament_id: number;
  tournament_name: string;
  total_players: number;
  teams_count: number;
  positions_count: number;
  tracked_players: number;
  averages: {
    goals: number;
    assists: number;
    minutes_played: number;
  };
  totals: {
    goals: number;
    assists: number;
  };
  top_scorers: Array<{
    player_name: string;
    team_name: string;
    goals: number;
    minutes_played?: number;
  }>;
  top_assisters: Array<{
    player_name: string;
    team_name: string;
    assists: number;
    minutes_played?: number;
  }>;
}

// === Типы загрузки файлов ===

export interface FileUploadResponse extends BaseResponse {
  file_name: string;
  tournament_id: number;
  total_rows: number;
  main_table?: {
    added: number;
    updated: number;
  };
  last_round_table?: {
    added: number;
  };
  duration_seconds: number;
  upload_time: string;
}

// === Типы топ выступлений ===

export interface PlayerPerformance {
  id: string;
  player_name: string;
  team_name: string;
  position?: string;
  tournament_id: number;
  metric_value: number;
  minutes_played?: number;
  per_90_value?: number;
}

export interface TopPerformersResponse extends BaseResponse {
  goals: PlayerPerformance[];
  assists: PlayerPerformance[];
  shots: PlayerPerformance[];
  passes: PlayerPerformance[];
  period: string;
}

// === Типы фильтрации и поиска ===

export interface PlayerFilters {
  tournament_id?: number;
  team_name?: string;
  position?: string;
  tracking_status?: TrackingStatus;
  min_goals?: number;
  min_assists?: number;
  min_minutes?: number;
  search_query?: string;
}

export interface SortOptions {
  field: string;
  order: 'asc' | 'desc';
}

export interface PaginationParams {
  page: number;
  per_page: number;
}

// === Типы состояния приложения ===

export interface LoadingState {
  isLoading: boolean;
  error?: string;
}

export interface AppState {
  currentTab: string;
  tournaments: Tournament[];
  players: Player[];
  loading: LoadingState;
}

// === Константы ===

export const TOURNAMENTS = {
  0: { name: 'МФЛ', full_name: 'Московская Футбольная Лига', code: 'mfl' },
  1: { name: 'ЮФЛ-1', full_name: 'Юношеская Футбольная Лига - 1', code: 'yfl1' },
  2: { name: 'ЮФЛ-2', full_name: 'Юношеская Футбольная Лига - 2', code: 'yfl2' },
  3: { name: 'ЮФЛ-3', full_name: 'Юношеская Футбольная Лига - 3', code: 'yfl3' },
} as const;

export const TRACKING_STATUSES = {
  'non interesting': 'non interesting',
  'interesting': 'Интересный игрок',
  'to watch': 'Игрок для наблюдения',
  'my player': 'Мой игрок',
} as const;

export const SORT_FIELDS = [
  { value: 'player_name', label: 'Имя игрока' },
  { value: 'team_name', label: 'Команда' },
  { value: 'position', label: 'Позиция' },
  { value: 'goals', label: 'Голы' },
  { value: 'assists', label: 'Ассисты' },
  { value: 'shots', label: 'Удары' },
  { value: 'passes_total', label: 'Передачи' },
  { value: 'minutes_played', label: 'Минуты' },
] as const;

// === Утилитарные типы ===

export type ApiResponse<T> = T & BaseResponse;

export type WithLoading<T> = T & LoadingState;

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;


