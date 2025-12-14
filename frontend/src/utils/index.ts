/**
 * Утилитарные функции для приложения
 */

import { TrackingStatus, Player } from '../types';
import { TOURNAMENTS, TRACKING_STATUSES } from '../types';

// === Форматирование данных ===

export function formatPlayerName(player: Player): string {
  return player.player_name || 'Неизвестный игрок';
}

export function formatTeamName(team: string): string {
  return team || 'Неизвестная команда';
}

export function formatPosition(position?: string): string {
  if (!position) return 'Не указана';
  return position;
}

export function formatMinutes(minutes?: number): string {
  if (!minutes || minutes === 0) return '0 мин';
  
  if (minutes >= 90) {
    const matches = Math.floor(minutes / 90);
    const remaining = minutes % 90;
    return remaining > 0 ? `${matches} матча + ${remaining} мин` : `${matches} матча`;
  }
  
  return `${minutes} мин`;
}

export function formatStats(value?: number): string {
  if (value === undefined || value === null) return '-';
  return value.toString();
}

export function formatPercentage(value?: number): string {
  if (value === undefined || value === null) return '-';
  // Округляем до ближайшего 0.5
  const rounded = Math.round(value * 2) / 2;
  const displayValue = rounded % 1 === 0 ? rounded : rounded.toFixed(1);
  return `${displayValue}%`;
}

export function formatDecimal(value?: number, decimals: number = 2): string {
  if (value === undefined || value === null) return '-';
  return value.toFixed(decimals);
}

// === Работа с турнирами ===

export function getTournamentName(tournamentId: number): string {
  const tournament = TOURNAMENTS[tournamentId as keyof typeof TOURNAMENTS];
  return tournament?.name || `Турнир ${tournamentId}`;
}

export function getTournamentFullName(tournamentId: number): string {
  const tournament = TOURNAMENTS[tournamentId as keyof typeof TOURNAMENTS];
  return tournament?.full_name || `Турнир ${tournamentId}`;
}

export function getTournamentCode(tournamentId: number): string {
  const tournament = TOURNAMENTS[tournamentId as keyof typeof TOURNAMENTS];
  return tournament?.code || `T${tournamentId}`;
}

// === Работа со статусами отслеживания ===

export function getTrackingStatusLabel(status: TrackingStatus): string {
  return TRACKING_STATUSES[status] || status;
}

export function getTrackingStatusColor(status: TrackingStatus): string {
  const colors = {
    'non interesting': 'gray',
    'interesting': 'blue',
    'to watch': 'yellow',
    'my player': 'green',
  };
  return colors[status] || 'gray';
}

export function getTrackingStatusBadgeClasses(status: TrackingStatus): string {
  const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
  
  const statusClasses = {
    'non interesting': 'bg-gray-100 text-gray-800',
    'interesting': 'bg-blue-100 text-blue-800',
    'to watch': 'bg-yellow-100 text-yellow-800',
    'my player': 'bg-green-100 text-green-800',
  };
  
  return `${baseClasses} ${statusClasses[status] || statusClasses['non interesting']}`;
}

// === Вычисления статистики per 90 ===

export function calculatePer90(value: number, minutes: number): number {
  if (!minutes || minutes === 0) return 0;
  return (value / minutes) * 90;
}

export function getPlayerPer90Stats(player: Player) {
  const minutes = player.minutes_played || 0;
  if (minutes === 0) return null;

  return {
    goals: calculatePer90(player.goals || 0, minutes),
    assists: calculatePer90(player.assists || 0, minutes),
    shots: calculatePer90(player.shots || 0, minutes),
    passes: calculatePer90(player.passes_total || 0, minutes),
    tackles: calculatePer90(player.tackles || 0, minutes),
    interceptions: calculatePer90(player.interceptions || 0, minutes),
  };
}

// === Фильтрация и сортировка ===

export function sortPlayers(players: Player[], field: string, order: 'asc' | 'desc'): Player[] {
  return [...players].sort((a, b) => {
    let aValue = (a as any)[field];
    let bValue = (b as any)[field];

    // Обрабатываем null/undefined значения
    if (aValue === null || aValue === undefined) aValue = 0;
    if (bValue === null || bValue === undefined) bValue = 0;

    // Для строковых полей
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return order === 'asc' 
        ? aValue.localeCompare(bValue, 'ru')
        : bValue.localeCompare(aValue, 'ru');
    }

    // Для числовых полей
    if (order === 'asc') {
      return aValue - bValue;
    } else {
      return bValue - aValue;
    }
  });
}

export function filterPlayers(players: Player[], filters: any): Player[] {
  return players.filter(player => {
    if (filters.search && !player.player_name.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    
    if (filters.team && !player.team_name.toLowerCase().includes(filters.team.toLowerCase())) {
      return false;
    }
    
    if (filters.position && player.position !== filters.position) {
      return false;
    }
    
    if (filters.status && player.tracking_status !== filters.status) {
      return false;
    }
    
    if (filters.minGoals && (player.goals || 0) < filters.minGoals) {
      return false;
    }
    
    if (filters.minAssists && (player.assists || 0) < filters.minAssists) {
      return false;
    }

    return true;
  });
}

// === Валидация ===

export function validatePlayerData(player: Partial<Player>): string[] {
  const errors: string[] = [];

  if (!player.player_name?.trim()) {
    errors.push('Имя игрока обязательно');
  }

  if (!player.team_name?.trim()) {
    errors.push('Название команды обязательно');
  }

  if (player.age !== undefined && (player.age < 14 || player.age > 50)) {
    errors.push('Возраст должен быть от 14 до 50 лет');
  }

  if (player.minutes_played !== undefined && player.minutes_played < 0) {
    errors.push('Количество минут не может быть отрицательным');
  }

  return errors;
}

export function isValidTrackingStatus(status: string): status is TrackingStatus {
  return status in TRACKING_STATUSES;
}

// === Работа с датами ===

export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return 'Неизвестная дата';
  }
}

/**
 * Форматирует дату в формате DD.MM.YYYY
 */
export function formatDateShort(dateString: string): string {
  try {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return 'Нет данных';
  }
}

export function formatDateTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Неизвестная дата';
  }
}

export function timeAgo(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'только что';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} мин. назад`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} ч. назад`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} дн. назад`;
    
    return formatDate(dateString);
  } catch {
    return 'Неизвестная дата';
  }
}

// === Работа с файлами ===

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Б';

  const k = 1024;
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export function isExcelFile(filename: string): boolean {
  const extension = getFileExtension(filename);
  return ['xlsx', 'xls'].includes(extension);
}

// === Работа с URL и навигацией ===

export function buildQueryString(params: Record<string, any>): string {
  const query = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value.toString());
    }
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

// === Утилиты для CSS классов ===

export function classNames(...classes: (string | undefined | null | boolean)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function conditionalClass(condition: boolean, trueClass: string, falseClass?: string): string {
  return condition ? trueClass : (falseClass || '');
}

// === Математические утилиты ===

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function round(value: number, decimals: number = 2): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export function percentage(value: number, total: number): number {
  if (total === 0) return 0;
  return round((value / total) * 100);
}

// === Дебаунсинг ===

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// === Локальное хранилище ===

export const storage = {
  get<T>(key: string, defaultValue?: T): T | undefined {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;
      return JSON.parse(item);
    } catch {
      return defaultValue;
    }
  },

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error);
    }
  },

  clear(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }
  },
};

// === Константы ===

export const APP_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_FILE_TYPES: ['.xlsx', '.xls'],
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 500,
  DEBOUNCE_DELAY: 300,
  REFETCH_INTERVAL: 30000, // 30 секунд
} as const;













