/**
 * Страница "Турниры"
 * Показывает список турниров и детальную статистику игроков
 * Клик на игрока открывает страницу профиля
 */

import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from 'react-query';
import { 
  ChevronRightIcon,
  ChevronLeftIcon,
  CalendarIcon,
  UsersIcon,
  TrophyIcon,
  StarIcon,
  UserPlusIcon,
  ChartBarIcon,
  ArrowLeftIcon,
  CloudArrowUpIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowsUpDownIcon,
} from '@heroicons/react/24/outline';
import { useTournaments } from '../hooks/useApi';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Tournament } from '../types';
import { formatDateShort } from '../utils';
import { TournamentUploadModal } from '../components/TournamentUploadModal';
import { RoundUploadModal } from '../components/RoundUploadModal';
import { TableColumnsSettings } from '../components/TableColumnsSettings';
import { apiService } from '../services/api';
import { useQueryClient } from 'react-query';
import { FlagIcon } from '@heroicons/react/24/solid';
import { usePlayerNavigation } from '../App';
import { PlayerComparisonCard } from '../components/PlayerComparisonCard';
import { TierEditor } from '../components/TierEditor';

// Определение колонок для таблицы игроков турнира
interface ColumnDef {
  key: string;
  label: string;
  shortLabel?: string;
  isPercent?: boolean;
  isXg?: boolean;
  frozen?: boolean;
  width?: string;
  group?: string;
}

// ВСЕ колонки из METRICS_MAPPING (такие же как в Database.tsx)
const PLAYER_COLUMNS: ColumnDef[] = [
  // Основная статистика
  { key: 'index', label: 'Индекс', shortLabel: 'Инд', group: 'Основное' },
  { key: 'minutes', label: 'Минуты', shortLabel: 'Мин', group: 'Основное' },
  { key: 'matches_played', label: 'Матчи', shortLabel: 'М', group: 'Основное' },
  { key: 'starting_lineup', label: 'В старте', shortLabel: 'Старт', group: 'Основное' },
  { key: 'substituted_on', label: 'Вышел на замену', shortLabel: 'Замена+', group: 'Основное' },
  { key: 'substituted_off', label: 'Был заменен', shortLabel: 'Замена-', group: 'Основное' },
  
  // Голы и результативность
  { key: 'goals', label: 'Голы', shortLabel: 'Г', group: 'Голы' },
  { key: 'assists', label: 'Голевые передачи', shortLabel: 'А', group: 'Голы' },
  { key: 'xg', label: 'xG', isXg: true, group: 'Голы' },
  { key: 'xa', label: 'xA', isXg: true, group: 'Голы' },
  { key: 'goal_chances', label: 'Голевые моменты', shortLabel: 'ГМ', group: 'Голы' },
  { key: 'goal_chances_success', label: 'ГМ удачные', shortLabel: 'ГМ+', group: 'Голы' },
  { key: 'goal_chances_success_pct', label: 'ГМ %', isPercent: true, group: 'Голы' },
  { key: 'goal_chances_created', label: 'ГМ создал', shortLabel: 'ГМС', group: 'Голы' },
  { key: 'goal_attacks', label: 'Голевые атаки', shortLabel: 'ГА', group: 'Голы' },
  { key: 'goal_errors', label: 'Голевые ошибки', shortLabel: 'ГОш', group: 'Голы' },
  { key: 'gross_errors', label: 'Грубые ошибки', shortLabel: 'ГрОш', group: 'Голы' },
  
  // Удары
  { key: 'shots', label: 'Удары', shortLabel: 'Уд', group: 'Удары' },
  { key: 'shots_on_target', label: 'В створ', shortLabel: 'УдС', group: 'Удары' },
  { key: 'shots_accurate_pct', label: 'Удары %', isPercent: true, group: 'Удары' },
  { key: 'shots_off_target', label: 'Мимо', shortLabel: 'УдМ', group: 'Удары' },
  { key: 'shots_blocked', label: 'Заблок.', shortLabel: 'УдБ', group: 'Удары' },
  { key: 'shots_head', label: 'Головой', shortLabel: 'УдГол', group: 'Удары' },
  { key: 'shots_woodwork', label: 'В каркас', shortLabel: 'Карк', group: 'Удары' },
  
  // Передачи
  { key: 'passes', label: 'Передачи', shortLabel: 'Пер', group: 'Передачи' },
  { key: 'passes_accurate', label: 'Точные', shortLabel: 'ПерТ', group: 'Передачи' },
  { key: 'passes_accurate_pct', label: 'Точность %', isPercent: true, group: 'Передачи' },
  { key: 'key_passes', label: 'Ключевые', shortLabel: 'КлПер', group: 'Передачи' },
  { key: 'key_passes_accurate', label: 'Ключ. точные', shortLabel: 'КлПерТ', group: 'Передачи' },
  { key: 'key_passes_accurate_pct', label: 'Ключ. %', isPercent: true, group: 'Передачи' },
  { key: 'progressive_passes', label: 'Прогрессивные', shortLabel: 'ПрогП', group: 'Передачи' },
  { key: 'progressive_passes_accurate', label: 'Прогр. точные', shortLabel: 'ПрогПТ', group: 'Передачи' },
  { key: 'progressive_passes_accurate_pct', label: 'Прогр. %', isPercent: true, group: 'Передачи' },
  { key: 'progressive_passes_clean', label: 'Прогр. чистые', shortLabel: 'ПрогЧ', group: 'Передачи' },
  { key: 'long_passes', label: 'Длинные', shortLabel: 'ДлПер', group: 'Передачи' },
  { key: 'long_passes_accurate', label: 'Длин. точные', shortLabel: 'ДлПерТ', group: 'Передачи' },
  { key: 'long_passes_accurate_pct', label: 'Длин. %', isPercent: true, group: 'Передачи' },
  { key: 'super_long_passes', label: 'Сверхдлинные', shortLabel: 'СДлП', group: 'Передачи' },
  { key: 'super_long_passes_accurate', label: 'Сверхдл. точн.', shortLabel: 'СДлПТ', group: 'Передачи' },
  { key: 'super_long_passes_accurate_pct', label: 'Сверхдл. %', isPercent: true, group: 'Передачи' },
  { key: 'passes_to_final_third', label: 'В фин. треть', shortLabel: 'ПФТ', group: 'Передачи' },
  { key: 'passes_to_final_third_accurate', label: 'В ФТ точные', shortLabel: 'ПФТТ', group: 'Передачи' },
  { key: 'passes_to_final_third_accurate_pct', label: 'В ФТ %', isPercent: true, group: 'Передачи' },
  { key: 'passes_to_penalty_area', label: 'В штрафную', shortLabel: 'ПШтр', group: 'Передачи' },
  { key: 'passes_to_penalty_area_accurate', label: 'В штр. точные', shortLabel: 'ПШтрТ', group: 'Передачи' },
  { key: 'passes_to_penalty_area_accurate_pct', label: 'В штр. %', isPercent: true, group: 'Передачи' },
  { key: 'passes_for_shot', label: 'Под удар', shortLabel: 'ПодУд', group: 'Передачи' },
  { key: 'crosses', label: 'Навесы', shortLabel: 'Нав', group: 'Передачи' },
  { key: 'crosses_accurate', label: 'Навесы точные', shortLabel: 'НавТ', group: 'Передачи' },
  { key: 'crosses_accurate_pct', label: 'Навесы %', isPercent: true, group: 'Передачи' },
  
  // Единоборства
  { key: 'duels', label: 'Единоборства', shortLabel: 'Ед', group: 'Единоборства' },
  { key: 'duels_success', label: 'Ед. удачные', shortLabel: 'Ед+', group: 'Единоборства' },
  { key: 'duels_success_pct', label: 'Ед. %', isPercent: true, group: 'Единоборства' },
  { key: 'duels_unsuccessful', label: 'Ед. неудачные', shortLabel: 'Ед-', group: 'Единоборства' },
  { key: 'defensive_duels', label: 'В обороне', shortLabel: 'ЕдОб', group: 'Единоборства' },
  { key: 'defensive_duels_success', label: 'В обор. удачн.', shortLabel: 'ЕдОб+', group: 'Единоборства' },
  { key: 'defensive_duels_success_pct', label: 'В обор. %', isPercent: true, group: 'Единоборства' },
  { key: 'offensive_duels', label: 'В атаке', shortLabel: 'ЕдАт', group: 'Единоборства' },
  { key: 'offensive_duels_success', label: 'В атаке удачн.', shortLabel: 'ЕдАт+', group: 'Единоборства' },
  { key: 'offensive_duels_success_pct', label: 'В атаке %', isPercent: true, group: 'Единоборства' },
  { key: 'aerial_duels', label: 'Вверху', shortLabel: 'ЕдВерх', group: 'Единоборства' },
  { key: 'aerial_duels_success', label: 'Вверху удачн.', shortLabel: 'ЕдВерх+', group: 'Единоборства' },
  { key: 'aerial_duels_success_pct', label: 'Вверху %', isPercent: true, group: 'Единоборства' },
  
  // Обводки
  { key: 'dribbles', label: 'Обводки', shortLabel: 'Обв', group: 'Обводки' },
  { key: 'dribbles_success', label: 'Обв. удачные', shortLabel: 'Обв+', group: 'Обводки' },
  { key: 'dribbles_success_pct', label: 'Обв. %', isPercent: true, group: 'Обводки' },
  { key: 'dribbles_unsuccessful', label: 'Обв. неудачн.', shortLabel: 'Обв-', group: 'Обводки' },
  { key: 'dribbles_final_third', label: 'Обв. в ФТ', shortLabel: 'ОбвФТ', group: 'Обводки' },
  { key: 'dribbles_final_third_success', label: 'Обв. в ФТ уд.', shortLabel: 'ОбвФТ+', group: 'Обводки' },
  { key: 'dribbles_final_third_success_pct', label: 'Обв. ФТ %', isPercent: true, group: 'Обводки' },
  
  // Отборы и защита
  { key: 'tackles', label: 'Отборы', shortLabel: 'Отб', group: 'Защита' },
  { key: 'tackles_success', label: 'Отб. удачные', shortLabel: 'Отб+', group: 'Защита' },
  { key: 'tackles_success_pct', label: 'Отб. %', isPercent: true, group: 'Защита' },
  { key: 'interceptions', label: 'Перехваты', shortLabel: 'Перехв', group: 'Защита' },
  { key: 'recoveries', label: 'Подборы', shortLabel: 'Подб', group: 'Защита' },
  { key: 'ball_recoveries', label: 'Овладевания', shortLabel: 'Овлад', group: 'Защита' },
  { key: 'ball_recoveries_opponent_half', label: 'Овлад. на чужой', shortLabel: 'ОвлЧуж', group: 'Защита' },
  
  // ТТД
  { key: 'ttd_total', label: 'ТТД', group: 'ТТД' },
  { key: 'ttd_success', label: 'ТТД удачные', shortLabel: 'ТТД+', group: 'ТТД' },
  { key: 'ttd_success_pct', label: 'ТТД %', isPercent: true, group: 'ТТД' },
  { key: 'ttd_unsuccessful', label: 'ТТД неудачные', shortLabel: 'ТТД-', group: 'ТТД' },
  { key: 'ttd_in_opponent_box', label: 'ТТД в штрафной', shortLabel: 'ТТДШтр', group: 'ТТД' },
  { key: 'ttd_in_opponent_box_success', label: 'ТТД штр. удачн.', shortLabel: 'ТТДШтр+', group: 'ТТД' },
  { key: 'ttd_in_opponent_box_success_pct', label: 'ТТД штр. %', isPercent: true, group: 'ТТД' },
  
  // Входы в финальную треть
  { key: 'final_third_entries', label: 'Входы в ФТ', shortLabel: 'ВхФТ', group: 'Продвижение' },
  { key: 'final_third_entries_pass', label: 'Входы через пас', shortLabel: 'ВхФТп', group: 'Продвижение' },
  { key: 'final_third_entries_pass_pct', label: 'Входы пас %', isPercent: true, group: 'Продвижение' },
  { key: 'final_third_entries_dribble', label: 'Входы продв.', shortLabel: 'ВхФТд', group: 'Продвижение' },
  { key: 'final_third_entries_dribble_pct', label: 'Входы продв. %', isPercent: true, group: 'Продвижение' },
  { key: 'carries', label: 'Ведения мяча', shortLabel: 'Вед', group: 'Продвижение' },
  
  // Потери
  { key: 'losses', label: 'Потери', shortLabel: 'Пот', group: 'Потери' },
  { key: 'losses_own_half', label: 'Потери на своей', shortLabel: 'ПотСв', group: 'Потери' },
  { key: 'losses_passes', label: 'Потери передачи', shortLabel: 'ПотПер', group: 'Потери' },
  { key: 'losses_individual', label: 'Потери индив.', shortLabel: 'ПотИнд', group: 'Потери' },
  { key: 'bad_touches', label: 'Плохие касания', shortLabel: 'ПлКас', group: 'Потери' },
  
  // Дисциплина
  { key: 'fouls', label: 'Фолы', group: 'Дисциплина' },
  { key: 'fouls_on_player', label: 'Фолы на игроке', shortLabel: 'ФолНа', group: 'Дисциплина' },
  { key: 'yellow_cards', label: 'ЖК', group: 'Дисциплина' },
  { key: 'red_cards', label: 'КК', group: 'Дисциплина' },
  { key: 'offsides', label: 'Офсайды', shortLabel: 'Офс', group: 'Дисциплина' },
];

// Ключ для localStorage настроек колонок таблицы турнира
const TOURNAMENT_COLUMNS_STORAGE_KEY = 'tournament-players-visible-columns';

// Дефолтные видимые колонки (основные)
const DEFAULT_VISIBLE_COLUMNS = [
  'index', 'minutes', 'matches_played', 'goals', 'assists', 'xg', 'xa',
  'shots', 'shots_on_target', 'passes', 'passes_accurate_pct',
  'duels_success_pct', 'yellow_cards', 'red_cards'
];

// Типы секций внутри турнира
type TournamentSection = 'overview' | 'best_performances' | 'new_faces' | 'all_players' | 'last_round_players' | 'top_by_position';
type PeriodType = 'SEASON' | 'ROUND';

// Конфигурация плиток для страницы турнира
const TOURNAMENT_TILES = [
  {
    id: 'best_performances' as TournamentSection,
    title: 'Лучшие выступления за тур',
    description: 'Игроки с лучшими показателями в последнем туре',
    icon: StarIcon,
    color: 'from-amber-500 to-orange-600',
    bgColor: 'bg-gradient-to-br from-amber-50 to-orange-50',
    iconColor: 'text-amber-600',
  },
  {
    id: 'new_faces' as TournamentSection,
    title: 'Новые лица в этом туре',
    description: 'Игроки, впервые появившиеся в турнире',
    icon: UserPlusIcon,
    color: 'from-emerald-500 to-teal-600',
    bgColor: 'bg-gradient-to-br from-emerald-50 to-teal-50',
    iconColor: 'text-emerald-600',
  },
  {
    id: 'all_players' as TournamentSection,
    title: 'Все футболисты турнира',
    description: 'Полный список игроков со статистикой за сезон',
    icon: UsersIcon,
    color: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-gradient-to-br from-blue-50 to-indigo-50',
    iconColor: 'text-blue-600',
  },
  {
    id: 'top_by_position' as TournamentSection,
    title: 'Топ по позициям за сезон',
    description: 'Стабильность на дистанции — рейтинг PER90 за весь сезон',
    icon: ChartBarIcon,
    color: 'from-purple-500 to-pink-600',
    bgColor: 'bg-gradient-to-br from-purple-50 to-pink-50',
    iconColor: 'text-purple-600',
  }
];

// Helpers for sessionStorage persistence
function ssGet(key: string): string | null { try { return sessionStorage.getItem(key); } catch { return null; } }
function ssSet(key: string, val: string) { try { sessionStorage.setItem(key, val); } catch {} }
function ssRemove(key: string) { try { sessionStorage.removeItem(key); } catch {} }
function ssGetNum(key: string): number | null { const v = ssGet(key); return v !== null ? Number(v) : null; }

const VALID_SECTIONS: TournamentSection[] = ['overview', 'all_players', 'last_round_players', 'best_performances', 'top_by_position', 'new_faces'];

export const Tournaments: React.FC = () => {
  const { setSelectedPlayerId } = usePlayerNavigation();
  
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(() => ssGetNum('t_tournId'));
  const [selectedSection, setSelectedSection] = useState<TournamentSection>(() => {
    const saved = ssGet('t_section');
    return saved && VALID_SECTIONS.includes(saved as TournamentSection) ? saved as TournamentSection : 'overview';
  });
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTournament, setUploadTournament] = useState<Tournament | null>(null);
  const [roundUploadModalOpen, setRoundUploadModalOpen] = useState(false);
  const [roundUploadTournament, setRoundUploadTournament] = useState<Tournament | null>(null);
  
  // Состояния для таблицы игроков турнира
  const [sliceType, setSliceType] = useState<'TOTAL' | 'PER90'>('TOTAL');
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [sortField, setSortField] = useState<string | null>('goals');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Состояния для таблицы игроков за тур
  const [roundSearch, setRoundSearch] = useState('');
  const [roundSearchInput, setRoundSearchInput] = useState('');
  const [roundCurrentPage, setRoundCurrentPage] = useState(1);
  const [roundSortField, setRoundSortField] = useState<string | null>('goals');
  const [roundSortOrder, setRoundSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  // === Talent Scouting state ===
  const [analysisBaseline, setAnalysisBaseline] = useState<string>('LEAGUE');
  const [analysisSortBy, setAnalysisSortBy] = useState<string>('total_score');
  const [analysisFunnel, setAnalysisFunnel] = useState<string>('all');
  const [analysisRound, setAnalysisRound] = useState<number | null>(() => ssGetNum('t_analysisRound'));
  const [comparisonPlayerId, setComparisonPlayerId] = useState<number | null>(null);
  const [comparisonRound, setComparisonRound] = useState<number>(0);
  const [comparisonMode, setComparisonMode] = useState<'season' | 'round'>('season');
  const [tierEditorOpen, setTierEditorOpen] = useState(false);

  // Persist key navigation state to sessionStorage
  useEffect(() => {
    if (selectedTournamentId !== null) ssSet('t_tournId', String(selectedTournamentId));
    else ssRemove('t_tournId');
  }, [selectedTournamentId]);
  useEffect(() => { ssSet('t_section', selectedSection); }, [selectedSection]);
  useEffect(() => {
    if (analysisRound !== null) ssSet('t_analysisRound', String(analysisRound));
    else ssRemove('t_analysisRound');
  }, [analysisRound]);

  // Видимые колонки - загружаем из localStorage или используем дефолтные
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem(TOURNAMENT_COLUMNS_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_VISIBLE_COLUMNS;
      }
    }
    return DEFAULT_VISIBLE_COLUMNS;
  });

  const { data: tournamentsResponse, isLoading: isLoadingTournaments, refetch } = useTournaments();
  const tournaments: Tournament[] = tournamentsResponse?.data || [];
  const queryClient = useQueryClient();

  // Получаем актуальные данные турнира из списка
  const selectedTournament: Tournament | null = selectedTournamentId !== null 
    ? tournaments.find(t => t.id === selectedTournamentId) ?? null 
    : null;

  // Debounce для поиска (сезон)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Debounce для поиска (тур)
  useEffect(() => {
    const timer = setTimeout(() => {
      setRoundSearch(roundSearchInput);
      setRoundCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [roundSearchInput]);

  // Сброс состояния при смене турнира или секции
  useEffect(() => {
    if (selectedSection === 'all_players') {
      setSearchInput('');
      setSearch('');
      setCurrentPage(1);
      setSortField('goals');
      setSortOrder('desc');
      setSelectedSeason('__all__');
    }
    if (selectedSection === 'last_round_players') {
      setRoundSearchInput('');
      setRoundSearch('');
      setRoundCurrentPage(1);
      setRoundSortField('goals');
      setRoundSortOrder('desc');
      setSelectedRound(null);
    }
    if (selectedSection !== 'all_players') {
      setSelectedSeason(null);
    }
  }, [selectedTournamentId, selectedSection]);

  // Загружаем список доступных сезонов для турнира
  const { data: seasonsData } = useQuery(
    ['available-seasons', selectedTournamentId],
    () => apiService.getAvailableSeasons(selectedTournamentId!),
    {
      enabled: selectedTournamentId !== null,
      refetchOnWindowFocus: false,
    }
  );
  const availableSeasons: { period_value: string; players_count: number; has_scores: boolean }[] = seasonsData?.data || [];
  const currentSeason = seasonsData?.current || null;
  const effectiveSeason = selectedSeason ?? currentSeason;

  // Загружаем корзины команд для турнира
  const { data: tierData } = useQuery(
    ['team-tiers', selectedTournamentId],
    () => apiService.getTeamTiers(selectedTournamentId!),
    { enabled: selectedTournamentId !== null, refetchOnWindowFocus: false }
  );
  const teamTierMap: Record<string, string | null> = {};
  if (tierData?.data) {
    for (const t of tierData.data) {
      teamTierMap[t.team_name] = t.tier;
    }
  }

  // Загружаем данные игроков турнира (за сезон)
  const { data: playersData, isLoading: isLoadingPlayers } = useQuery(
    ['tournament-players', selectedTournamentId, sliceType, search, currentPage, itemsPerPage, sortField, sortOrder, selectedSeason],
    () => apiService.getAllPlayersFromDatabase(
      currentPage,
      itemsPerPage,
      sliceType,
      search || undefined,
      selectedTournamentId ?? undefined,
      undefined,
      sortField || undefined,
      sortOrder,
      'SEASON',
      undefined,
      selectedSeason === '__all__' ? false : true,
      selectedSeason && selectedSeason !== '__all__' ? selectedSeason : undefined
    ),
    {
      enabled: selectedSection === 'all_players' && selectedTournamentId !== null,
      keepPreviousData: true,
      refetchOnWindowFocus: false
    }
  );

  // Получаем список загруженных туров для турнира
  const { data: roundsData } = useQuery(
    ['tournament-rounds', selectedTournamentId],
    () => apiService.getTournamentRounds(selectedTournamentId!),
    {
      enabled: selectedTournamentId !== null,
      refetchOnWindowFocus: false
    }
  );
  
  // Список доступных туров
  const availableRounds = roundsData?.rounds || [];
  const currentRound = selectedTournament?.current_round || 0;
  
  // Последний загруженный тур (максимальный из availableRounds)
  const lastLoadedRound = availableRounds.length > 0 ? Math.max(...availableRounds) : currentRound;
  
  // Выбранный тур для отображения (по умолчанию - последний загруженный, а не current_round)
  const displayRound = selectedRound ?? lastLoadedRound;

  // Загружаем данные игроков за выбранный тур (всегда TOTAL - тур = 90 минут)
  const { data: roundPlayersData, isLoading: isLoadingRoundPlayers } = useQuery(
    ['round-players', selectedTournamentId, displayRound, roundSearch, roundCurrentPage, itemsPerPage, roundSortField, roundSortOrder],
    () => apiService.getAllPlayersFromDatabase(
      roundCurrentPage,
      itemsPerPage,
      'TOTAL',
      roundSearch || undefined,
      selectedTournamentId ?? undefined,
      undefined,
      roundSortField || undefined,
      roundSortOrder,
      'ROUND',
      displayRound
    ),
    {
      enabled: selectedSection === 'last_round_players' && selectedTournamentId !== null && displayRound > 0,
      keepPreviousData: true,
      refetchOnWindowFocus: false
    }
  );

  const handleTournamentClick = (tournament: Tournament) => {
    refetch();
    setSelectedTournamentId(tournament.id);
    setSelectedSection('overview');
  };

  const handleBackToTournaments = () => {
    setSelectedTournamentId(null);
    setSelectedSection('overview');
  };

  const handleBackToOverview = () => {
    setSelectedSection('overview');
  };

  const handleTileClick = (sectionId: TournamentSection) => {
    setSelectedSection(sectionId);
  };

  const handleUploadClick = (tournament: Tournament, e: React.MouseEvent) => {
    e.stopPropagation();
    setUploadTournament(tournament);
    setUploadModalOpen(true);
  };

  const handleRoundUploadClick = (tournament: Tournament, e: React.MouseEvent) => {
    e.stopPropagation();
    setRoundUploadTournament(tournament);
    setRoundUploadModalOpen(true);
  };

  const handleUploadSuccess = () => {
    queryClient.invalidateQueries(['tournaments']);
    queryClient.invalidateQueries(['database-players']);
    queryClient.invalidateQueries(['tournament-players']);
  };

  const handleClearDatabase = async () => {
    if (!window.confirm('⚠️ ВНИМАНИЕ!\n\nЭто удалит ВСЕ данные из базы (игроков и статистику).\nТурниры и справочники останутся.\n\nПродолжить?')) {
      return;
    }

    try {
      await apiService.clearDatabase();
      window.alert('✅ База данных очищена успешно!');
      queryClient.invalidateQueries(['tournaments']);
      queryClient.invalidateQueries(['database-players']);
      queryClient.invalidateQueries(['tournament-players']);
    } catch (error: any) {
      window.alert(`❌ Ошибка очистки: ${error.message}`);
    }
  };

  // Обработчик сортировки
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  // Форматирование значений
  const formatValue = (value: number | null | undefined, col: ColumnDef): string => {
    if (value === null || value === undefined) return '—';
    if (col.isPercent) return `${value.toFixed(1)}%`;
    if (col.isXg) return value.toFixed(2);
    return value % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
  };

  // Рендер иконки сортировки
  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return <span className="ml-1 text-gray-300"><ChevronUpIcon className="w-3 h-3 inline" /></span>;
    }
    return (
      <span className="ml-1 text-blue-500">
        {sortOrder === 'asc' ? <ChevronUpIcon className="w-3 h-3 inline" /> : <ChevronDownIcon className="w-3 h-3 inline" />}
      </span>
    );
  };

  // ========================================
  // РЕНДЕР: Заглушка для секций в разработке
  // ========================================
  const renderStubSection = (sectionId: TournamentSection) => {
    const tile = TOURNAMENT_TILES.find(t => t.id === sectionId);
    if (!tile || !selectedTournament) return null;

    const IconComponent = tile.icon;

    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="secondary" size="sm" onClick={handleBackToOverview}>
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Назад к разделам
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tile.title}</h1>
            <p className="text-gray-600">{selectedTournament.full_name}</p>
          </div>
        </div>

        <Card>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-16">
              <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${tile.color} flex items-center justify-center mb-6 shadow-lg`}>
                <IconComponent className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Раздел в разработке
              </h2>
              <p className="text-gray-500 text-center max-w-md mb-6">
                {tile.description}. Таблицы для хранения данных создаются заново.
              </p>
              <Badge variant="warning" size="lg">
                В разработке
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ========================================
  // РЕНДЕР: Лучшие выступления за тур (Phase 6)
  // ========================================
  const renderBestPerformancesSection = () => {
    if (!selectedTournament) return null;

    const displayAnalysisRound = analysisRound ?? lastLoadedRound;

    return <BestPerformancesSection
      tournament={selectedTournament}
      displayRound={displayAnalysisRound}
      availableRounds={availableRounds}
      baseline={analysisBaseline}
      setBaseline={setAnalysisBaseline}
      sortBy={analysisSortBy}
      setSortBy={setAnalysisSortBy}
      funnel={analysisFunnel}
      setFunnel={setAnalysisFunnel}
      setAnalysisRound={(r: number) => setAnalysisRound(r)}
      onBack={handleBackToOverview}
      onPlayerClick={(pid: number) => { setComparisonPlayerId(pid); setComparisonRound(displayAnalysisRound); setComparisonMode('round'); }}
      onTierEditorOpen={() => setTierEditorOpen(true)}
      teamTierMap={teamTierMap}
    />;
  };

  // ========================================
  // РЕНДЕР: Топ по позициям за сезон (Phase 7)
  // ========================================
  const renderTopByPositionSection = () => {
    if (!selectedTournament) return null;

    const displayAnalysisRound = analysisRound ?? lastLoadedRound;

    return <TopByPositionSection
      tournament={selectedTournament}
      displayRound={displayAnalysisRound}
      availableRounds={availableRounds}
      baseline={analysisBaseline}
      setBaseline={setAnalysisBaseline}
      sortBy={analysisSortBy}
      setSortBy={setAnalysisSortBy}
      funnel={analysisFunnel}
      setFunnel={setAnalysisFunnel}
      setAnalysisRound={(r: number) => setAnalysisRound(r)}
      onBack={handleBackToOverview}
      onPlayerClick={(pid: number) => { setComparisonPlayerId(pid); setComparisonRound(displayAnalysisRound); setComparisonMode('season'); }}
      onTierEditorOpen={() => setTierEditorOpen(true)}
      selectedSeason={selectedSeason}
      availableSeasons={availableSeasons}
      onSeasonChange={(s) => { setSelectedSeason(s); }}
      teamTierMap={teamTierMap}
    />;
  };

  // ========================================
  // РЕНДЕР: Все игроки турнира (полная таблица)
  // ========================================
  const renderAllPlayersSection = () => {
    if (!selectedTournament) return null;

    const players = playersData?.data || [];
    const totalCount = playersData?.total || 0;
    const totalPages = playersData?.pages || 0;

    const showSeasonCol = selectedSeason === '__all__';
    // Фильтруем колонки по видимым
    const displayedColumns = PLAYER_COLUMNS.filter(col => visibleColumns.includes(col.key));
    const totalColumnsCount = displayedColumns.length + 3 + (showSeasonCol ? 1 : 0);

    return (
      <div className="space-y-6">
        {/* Заголовок */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="secondary" size="sm" onClick={handleBackToOverview}>
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Назад к разделам
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Все футболисты турнира</h1>
              <p className="text-gray-600">
                {selectedTournament.full_name} ({displayedColumns.length} из {PLAYER_COLUMNS.length} параметров)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Кнопка загрузки сезона */}
            <button
              onClick={(e) => handleUploadClick(selectedTournament, e)}
              className="p-2.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all group/upload relative"
              title="Загрузить данные за сезон"
            >
              <CloudArrowUpIcon className="w-8 h-8" />
              
              {/* Tooltip */}
              <div className="absolute bottom-full right-0 mb-2 hidden group-hover/upload:block z-50">
                <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                  Загрузить сезон
                  <div className="absolute top-full right-4 -mt-1">
                    <div className="w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </div>
              </div>
            </button>

            {/* Кнопка загрузки тура */}
            <button
              onClick={(e) => handleRoundUploadClick(selectedTournament, e)}
              className="p-2.5 text-yellow-500 hover:text-yellow-700 hover:bg-yellow-50 rounded-lg transition-all group/round-upload relative"
              title="Загрузить тур"
            >
              <FlagIcon className="w-8 h-8" />
              
              {/* Tooltip */}
              <div className="absolute bottom-full right-0 mb-2 hidden group-hover/round-upload:block z-50">
                <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                  Загрузить тур
                  <div className="absolute top-full right-4 -mt-1">
                    <div className="w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </div>
              </div>
            </button>

            {/* Тумблер TOTAL / PER90 */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => { setSliceType('TOTAL'); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  sliceType === 'TOTAL' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Всего
              </button>
              <button
                onClick={() => { setSliceType('PER90'); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  sliceType === 'PER90' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                За 90 минут
              </button>
            </div>

            {/* Селектор сезона */}
            <select
              value={selectedSeason ?? ''}
              onChange={(e) => { setSelectedSeason(e.target.value || null); setCurrentPage(1); }}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-700 cursor-pointer hover:border-purple-300 focus:outline-none focus:ring-1 focus:ring-purple-400"
            >
              <option value="__all__">Все сезоны</option>
              {availableSeasons.map(s => (
                <option key={s.period_value} value={s.period_value}>
                  Сезон {s.period_value} ({s.players_count} игр.)
                </option>
              ))}
            </select>

            {/* Настроить корзины */}
            <button
              onClick={() => setTierEditorOpen(true)}
              className="px-3 py-2 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors flex items-center gap-1"
              title="Настроить корзины команд"
            >
              <ArrowsUpDownIcon className="w-4 h-4" />
              Корзины
            </button>
          </div>
        </div>

        {/* Поиск и настройки */}
        <Card>
          <CardContent>
            <div className="flex gap-4 items-center">
              <div className="flex-1 relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Начните вводить имя игрока или команду..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {searchInput && (
                  <button
                    onClick={() => setSearchInput('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Кнопка настройки колонок */}
              <TableColumnsSettings
                columns={PLAYER_COLUMNS}
                visibleColumns={visibleColumns}
                onColumnsChange={setVisibleColumns}
                storageKey={TOURNAMENT_COLUMNS_STORAGE_KEY}
              />
            </div>
          </CardContent>
        </Card>

        {/* Таблица */}
        <Card>
          <CardHeader>
            <CardTitle>
              {search ? `Результаты поиска: ${totalCount}` : `Всего игроков: ${totalCount}`}
              {' '}
              <span className="text-sm font-normal text-gray-500">
                ({sliceType === 'TOTAL' ? 'суммарная статистика' : 'статистика за 90 минут'})
              </span>
              {sortField && (
                <span className="ml-2 text-sm font-normal text-blue-500">
                  Сортировка: {PLAYER_COLUMNS.find(c => c.key === sortField)?.label || sortField} ({sortOrder === 'asc' ? '↑' : '↓'})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {/* Замороженные заголовки */}
                      <th onClick={() => handleSort('full_name')} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 sticky left-0 z-20 min-w-[180px]">
                        <span className="flex items-center whitespace-nowrap">Игрок{renderSortIcon('full_name')}</span>
                      </th>
                      <th onClick={() => handleSort('team_name')} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 sticky left-[180px] z-20 min-w-[140px]">
                        <span className="flex items-center whitespace-nowrap">Команда{renderSortIcon('team_name')}</span>
                      </th>
                      <th className={`px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 border-b border-gray-200 sticky left-[320px] z-20 w-[60px]`} style={showSeasonCol ? undefined : { boxShadow: '4px 0 6px -2px rgba(0, 0, 0, 0.1)' }}>
                        <span className="whitespace-nowrap">Поз</span>
                      </th>
                      {showSeasonCol && (
                        <th onClick={() => handleSort('season')} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 border-b border-gray-200 sticky left-[380px] z-20 w-[70px] cursor-pointer hover:bg-gray-100" style={{ boxShadow: '4px 0 6px -2px rgba(0, 0, 0, 0.1)' }}>
                          <span className="flex items-center whitespace-nowrap">Сезон{renderSortIcon('season')}</span>
                        </th>
                      )}
                      
                      {/* Скроллящиеся заголовки - только видимые */}
                      {displayedColumns.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                          title={col.label}
                        >
                          <span className="flex items-center justify-end">
                            {col.shortLabel || col.label}
                            {renderSortIcon(col.key)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="bg-white divide-y divide-gray-200">
                    {isLoadingPlayers ? (
                      <tr>
                        <td colSpan={totalColumnsCount} className="px-6 py-12 text-center">
                          <div className="flex items-center justify-center">
                            <svg className="animate-spin h-8 w-8 text-blue-500 mr-3" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-gray-500">Загрузка данных...</span>
                          </div>
                        </td>
                      </tr>
                    ) : players.length === 0 ? (
                      <tr>
                        <td colSpan={totalColumnsCount} className="px-6 py-12 text-center text-gray-500">
                          {search ? 'Ничего не найдено' : 'Нет данных'}
                        </td>
                      </tr>
                    ) : (
                      players.map((player: any, rowIdx: number) => {
                        const rowBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-[#f9fafb]';
                        return (
                          <tr 
                            key={player.player_id} 
                            onClick={() => setSelectedPlayerId(player.player_id)}
                            className={`hover:bg-blue-50 transition-colors cursor-pointer ${rowBg}`}
                          >
                            <td className={`px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline sticky left-0 z-10 min-w-[180px] whitespace-nowrap ${rowBg}`}>
                              {player.full_name}
                            </td>
                            <td className={`px-3 py-2 text-sm text-gray-600 sticky left-[180px] z-10 min-w-[140px] whitespace-nowrap ${rowBg}`}>
                              <span className="flex items-center gap-1.5">
                                {player.team_name}
                                {teamTierMap[player.team_name] === 'TOP' && (
                                  <span className="inline-flex w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Верхняя корзина" />
                                )}
                                {teamTierMap[player.team_name] === 'BOTTOM' && (
                                  <span className="inline-flex w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" title="Нижняя корзина" />
                                )}
                              </span>
                            </td>
                            <td className={`px-3 py-2 text-sm sticky left-[320px] z-10 w-[60px] ${rowBg}`} style={showSeasonCol ? undefined : { boxShadow: '4px 0 6px -2px rgba(0, 0, 0, 0.1)' }}>
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800">
                                {player.position_code}
                              </span>
                            </td>
                            {showSeasonCol && (
                              <td className={`px-3 py-2 text-xs text-gray-500 sticky left-[380px] z-10 w-[70px] ${rowBg}`} style={{ boxShadow: '4px 0 6px -2px rgba(0, 0, 0, 0.1)' }}>
                                {player.season || '—'}
                              </td>
                            )}
                            
                            {/* Только видимые колонки */}
                            {displayedColumns.map((col) => {
                              const value = player[col.key];
                              const formattedValue = formatValue(value, col);
                              
                              let cellClass = 'px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap';
                              if (col.key === 'goals' || col.key === 'assists') cellClass += ' font-semibold';
                              if (col.isXg) cellClass += ' text-purple-600 font-medium';
                              if (col.key === 'yellow_cards') cellClass += ' text-yellow-600';
                              if (col.key === 'red_cards') cellClass += ' text-red-600';
                              if (col.isPercent) cellClass += ' text-gray-500';
                              
                              return <td key={col.key} className={cellClass}>{formattedValue}</td>;
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Пагинация */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Показано {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalCount)} из {totalCount}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Назад
                  </button>
                  <span className="text-sm text-gray-600">Страница {currentPage} из {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Вперед →
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // ========================================
  // РЕНДЕР: Игроки за последний тур
  // ========================================
  const renderLastRoundPlayersSection = () => {
    if (!selectedTournament) return null;

    const players = roundPlayersData?.data || [];
    const totalCount = roundPlayersData?.total || 0;
    const totalPages = roundPlayersData?.pages || 0;
    const roundNum = displayRound; // Используем выбранный тур

    // Фильтруем колонки по видимым
    const displayedColumns = PLAYER_COLUMNS.filter(col => visibleColumns.includes(col.key));
    const totalColumnsCount = displayedColumns.length + 3; // +3 за Игрок, Команда, Поз

    const handleRoundSort = (field: string) => {
      if (roundSortField === field) {
        setRoundSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setRoundSortField(field);
        setRoundSortOrder('desc');
      }
    };

    const renderRoundSortIcon = (field: string) => {
      if (roundSortField !== field) return null;
      return roundSortOrder === 'asc' 
        ? <ArrowUpIcon className="ml-1 w-3 h-3 text-gray-500" />
        : <ArrowDownIcon className="ml-1 w-3 h-3 text-gray-500" />;
    };

    if (roundNum === 0) {
      return (
        <div className="space-y-6">
          <div className="flex items-center space-x-4">
            <Button variant="secondary" size="sm" onClick={handleBackToOverview}>
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Назад к разделам
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Статистика за тур</h1>
              <p className="text-gray-600">{selectedTournament.full_name}</p>
            </div>
          </div>

          <Card>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center mb-6 shadow-lg">
                  <FlagIcon className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Данные за тур не загружены
                </h2>
                <p className="text-gray-500 text-center max-w-md mb-6">
                  Загрузите данные за тур, используя кнопку загрузки на странице турниров
                </p>
                <Badge variant="warning" size="lg">
                  🏁 Нет данных
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Заголовок */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="secondary" size="sm" onClick={handleBackToOverview}>
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Назад к разделам
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <FlagIcon className="w-6 h-6 mr-2 text-yellow-500" />
                Статистика за тур {roundNum}
                {roundNum === currentRound && availableRounds.length > 1 && (
                  <span className="ml-2 text-sm font-normal text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded">
                    последний
                  </span>
                )}
              </h1>
              <p className="text-gray-600">
                {selectedTournament.full_name} • {availableRounds.length} тур{availableRounds.length > 1 ? 'ов' : ''} загружено • ({displayedColumns.length} из {PLAYER_COLUMNS.length} параметров)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Настроить корзины */}
            <button
              onClick={() => setTierEditorOpen(true)}
              className="px-3 py-2 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors flex items-center gap-1"
              title="Настроить корзины команд"
            >
              <ArrowsUpDownIcon className="w-4 h-4" />
              Корзины
            </button>

            {/* Кнопка загрузки тура */}
            <button
              onClick={(e) => handleRoundUploadClick(selectedTournament, e)}
              className="p-2.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all group/upload relative"
              title="Загрузить новый тур"
            >
              <CloudArrowUpIcon className="w-8 h-8" />
              
              {/* Tooltip */}
              <div className="absolute bottom-full right-0 mb-2 hidden group-hover/upload:block z-50">
                <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                  Загрузить новый тур
                  <div className="absolute top-full right-4 -mt-1">
                    <div className="w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Поиск и настройки */}
        <Card>
          <CardContent>
            <div className="flex gap-4 items-center">
              {/* Переключатель туров с кнопками навигации */}
              {availableRounds.length > 0 && (
                <div className="flex items-center gap-1">
                  {/* Кнопка "Предыдущий тур" */}
                  <button
                    onClick={() => {
                      const sortedRounds = [...availableRounds].sort((a, b) => a - b);
                      const currentIndex = sortedRounds.indexOf(displayRound);
                      if (currentIndex > 0) {
                        setSelectedRound(sortedRounds[currentIndex - 1]);
                        setRoundCurrentPage(1);
                      }
                    }}
                    disabled={displayRound === Math.min(...availableRounds)}
                    className="p-2 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    title="Предыдущий тур"
                  >
                    <ChevronLeftIcon className="w-5 h-5" />
                  </button>

                  {/* Выпадающий список для выбора конкретного тура */}
                  <select
                    value={displayRound}
                    onChange={(e) => {
                      setSelectedRound(Number(e.target.value));
                      setRoundCurrentPage(1);
                    }}
                    className="px-4 py-2 border border-yellow-300 rounded-lg bg-yellow-50 text-yellow-800 font-bold text-center focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 cursor-pointer min-w-[100px]"
                  >
                    {availableRounds.map((round) => (
                      <option key={round} value={round}>
                        Тур {round}{round === currentRound ? ' ★' : ''}
                      </option>
                    ))}
                  </select>

                  {/* Кнопка "Следующий тур" */}
                  <button
                    onClick={() => {
                      const sortedRounds = [...availableRounds].sort((a, b) => a - b);
                      const currentIndex = sortedRounds.indexOf(displayRound);
                      if (currentIndex < sortedRounds.length - 1) {
                        setSelectedRound(sortedRounds[currentIndex + 1]);
                        setRoundCurrentPage(1);
                      }
                    }}
                    disabled={displayRound === Math.max(...availableRounds)}
                    className="p-2 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    title="Следующий тур"
                  >
                    <ChevronRightIcon className="w-5 h-5" />
                  </button>
                </div>
              )}

              <div className="flex-1 relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={roundSearchInput}
                  onChange={(e) => setRoundSearchInput(e.target.value)}
                  placeholder="Начните вводить имя игрока или команду..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
                {roundSearchInput && (
                  <button
                    onClick={() => setRoundSearchInput('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Кнопка настройки колонок */}
              <TableColumnsSettings
                columns={PLAYER_COLUMNS}
                visibleColumns={visibleColumns}
                onColumnsChange={setVisibleColumns}
                storageKey={TOURNAMENT_COLUMNS_STORAGE_KEY}
              />
            </div>
          </CardContent>
        </Card>

        {/* Таблица */}
        <Card className="border-yellow-200">
          <CardHeader className="bg-yellow-50/50">
            <CardTitle className="flex items-center">
              <FlagIcon className="w-5 h-5 mr-2 text-yellow-600" />
              {roundSearch ? `Результаты поиска: ${totalCount}` : `Игроков за тур ${roundNum}: ${totalCount}`}
              {roundSortField && (
                <span className="ml-2 text-sm font-normal text-yellow-600">
                  Сортировка: {PLAYER_COLUMNS.find(c => c.key === roundSortField)?.label || roundSortField} ({roundSortOrder === 'asc' ? '↑' : '↓'})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-yellow-50 sticky top-0 z-10">
                    <tr>
                      {/* Замороженные заголовки */}
                      <th onClick={() => handleRoundSort('full_name')} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-yellow-50 border-b border-yellow-200 cursor-pointer hover:bg-yellow-100 sticky left-0 z-20 min-w-[180px]">
                        <span className="flex items-center whitespace-nowrap">Игрок{renderRoundSortIcon('full_name')}</span>
                      </th>
                      <th onClick={() => handleRoundSort('team_name')} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-yellow-50 border-b border-yellow-200 cursor-pointer hover:bg-yellow-100 sticky left-[180px] z-20 min-w-[140px]">
                        <span className="flex items-center whitespace-nowrap">Команда{renderRoundSortIcon('team_name')}</span>
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-yellow-50 border-b border-yellow-200 sticky left-[320px] z-20 w-[60px]" style={{ boxShadow: '4px 0 6px -2px rgba(0, 0, 0, 0.1)' }}>
                        <span className="whitespace-nowrap">Поз</span>
                      </th>
                      
                      {/* Скроллящиеся заголовки - только видимые */}
                      {displayedColumns.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleRoundSort(col.key)}
                          className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider bg-yellow-50 border-b border-yellow-200 cursor-pointer hover:bg-yellow-100 whitespace-nowrap"
                          title={col.label}
                        >
                          <span className="flex items-center justify-end">
                            {col.shortLabel || col.label}
                            {renderRoundSortIcon(col.key)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="bg-white divide-y divide-gray-200">
                    {isLoadingRoundPlayers ? (
                      <tr>
                        <td colSpan={totalColumnsCount} className="px-6 py-12 text-center">
                          <div className="flex items-center justify-center">
                            <svg className="animate-spin h-8 w-8 text-yellow-500 mr-3" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-gray-500">Загрузка данных за тур {roundNum}...</span>
                          </div>
                        </td>
                      </tr>
                    ) : players.length === 0 ? (
                      <tr>
                        <td colSpan={totalColumnsCount} className="px-6 py-12 text-center text-gray-500">
                          {roundSearch ? 'Ничего не найдено' : `Нет данных за тур ${roundNum}. Загрузите данные через кнопку "Загрузить тур".`}
                        </td>
                      </tr>
                    ) : (
                      players.map((player: any, rowIdx: number) => {
                        const rowBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-yellow-50/30';
                        return (
                          <tr 
                            key={player.player_id} 
                            onClick={() => setSelectedPlayerId(player.player_id)}
                            className={`hover:bg-yellow-50 transition-colors cursor-pointer ${rowBg}`}
                          >
                            <td className={`px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline sticky left-0 z-10 min-w-[180px] whitespace-nowrap ${rowBg}`}>
                              {player.full_name}
                            </td>
                            <td className={`px-3 py-2 text-sm text-gray-600 sticky left-[180px] z-10 min-w-[140px] whitespace-nowrap ${rowBg}`}>
                              <span className="flex items-center gap-1.5">
                                {player.team_name}
                                {teamTierMap[player.team_name] === 'TOP' && (
                                  <span className="inline-flex w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Верхняя корзина" />
                                )}
                                {teamTierMap[player.team_name] === 'BOTTOM' && (
                                  <span className="inline-flex w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" title="Нижняя корзина" />
                                )}
                              </span>
                            </td>
                            <td className={`px-3 py-2 text-sm sticky left-[320px] z-10 w-[60px] ${rowBg}`} style={{ boxShadow: '4px 0 6px -2px rgba(0, 0, 0, 0.1)' }}>
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-800">
                                {player.position_code}
                              </span>
                            </td>
                            
                            {/* Только видимые колонки */}
                            {displayedColumns.map((col) => {
                              const value = player[col.key];
                              const formattedValue = formatValue(value, col);
                              
                              let cellClass = 'px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap';
                              if (col.key === 'goals' || col.key === 'assists') cellClass += ' font-semibold';
                              if (col.isXg) cellClass += ' text-purple-600 font-medium';
                              if (col.key === 'yellow_cards') cellClass += ' text-yellow-600';
                              if (col.key === 'red_cards') cellClass += ' text-red-600';
                              if (col.isPercent) cellClass += ' text-gray-500';
                              
                              return <td key={col.key} className={cellClass}>{formattedValue}</td>;
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Пагинация */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-yellow-50/50 border-t border-yellow-200">
                <div className="text-sm text-gray-600">
                  Показано {(roundCurrentPage - 1) * itemsPerPage + 1} - {Math.min(roundCurrentPage * itemsPerPage, totalCount)} из {totalCount}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRoundCurrentPage(p => Math.max(1, p - 1))}
                    disabled={roundCurrentPage === 1}
                    className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Назад
                  </button>
                  <span className="text-sm text-gray-600">Страница {roundCurrentPage} из {totalPages}</span>
                  <button
                    onClick={() => setRoundCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={roundCurrentPage === totalPages}
                    className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Вперед →
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // ========================================
  // РЕНДЕР: Обзор турнира (4 плитки)
  // ========================================
  const renderTournamentOverview = () => {
    if (!selectedTournament) return null;

    return (
      <div className="space-y-6">
        {/* Заголовок */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="secondary" size="sm" onClick={handleBackToTournaments}>
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Все турниры
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{selectedTournament.full_name}</h1>
              <p className="text-gray-600">Выберите раздел для просмотра</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => handleUploadClick(selectedTournament, e)}
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <CloudArrowUpIcon className="w-4 h-4 mr-1.5" />
              Загрузить сезон
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => handleRoundUploadClick(selectedTournament, e)}
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              <CloudArrowUpIcon className="w-4 h-4 mr-1.5" />
              Загрузить тур
            </Button>
          </div>
        </div>

        {/* Информация о турнире */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Плитка "Всего игроков" - кликабельная */}
          <Card 
            hover 
            className="cursor-pointer group/players transition-all duration-200 hover:shadow-lg hover:border-blue-300"
            onClick={() => handleTileClick('all_players')}
          >
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover/players:bg-blue-200 transition-colors">
                    <UsersIcon className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">Всего игроков</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {selectedTournament.players_count || 0}
                    </p>
                  </div>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-gray-300 group-hover/players:text-blue-500 group-hover/players:translate-x-1 transition-all" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <CalendarIcon className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Последнее обновление</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {selectedTournament.last_update 
                      ? formatDateShort(selectedTournament.last_update)
                      : 'Нет данных'
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Плитка "Текущий тур" - кликабельная */}
          <Card 
            hover 
            className={`${selectedTournament.current_round ? 'cursor-pointer group/round transition-all duration-200 hover:shadow-lg hover:border-yellow-300' : ''}`}
            onClick={() => selectedTournament.current_round && handleTileClick('last_round_players')}
          >
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center ${selectedTournament.current_round ? 'group-hover/round:bg-yellow-200' : ''} transition-colors`}>
                    <span className="text-yellow-600 font-bold text-lg">
                      {selectedTournament.current_round || '—'}
                    </span>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">Текущий тур</p>
                    <p className={`text-lg font-bold ${selectedTournament.current_round ? 'text-yellow-600' : 'text-gray-900'}`}>
                      {selectedTournament.current_round 
                        ? `Тур ${selectedTournament.current_round}`
                        : 'Не указан'
                      }
                    </p>
                  </div>
                </div>
                {selectedTournament.current_round && (
                  <ChevronRightIcon className="w-5 h-5 text-gray-300 group-hover/round:text-yellow-500 group-hover/round:translate-x-1 transition-all" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <TrophyIcon className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Турнир</p>
                  <p className="text-lg font-bold text-gray-900">{selectedTournament.code.toUpperCase()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 4 плитки (2x2) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TOURNAMENT_TILES.map((tile) => {
            const IconComponent = tile.icon;
            const isReady = tile.id === 'all_players' || tile.id === 'best_performances' || tile.id === 'top_by_position';
            
            // Определяем значение для каждой плитки
            const getTileValue = () => {
              if (tile.id === 'all_players') {
                return selectedTournament.players_count || 0;
              }
              return '—';
            };
            
            // Определяем label для значения
            const getTileLabel = () => {
              if (tile.id === 'all_players') {
                return 'Игроков в базе';
              }
              return 'Статус';
            };

            return (
              <div
                key={tile.id}
                onClick={() => handleTileClick(tile.id)}
                className={`
                  relative overflow-hidden rounded-xl border border-gray-200 
                  ${tile.bgColor} 
                  cursor-pointer transition-all duration-300 
                  hover:shadow-lg hover:scale-[1.02] hover:border-gray-300
                  group
                `}
              >
                {/* Бейдж только для секций в разработке */}
                {!isReady && (
                  <div className="absolute top-3 right-3">
                    <Badge variant="warning" size="sm">
                      🚧 В разработке
                    </Badge>
                  </div>
                )}

                <div className="p-6">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${tile.color} flex items-center justify-center mb-4 shadow-md`}>
                    <IconComponent className="w-7 h-7 text-white" />
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{tile.title}</h3>
                  <p className="text-sm text-gray-500 mb-4">{tile.description}</p>

                  <div className="flex items-center justify-between">
                    {tile.id === 'all_players' ? (
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">{getTileLabel()}</p>
                        <p className={`text-2xl font-bold ${tile.iconColor}`}>{getTileValue()}</p>
                      </div>
                    ) : (
                      <div />
                    )}
                    <ChevronRightIcon className="w-5 h-5 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ========================================
  // Секция: Новые лица
  // ========================================
  const renderNewFacesSection = () => {
    if (!selectedTournament) return null;
    return (
      <NewFacesSection
        tournament={selectedTournament}
        season={selectedSeason || undefined}
        onBack={handleBackToOverview}
        onPlayerClick={(pid: number) => {
          setComparisonPlayerId(pid);
          setComparisonMode('season');
        }}
        onOpenProfile={(pid: number) => setSelectedPlayerId(pid)}
      />
    );
  };

  // ========================================
  // ОСНОВНОЙ РЕНДЕР
  // ========================================
  
  // Рендер контента в зависимости от секции
  const renderContent = () => {
    if (selectedTournament) {
      if (selectedSection === 'overview') {
        return renderTournamentOverview();
      } else if (selectedSection === 'all_players') {
        return renderAllPlayersSection();
      } else if (selectedSection === 'last_round_players') {
        return renderLastRoundPlayersSection();
      } else if (selectedSection === 'best_performances') {
        return renderBestPerformancesSection();
      } else if (selectedSection === 'top_by_position') {
        return renderTopByPositionSection();
      } else if (selectedSection === 'new_faces') {
        return renderNewFacesSection();
      } else {
        return renderStubSection(selectedSection);
      }
    }

    // Список турниров
    return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Турниры</h1>
        <p className="text-gray-600">Выберите турнир для просмотра статистики и управления данными</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoadingTournaments ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent>
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/4"></div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          tournaments.map((tournament) => (
            <Card 
              key={tournament.id} 
              hover 
              className="cursor-pointer group transition-all duration-200 hover:shadow-lg"
              onClick={() => handleTournamentClick(tournament)}
            >
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm tournament-badge ${tournament.code.toLowerCase()}`}>
                        {tournament.code.toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                          {tournament.name}
                        </h3>
                        <p className="text-sm text-gray-500">{tournament.full_name}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex space-x-4">
                        <div className="text-sm">
                          <span className="text-gray-500">Игроков:</span>
                          <span className="font-semibold text-gray-900 ml-1">{tournament.players_count || 0}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Обновлено:</span>
                          <span className="font-semibold text-gray-900 ml-1">
                            {tournament.last_update 
                              ? formatDateShort(tournament.last_update)
                              : 'Нет данных'
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    {/* Иконка загрузки сезона */}
                    <button
                      onClick={(e) => handleUploadClick(tournament, e)}
                      className="p-2.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all group/upload relative"
                      title="Загрузить данные за сезон"
                    >
                      <CloudArrowUpIcon className="w-7 h-7" />
                      
                      {/* Tooltip */}
                      <div className="absolute bottom-full right-0 mb-2 hidden group-hover/upload:block z-50">
                        <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                          Загрузить сезон
                          <div className="absolute top-full right-4 -mt-1">
                            <div className="border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Иконка загрузки тура */}
                    <button
                      onClick={(e) => handleRoundUploadClick(tournament, e)}
                      className="p-2.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all group/round relative"
                      title="Загрузить данные за тур"
                    >
                      <FlagIcon className="w-6 h-6" />
                      
                      {/* Tooltip */}
                      <div className="absolute bottom-full right-0 mb-2 hidden group-hover/round:block z-50">
                        <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                          Загрузить тур
                          <div className="absolute top-full right-4 -mt-1">
                            <div className="border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </div>
                    </button>

                    <ChevronRightIcon className="w-6 h-6 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Дополнительные действия */}
      <Card>
        <CardHeader>
          <CardTitle>Дополнительные действия</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Button variant="secondary" fullWidth disabled>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Добавить турнир
            </Button>

            <Button variant="secondary" fullWidth disabled>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Сравнить турниры
            </Button>

            <Button variant="secondary" fullWidth disabled>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Экспорт отчёта
            </Button>

            <Button 
              variant="secondary" 
              fullWidth 
              onClick={handleClearDatabase}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              <TrashIcon className="w-4 h-4 mr-2" />
              Очистить БД
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
    );
  };

  // Основной return - контент + модалки (модалки всегда рендерятся)
  return (
    <>
      {renderContent()}

      {/* Модальное окно загрузки сезона */}
      {uploadTournament && (
        <TournamentUploadModal
          isOpen={uploadModalOpen}
          onClose={() => {
            setUploadModalOpen(false);
            setUploadTournament(null);
          }}
          tournamentId={uploadTournament.id}
          tournamentName={uploadTournament.full_name}
          onSuccess={handleUploadSuccess}
        />
      )}

      {/* Модальное окно загрузки тура */}
      {roundUploadTournament && (
        <RoundUploadModal
          isOpen={roundUploadModalOpen}
          onClose={() => {
            setRoundUploadModalOpen(false);
            setRoundUploadTournament(null);
          }}
          tournamentId={roundUploadTournament.id}
          tournamentName={roundUploadTournament.full_name}
          onSuccess={handleUploadSuccess}
        />
      )}

      {/* Карточка сравнения игрока */}
      {comparisonPlayerId !== null && selectedTournament && (
        <PlayerComparisonCard
          isOpen={true}
          onClose={() => setComparisonPlayerId(null)}
          tournamentId={selectedTournament.id}
          roundNumber={comparisonRound}
          playerId={comparisonPlayerId}
          mode={comparisonMode}
        />
      )}

      {/* Редактор корзин команд */}
      {selectedTournament && (
        <TierEditor
          isOpen={tierEditorOpen}
          onClose={() => setTierEditorOpen(false)}
          tournamentId={selectedTournament.id}
          tournamentName={selectedTournament.full_name}
        />
      )}
    </>
  );
};


// ================================================================
// Sub-components for analysis sections
// ================================================================

const BASELINE_OPTIONS = [
  { value: 'LEAGUE', label: 'Вся лига' },
  { value: 'TIER', label: 'По корзине' },
  { value: 'BENCHMARK', label: 'Эталон' },
];
const SORT_OPTIONS = [
  { value: 'total_score', label: 'Core + Support' },
  { value: 'core_score_adj', label: 'Core' },
  { value: 'support_score_adj', label: 'Support' },
  { value: 'good_share_core', label: 'Good%' },
];
const FUNNEL_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'p75', label: '75p+' },
  { value: 'p85', label: '85p+' },
  { value: 'p90', label: '90p+' },
];

interface AnalysisSectionProps {
  tournament: Tournament;
  displayRound: number;
  availableRounds: number[];
  baseline: string;
  setBaseline: (v: string) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  funnel: string;
  setFunnel: (v: string) => void;
  setAnalysisRound: (r: number) => void;
  onBack: () => void;
  onPlayerClick: (pid: number) => void;
  onTierEditorOpen?: () => void;
  selectedSeason?: string | null;
  availableSeasons?: { period_value: string; players_count: number; has_scores: boolean }[];
  onSeasonChange?: (season: string | null) => void;
  teamTierMap?: Record<string, string | null>;
}

function AnalysisControls({ baseline, setBaseline, sortBy, setSortBy, funnel, setFunnel, displayRound, availableRounds, setAnalysisRound, onTierEditorOpen, onTogglePositions, showPositions }: Partial<AnalysisSectionProps> & { displayRound: number; availableRounds: number[]; onTogglePositions?: () => void; showPositions?: boolean }) {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap gap-3 items-center">
          {/* Round selector */}
          {availableRounds.length > 0 && (
            <select
              value={displayRound}
              onChange={(e) => setAnalysisRound?.(Number(e.target.value))}
              className="px-3 py-2 border border-amber-300 rounded-lg bg-amber-50 text-amber-800 font-bold text-sm focus:ring-2 focus:ring-amber-500 cursor-pointer"
            >
              {availableRounds.map((r) => (
                <option key={r} value={r}>Тур {r}</option>
              ))}
            </select>
          )}

          {/* Baseline */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {BASELINE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setBaseline?.(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${baseline === opt.value ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortBy?.(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${sortBy === opt.value ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Funnel */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {FUNNEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFunnel?.(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${funnel === opt.value ? 'bg-white text-purple-600 shadow' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Tier editor button — always visible */}
          {onTierEditorOpen && (
            <button
              onClick={() => {
                setBaseline?.('TIER');
                onTierEditorOpen();
              }}
              className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors flex items-center gap-1"
            >
              <ArrowsUpDownIcon className="w-3.5 h-3.5" />
              Настроить корзины
            </button>
          )}

          {/* Top by position toggle */}
          {onTogglePositions && (
            <button
              onClick={onTogglePositions}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${
                showPositions
                  ? 'text-amber-800 bg-amber-200 hover:bg-amber-300'
                  : 'text-amber-700 bg-amber-100 hover:bg-amber-200'
              }`}
            >
              <ChartBarIcon className="w-3.5 h-3.5" />
              Топ по позициям
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreCell({ value, label }: { value: number | null; label?: string }) {
  if (value === null || value === undefined) return <span className="text-gray-300">—</span>;
  const pct = value * 100;
  let colorClass = 'text-gray-600';
  if (pct >= 90) colorClass = 'text-emerald-700 font-bold';
  else if (pct >= 80) colorClass = 'text-emerald-600 font-semibold';
  else if (pct >= 70) colorClass = 'text-blue-600 font-medium';
  else if (pct >= 50) colorClass = 'text-gray-700';
  else if (pct >= 30) colorClass = 'text-orange-600';
  else colorClass = 'text-red-500';
  return <span className={colorClass}>{pct.toFixed(0)}</span>;
}

function TierDot({ teamName, tierMap }: { teamName: string; tierMap?: Record<string, string | null> }) {
  if (!tierMap) return null;
  const tier = tierMap[teamName];
  if (tier === 'TOP') return <span className="inline-flex w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 ml-1" title="Верхняя корзина" />;
  if (tier === 'BOTTOM') return <span className="inline-flex w-2 h-2 rounded-full bg-orange-500 flex-shrink-0 ml-1" title="Нижняя корзина" />;
  return null;
}

function RiskBadges({ flags }: { flags: Record<string, any> }) {
  if (!flags || Object.keys(flags).length === 0) return null;
  const RISK_ICONS: Record<string, string> = {
    red_cards: 'KK',
    yellow_cards: 'ЖК',
    goal_errors: 'ГО',
    gross_errors: 'ГрО',
    fouls: 'Фол',
    losses: 'Пот',
    losses_own_half: 'ПотСв',
  };
  return (
    <div className="flex gap-1 flex-wrap">
      {Object.entries(flags).map(([k, v]) => (
        <span key={k} className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded">
          {RISK_ICONS[k] || k}: {String(v)}
        </span>
      ))}
    </div>
  );
}


const BEST_PAGE_SIZE = 15;

const BEST_SORTABLE_COLUMNS = [
  { key: 'core_score_adj', label: 'Core', align: 'right' as const },
  { key: 'support_score_adj', label: 'Support', align: 'right' as const },
  { key: 'total_score', label: 'Total', align: 'right' as const },
  { key: 'good_share_core', label: 'Good%', align: 'right' as const },
];

const BestPerformancesSection: React.FC<AnalysisSectionProps> = (props) => {
  const { tournament, displayRound, onBack, onPlayerClick, baseline, funnel } = props;

  // Local sort state (independent of global controls for column clicks)
  const [localSort, setLocalSort] = useState<string>('core_score_adj');
  const [localSortDir, setLocalSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [showPositions, setShowPositions] = useState(false);

  // Benchmark state
  const roundBenchmarkFileRef = useRef<HTMLInputElement>(null);
  const [roundBenchmarkUploading, setRoundBenchmarkUploading] = useState(false);
  const [roundBenchmarkLabel, setRoundBenchmarkLabel] = useState('');
  const [showRoundBenchmarkUpload, setShowRoundBenchmarkUpload] = useState(false);

  const { data: roundBenchmarkInfo, refetch: refetchRoundBenchmark } = useQuery(
    ['benchmark-info-round', tournament.id],
    () => apiService.getBenchmark(tournament.id),
    { staleTime: 30000 }
  );

  const handleRoundBenchmarkUpload = async (file: File) => {
    setRoundBenchmarkUploading(true);
    try {
      const label = roundBenchmarkLabel.trim() || file.name.replace(/\.(xlsx|xls)$/i, '');
      await apiService.uploadBenchmark(tournament.id, file, label);
      setRoundBenchmarkLabel('');
      setShowRoundBenchmarkUpload(false);
      refetchRoundBenchmark();
      alert('Эталон загружен. Нажмите «Пересчитать» чтобы перерасчёт тура включил сравнение с эталоном.');
    } catch (e: any) {
      alert('Ошибка загрузки: ' + (e?.response?.data?.detail || e?.message || 'unknown'));
    } finally {
      setRoundBenchmarkUploading(false);
    }
  };

  const handleDeleteRoundBenchmark = async () => {
    if (!window.confirm('Удалить эталонный сезон?')) return;
    try {
      await apiService.deleteBenchmark(tournament.id);
      refetchRoundBenchmark();
    } catch (e: any) {
      alert('Ошибка: ' + (e?.response?.data?.detail || e?.message || 'unknown'));
    }
  };

  const roundBenchmarkData = roundBenchmarkInfo?.data;

  // Fetch top data — request more to allow client-side pagination
  const { data, isLoading, refetch } = useQuery(
    ['round-top', tournament.id, displayRound, baseline, props.sortBy, funnel],
    () => apiService.getRoundTop(tournament.id, displayRound, { baseline_kind: baseline, sort_by: props.sortBy || 'core_score_adj', funnel, limit: 200 }),
    { enabled: displayRound > 0, keepPreviousData: true }
  );

  // Fetch top by position for round
  const { data: posByPosData, isLoading: posByPosLoading } = useQuery(
    ['round-top-position', tournament.id, displayRound, baseline, props.sortBy, funnel],
    () => apiService.getRoundTopByPosition(tournament.id, displayRound, { baseline_kind: baseline, sort_by: props.sortBy || 'core_score_adj', funnel, limit_per_position: 10 }),
    { enabled: displayRound > 0 && showPositions, keepPreviousData: true }
  );

  // Reset page on sort change
  useEffect(() => { setPage(1); }, [localSort, localSortDir, funnel, baseline, displayRound]);

  const allPlayers: any[] = data?.data || [];

  // Client-side sort
  const sorted = [...allPlayers].sort((a, b) => {
    const va = a[localSort] ?? -1;
    const vb = b[localSort] ?? -1;
    return localSortDir === 'desc' ? vb - va : va - vb;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / BEST_PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * BEST_PAGE_SIZE, page * BEST_PAGE_SIZE);

  const handleColumnSort = (key: string) => {
    if (localSort === key) {
      setLocalSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setLocalSort(key);
      setLocalSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (localSort !== col) return <ArrowsUpDownIcon className="w-3 h-3 ml-0.5 text-gray-300" />;
    return localSortDir === 'desc'
      ? <ArrowDownIcon className="w-3 h-3 ml-0.5 text-blue-600" />
      : <ArrowUpIcon className="w-3 h-3 ml-0.5 text-blue-600" />;
  };

  // Position groups for "top by position"
  const positions: Record<string, any> = posByPosData?.data || {};
  const positionGroups: Record<string, string[]> = { ATT: [], MID: [], DEF: [] };
  Object.entries(positions).forEach(([code, pos]: [string, any]) => {
    const group = pos.position_group || 'DEF';
    if (!positionGroups[group]) positionGroups[group] = [];
    positionGroups[group].push(code);
  });
  const GROUP_LABELS: Record<string, string> = { ATT: 'Атака', MID: 'Полузащита', DEF: 'Защита' };
  const GROUP_COLORS: Record<string, string> = {
    ATT: 'border-red-200 bg-red-50/30',
    MID: 'border-blue-200 bg-blue-50/30',
    DEF: 'border-green-200 bg-green-50/30',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button variant="secondary" size="sm" onClick={onBack}>
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          Назад к разделам
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <StarIcon className="w-6 h-6 mr-2 text-amber-500" />
            Лучшие выступления за тур
          </h1>
          <p className="text-gray-600">{tournament.full_name}</p>
        </div>
      </div>

      {/* Controls */}
      <AnalysisControls {...props} onTogglePositions={() => setShowPositions(!showPositions)} showPositions={showPositions} />

      {/* Benchmark info bar (shown when Эталон baseline is selected) */}
      {baseline === 'BENCHMARK' && (
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <StarIcon className="w-4 h-4 text-indigo-600" />
                </div>
                {roundBenchmarkData ? (
                  <div>
                    <p className="text-sm font-medium text-indigo-900">{roundBenchmarkData.label}</p>
                    <p className="text-xs text-indigo-500">
                      Загружен: {roundBenchmarkData.uploaded_at ? new Date(roundBenchmarkData.uploaded_at).toLocaleDateString('ru-RU') : '—'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-indigo-700">Эталонный сезон не загружен. Загрузите файл PER90 для сравнения.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {roundBenchmarkData && (
                  <button
                    onClick={handleDeleteRoundBenchmark}
                    className="px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <TrashIcon className="w-3.5 h-3.5 inline mr-1" />
                    Удалить
                  </button>
                )}
                <button
                  onClick={() => setShowRoundBenchmarkUpload(!showRoundBenchmarkUpload)}
                  className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition-colors flex items-center gap-1"
                >
                  <CloudArrowUpIcon className="w-3.5 h-3.5" />
                  {roundBenchmarkData ? 'Заменить' : 'Загрузить эталон'}
                </button>
              </div>
            </div>

            {showRoundBenchmarkUpload && (
              <div className="mt-3 pt-3 border-t border-indigo-200">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-indigo-700 mb-1">Название эталона (необязательно)</label>
                    <input
                      type="text"
                      value={roundBenchmarkLabel}
                      onChange={(e) => setRoundBenchmarkLabel(e.target.value)}
                      placeholder="Например: МФЛ 2024"
                      className="w-full px-3 py-1.5 text-sm border border-indigo-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <input
                      ref={roundBenchmarkFileRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleRoundBenchmarkUpload(f);
                        e.target.value = '';
                      }}
                    />
                    <button
                      onClick={() => roundBenchmarkFileRef.current?.click()}
                      disabled={roundBenchmarkUploading}
                      className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {roundBenchmarkUploading ? 'Загрузка...' : 'Выбрать файл .xlsx'}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-indigo-400 mt-1.5">
                  Файл должен содержать данные PER90 за сезон. Если не указать название — будет использовано имя файла.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===== Content: Table OR Top by Position ===== */}
      {!showPositions ? (
      <Card>
        <CardHeader className="bg-amber-50/50">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <StarIcon className="w-5 h-5 mr-2 text-amber-600" />
              Тур {displayRound} &middot; {sorted.length} игроков
            </span>
            <span className="text-xs font-normal text-gray-500">
              Стр. {page}/{totalPages}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <svg className="animate-spin h-6 w-6 text-amber-500 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Загрузка...
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 rounded-full flex items-center justify-center">
                <StarIcon className="w-8 h-8 text-amber-500" />
              </div>
              <p className="text-lg font-medium text-gray-700 mb-2">Нет данных для анализа</p>
              <p className="mb-6 max-w-md mx-auto">
                Для работы анализа нужны:<br/>
                <span className="font-medium">1)</span> Сезонные данные PER90<br/>
                <span className="font-medium">2)</span> Данные за конкретный тур
              </p>
              <button
                onClick={async () => {
                  try {
                    await apiService.recomputeRoundAnalysis(tournament.id, displayRound);
                    refetch();
                  } catch (e: any) {
                    alert('Ошибка пересчёта: ' + (e?.response?.data?.detail || e?.message || 'unknown'));
                  }
                }}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
              >
                Пересчитать тур {displayRound}
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-amber-50 border-b border-amber-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 w-8">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Игрок</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Команда</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Поз</th>
                      {BEST_SORTABLE_COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleColumnSort(col.key)}
                          className="px-3 py-2 text-right text-xs font-semibold text-gray-600 cursor-pointer hover:text-blue-600 select-none whitespace-nowrap"
                        >
                          <span className="inline-flex items-center">
                            {col.label}
                            <SortIcon col={col.key} />
                          </span>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginated.map((p: any, idx: number) => (
                      <tr
                        key={p.player_id}
                        onClick={() => onPlayerClick(p.player_id)}
                        className="hover:bg-amber-50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 text-sm text-gray-400 w-8">{(page - 1) * BEST_PAGE_SIZE + idx + 1}</td>
                        <td className="px-3 py-2 text-sm font-medium text-blue-600 hover:underline">{p.full_name}</td>
                        <td className="px-3 py-2 text-sm text-gray-600"><span className="flex items-center">{p.team_name}<TierDot teamName={p.team_name} tierMap={props.teamTierMap} /></span></td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800">{p.position_code}</span>
                        </td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums"><ScoreCell value={p.core_score_adj} /></td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums"><ScoreCell value={p.support_score_adj} /></td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums font-semibold"><ScoreCell value={p.total_score} /></td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums"><ScoreCell value={p.good_share_core} /></td>
                        <td className="px-3 py-2"><RiskBadges flags={p.risk_flags} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeftIcon className="w-4 h-4 inline mr-1" />
                    Назад
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 7) {
                        pageNum = i + 1;
                      } else if (page <= 4) {
                        pageNum = i + 1;
                      } else if (page >= totalPages - 3) {
                        pageNum = totalPages - 6 + i;
                      } else {
                        pageNum = page - 3 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-8 h-8 text-sm font-medium rounded-md transition-colors ${
                            page === pageNum
                              ? 'bg-amber-500 text-white'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Далее
                    <ChevronRightIcon className="w-4 h-4 inline ml-1" />
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      ) : (
      /* ===== Top by Position for Round (replaces table) ===== */
        posByPosLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <svg className="animate-spin h-6 w-6 text-amber-500 mr-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Загрузка позиций...
          </div>
        ) : Object.keys(positions).length === 0 ? (
          <Card>
            <CardContent>
              <div className="text-center py-8 text-gray-500">Нет данных по позициям за тур</div>
            </CardContent>
          </Card>
        ) : (
          <>
          {['ATT', 'MID', 'DEF'].map((group) => {
            const posCodes = positionGroups[group] || [];
            if (posCodes.length === 0) return null;
            return (
              <div key={group} className="space-y-3 mb-4">
                <h2 className="text-lg font-semibold text-gray-800">{GROUP_LABELS[group]}</h2>
                {posCodes.map((posCode) => {
                  const pos = positions[posCode];
                  if (!pos) return null;
                  return (
                    <Card key={posCode} className={`border ${GROUP_COLORS[group]}`}>
                      <CardHeader>
                        <CardTitle className="text-sm">
                          {pos.position_name} ({pos.position_code}) — {(pos.players || []).length} игроков
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <table className="w-full">
                          <thead className="bg-gray-50/80">
                            <tr>
                              <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-600">#</th>
                              <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-600">Игрок</th>
                              <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-600">Команда</th>
                              <th className="px-3 py-1.5 text-right text-xs font-semibold text-gray-600">Core</th>
                              <th className="px-3 py-1.5 text-right text-xs font-semibold text-gray-600">Support</th>
                              <th className="px-3 py-1.5 text-right text-xs font-semibold text-gray-600">Total</th>
                              <th className="px-3 py-1.5 text-right text-xs font-semibold text-gray-600">Good%</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(pos.players || []).map((p: any) => (
                              <tr
                                key={p.player_id}
                                onClick={() => onPlayerClick(p.player_id)}
                                className="hover:bg-white cursor-pointer transition-colors"
                              >
                                <td className="px-3 py-1.5 text-sm text-gray-400">{p.rank}</td>
                                <td className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:underline">
                                  {p.full_name}
                                  {p.position_detail && (
                                    <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-500">{p.position_detail}</span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 text-sm text-gray-600"><span className="flex items-center">{p.team_name}<TierDot teamName={p.team_name} tierMap={props.teamTierMap} /></span></td>
                                <td className="px-3 py-1.5 text-sm text-right tabular-nums"><ScoreCell value={p.core_score_adj} /></td>
                                <td className="px-3 py-1.5 text-sm text-right tabular-nums"><ScoreCell value={p.support_score_adj} /></td>
                                <td className="px-3 py-1.5 text-sm text-right tabular-nums font-semibold"><ScoreCell value={p.total_score} /></td>
                                <td className="px-3 py-1.5 text-sm text-right tabular-nums"><ScoreCell value={p.good_share_core} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })}
          </>
        )
      )}
    </div>
  );
};


const SEASON_PAGE_SIZE = 15;

const SEASON_BASELINE_OPTIONS = [
  { value: 'SEASON', label: 'Вся лига' },
  { value: 'TIER', label: 'По корзине' },
  { value: 'SEASON_BENCHMARK', label: 'Эталон' },
];

const TopByPositionSection: React.FC<AnalysisSectionProps> = (props) => {
  const { tournament, onBack, onPlayerClick, sortBy, setSortBy, funnel, setFunnel, selectedSeason, availableSeasons, onSeasonChange } = props;
  const [recomputing, setRecomputing] = useState(false);
  const [localSort, setLocalSort] = useState<string>('core_score_adj');
  const [localSortDir, setLocalSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [showPositions, setShowPositions] = useState(false);
  const [seasonBaseline, setSeasonBaseline] = useState<string>('SEASON');

  const seasonParam = selectedSeason && selectedSeason !== '__all__' ? selectedSeason : undefined;

  // Benchmark state
  const benchmarkFileRef = useRef<HTMLInputElement>(null);
  const [benchmarkUploading, setBenchmarkUploading] = useState(false);
  const [benchmarkLabel, setBenchmarkLabel] = useState('');
  const [showBenchmarkUpload, setShowBenchmarkUpload] = useState(false);

  const { data: benchmarkInfo, refetch: refetchBenchmark } = useQuery(
    ['benchmark-info', tournament.id],
    () => apiService.getBenchmark(tournament.id),
    { staleTime: 30000 }
  );

  const { data: flatData, isLoading: flatLoading, refetch } = useQuery(
    ['season-top-flat', tournament.id, sortBy, funnel, seasonBaseline, seasonParam],
    () => apiService.getSeasonTop(tournament.id, { sort_by: sortBy || 'core_score_adj', funnel, baseline_kind: seasonBaseline, season: seasonParam, limit: 200 }),
    { keepPreviousData: true }
  );

  const { data: posByPosData, isLoading: posByPosLoading } = useQuery(
    ['season-top-position', tournament.id, sortBy, funnel, seasonBaseline, seasonParam],
    () => apiService.getSeasonTopByPosition(tournament.id, { sort_by: sortBy, funnel, baseline_kind: seasonBaseline, season: seasonParam, limit_per_position: 10 }),
    { enabled: showPositions, keepPreviousData: true }
  );

  useEffect(() => { setPage(1); }, [localSort, localSortDir, funnel, seasonBaseline]);

  const needsRecompute = flatData?.needs_recompute === true || posByPosData?.needs_recompute === true;
  const allPlayers: any[] = flatData?.data || [];

  const sorted = [...allPlayers].sort((a, b) => {
    const va = a[localSort] ?? -1;
    const vb = b[localSort] ?? -1;
    return localSortDir === 'desc' ? vb - va : va - vb;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / SEASON_PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * SEASON_PAGE_SIZE, page * SEASON_PAGE_SIZE);

  const handleColumnSort = (key: string) => {
    if (localSort === key) {
      setLocalSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setLocalSort(key);
      setLocalSortDir('desc');
    }
  };

  const SeasonSortIcon = ({ col }: { col: string }) => {
    if (localSort !== col) return <ArrowsUpDownIcon className="w-3 h-3 ml-0.5 text-gray-300" />;
    return localSortDir === 'desc'
      ? <ArrowDownIcon className="w-3 h-3 ml-0.5 text-purple-600" />
      : <ArrowUpIcon className="w-3 h-3 ml-0.5 text-purple-600" />;
  };

  const positions: Record<string, any> = posByPosData?.data || {};
  const positionGroups: Record<string, string[]> = { ATT: [], MID: [], DEF: [] };
  Object.entries(positions).forEach(([code, pos]: [string, any]) => {
    const group = pos.position_group || 'DEF';
    if (!positionGroups[group]) positionGroups[group] = [];
    positionGroups[group].push(code);
  });

  const GROUP_LABELS: Record<string, string> = { ATT: 'Атака', MID: 'Полузащита', DEF: 'Защита' };
  const GROUP_COLORS: Record<string, string> = {
    ATT: 'border-red-200 bg-red-50/30',
    MID: 'border-blue-200 bg-blue-50/30',
    DEF: 'border-green-200 bg-green-50/30',
  };

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      await apiService.recomputeSeasonAnalysis(tournament.id, seasonParam);
      refetch();
      refetchBenchmark();
    } catch (e: any) {
      alert('Ошибка: ' + (e?.response?.data?.detail || e?.message || 'unknown'));
    } finally {
      setRecomputing(false);
    }
  };

  const handleBenchmarkUpload = async (file: File) => {
    setBenchmarkUploading(true);
    try {
      const label = benchmarkLabel.trim() || file.name.replace(/\.(xlsx|xls)$/i, '');
      await apiService.uploadBenchmark(tournament.id, file, label);
      setBenchmarkLabel('');
      setShowBenchmarkUpload(false);
      refetchBenchmark();
      alert('Эталон загружен. Нажмите «Пересчитать» чтобы обновить рейтинг.');
    } catch (e: any) {
      alert('Ошибка загрузки: ' + (e?.response?.data?.detail || e?.message || 'unknown'));
    } finally {
      setBenchmarkUploading(false);
    }
  };

  const handleDeleteBenchmark = async () => {
    if (!window.confirm('Удалить эталонный сезон?')) return;
    try {
      await apiService.deleteBenchmark(tournament.id);
      refetchBenchmark();
      if (seasonBaseline === 'SEASON_BENCHMARK') setSeasonBaseline('SEASON');
    } catch (e: any) {
      alert('Ошибка: ' + (e?.response?.data?.detail || e?.message || 'unknown'));
    }
  };

  const benchmarkData = benchmarkInfo?.data;
  const isLoading = flatLoading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="secondary" size="sm" onClick={onBack}>
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Назад к разделам
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <ChartBarIcon className="w-6 h-6 mr-2 text-purple-500" />
              Топ по позициям за сезон
            </h1>
            <p className="text-gray-600">
              {tournament.full_name} — стабильность на дистанции (PER90 за весь сезон)
              {seasonParam && <span className="ml-2 text-purple-600 font-medium">· Сезон {seasonParam}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {availableSeasons && availableSeasons.length > 1 && (
            <select
              value={selectedSeason ?? ''}
              onChange={(e) => { onSeasonChange?.(e.target.value || null); setPage(1); }}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-purple-200 bg-purple-50 text-purple-700 cursor-pointer hover:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
            >
              <option value="">Текущий сезон</option>
              {availableSeasons.map(s => (
                <option key={s.period_value} value={s.period_value}>
                  Сезон {s.period_value} ({s.players_count} игр.)
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleRecompute}
            disabled={recomputing}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50 transition-colors"
          >
            {recomputing ? 'Пересчёт...' : 'Пересчитать'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-center">
            {/* Season baseline selector */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {SEASON_BASELINE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSeasonBaseline(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${seasonBaseline === opt.value ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Sort */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSortBy?.(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${sortBy === opt.value ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Funnel */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {FUNNEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFunnel?.(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${funnel === opt.value ? 'bg-white text-purple-600 shadow' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Toggle: top by position */}
            <button
              onClick={() => setShowPositions(!showPositions)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${
                showPositions
                  ? 'text-purple-800 bg-purple-200 hover:bg-purple-300'
                  : 'text-purple-700 bg-purple-100 hover:bg-purple-200'
              }`}
            >
              <ChartBarIcon className="w-3.5 h-3.5" />
              Топ по позициям
            </button>

            {/* Tier editor button */}
            {props.onTierEditorOpen && (
              <button
                onClick={() => {
                  setSeasonBaseline('TIER');
                  props.onTierEditorOpen?.();
                }}
                className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors flex items-center gap-1"
              >
                <ArrowsUpDownIcon className="w-3.5 h-3.5" />
                Настроить корзины
              </button>
            )}

            <span className="text-xs text-gray-400 ml-2">
              {seasonBaseline === 'SEASON_BENCHMARK'
                ? `Эталон: ${benchmarkData?.label || 'не загружен'}`
                : seasonBaseline === 'TIER'
                  ? 'Сравнение внутри корзины (TOP / BOTTOM)'
                  : 'Данные: среднее за 90 мин за весь сезон'
              }
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Benchmark info/upload bar */}
      {seasonBaseline === 'SEASON_BENCHMARK' && (
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <StarIcon className="w-4 h-4 text-indigo-600" />
                </div>
                {benchmarkData ? (
                  <div>
                    <p className="text-sm font-medium text-indigo-900">{benchmarkData.label}</p>
                    <p className="text-xs text-indigo-500">
                      Загружен: {benchmarkData.uploaded_at ? new Date(benchmarkData.uploaded_at).toLocaleDateString('ru-RU') : '—'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-indigo-700">Эталонный сезон не загружен. Загрузите файл PER90 для сравнения.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {benchmarkData && (
                  <button
                    onClick={handleDeleteBenchmark}
                    className="px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <TrashIcon className="w-3.5 h-3.5 inline mr-1" />
                    Удалить
                  </button>
                )}
                <button
                  onClick={() => setShowBenchmarkUpload(!showBenchmarkUpload)}
                  className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition-colors flex items-center gap-1"
                >
                  <CloudArrowUpIcon className="w-3.5 h-3.5" />
                  {benchmarkData ? 'Заменить' : 'Загрузить эталон'}
                </button>
              </div>
            </div>

            {/* Upload form */}
            {showBenchmarkUpload && (
              <div className="mt-3 pt-3 border-t border-indigo-200">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-indigo-700 mb-1">Название эталона (необязательно)</label>
                    <input
                      type="text"
                      value={benchmarkLabel}
                      onChange={(e) => setBenchmarkLabel(e.target.value)}
                      placeholder="Например: МФЛ 2024"
                      className="w-full px-3 py-1.5 text-sm border border-indigo-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <input
                      ref={benchmarkFileRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleBenchmarkUpload(f);
                        e.target.value = '';
                      }}
                    />
                    <button
                      onClick={() => benchmarkFileRef.current?.click()}
                      disabled={benchmarkUploading}
                      className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {benchmarkUploading ? 'Загрузка...' : 'Выбрать файл .xlsx'}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-indigo-400 mt-1.5">
                  Файл должен содержать данные PER90 за сезон. Если не указать название — будет использовано имя файла.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tier info bar */}
      {seasonBaseline === 'TIER' && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <ArrowsUpDownIcon className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-purple-900">Сравнение по корзинам</p>
                  <p className="text-xs text-purple-500">
                    Игроки сравниваются только с другими из той же корзины (TOP или BOTTOM)
                  </p>
                </div>
              </div>
              {props.onTierEditorOpen && (
                <button
                  onClick={() => props.onTierEditorOpen?.()}
                  className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors flex items-center gap-1"
                >
                  <ArrowsUpDownIcon className="w-3.5 h-3.5" />
                  Настроить корзины
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Content: Flat Table OR Top by Position ===== */}
      {!showPositions ? (
      <Card>
        <CardHeader className="bg-purple-50/50">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <ChartBarIcon className="w-5 h-5 mr-2 text-purple-600" />
              Сезон &middot; {sorted.length} игроков
            </span>
            <span className="text-xs font-normal text-gray-500">
              Стр. {page}/{totalPages}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <svg className="animate-spin h-6 w-6 text-purple-500 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Загрузка...
            </div>
          ) : (sorted.length === 0 || needsRecompute) ? (
            <div className="text-center py-16 text-gray-500">
              <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 rounded-full flex items-center justify-center">
                <ChartBarIcon className="w-8 h-8 text-purple-500" />
              </div>
              <p className="text-lg font-medium text-gray-700 mb-2">
                {needsRecompute ? 'Сезонный анализ не рассчитан' : 'Нет данных'}
              </p>
              <p className="mb-6 max-w-md mx-auto">
                Загрузите PER90 данные за сезон и нажмите «Пересчитать» для расчёта рейтинга.
              </p>
              <button
                onClick={handleRecompute}
                disabled={recomputing}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50 transition-colors"
              >
                {recomputing ? 'Расчёт...' : 'Пересчитать сезонный анализ'}
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-purple-50 border-b border-purple-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 w-8">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Игрок</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Команда</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Поз</th>
                      {BEST_SORTABLE_COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleColumnSort(col.key)}
                          className="px-3 py-2 text-right text-xs font-semibold text-gray-600 cursor-pointer hover:text-purple-600 select-none whitespace-nowrap"
                        >
                          <span className="inline-flex items-center">
                            {col.label}
                            <SeasonSortIcon col={col.key} />
                          </span>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginated.map((p: any, idx: number) => (
                      <tr
                        key={p.player_id}
                        onClick={() => onPlayerClick(p.player_id)}
                        className="hover:bg-purple-50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 text-sm text-gray-400 w-8">{(page - 1) * SEASON_PAGE_SIZE + idx + 1}</td>
                        <td className="px-3 py-2 text-sm font-medium text-blue-600 hover:underline">{p.full_name}</td>
                        <td className="px-3 py-2 text-sm text-gray-600"><span className="flex items-center">{p.team_name}<TierDot teamName={p.team_name} tierMap={props.teamTierMap} /></span></td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-800">{p.position_code}</span>
                        </td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums"><ScoreCell value={p.core_score_adj} /></td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums"><ScoreCell value={p.support_score_adj} /></td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums font-semibold"><ScoreCell value={p.total_score} /></td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums"><ScoreCell value={p.good_share_core} /></td>
                        <td className="px-3 py-2"><RiskBadges flags={p.risk_flags} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeftIcon className="w-4 h-4 inline mr-1" />
                    Назад
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 7) {
                        pageNum = i + 1;
                      } else if (page <= 4) {
                        pageNum = i + 1;
                      } else if (page >= totalPages - 3) {
                        pageNum = totalPages - 6 + i;
                      } else {
                        pageNum = page - 3 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-8 h-8 text-sm font-medium rounded-md transition-colors ${
                            page === pageNum
                              ? 'bg-purple-500 text-white'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Далее
                    <ChevronRightIcon className="w-4 h-4 inline ml-1" />
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      ) : (
      /* ===== Top by Position (replaces table) ===== */
        posByPosLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <svg className="animate-spin h-6 w-6 text-purple-500 mr-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Загрузка позиций...
          </div>
        ) : Object.keys(positions).length === 0 ? (
          <Card>
            <CardContent>
              <div className="text-center py-8 text-gray-500">Нет данных по позициям за сезон</div>
            </CardContent>
          </Card>
        ) : (
          <>
          {['ATT', 'MID', 'DEF'].map((group) => {
            const posCodes = positionGroups[group] || [];
            if (posCodes.length === 0) return null;
            return (
              <div key={group} className="space-y-3 mb-4">
                <h2 className="text-lg font-semibold text-gray-800">{GROUP_LABELS[group]}</h2>
                {posCodes.map((posCode) => {
                  const pos = positions[posCode];
                  if (!pos) return null;
                  return (
                    <Card key={posCode} className={`border ${GROUP_COLORS[group]}`}>
                      <CardHeader>
                        <CardTitle className="text-sm">
                          {pos.position_name} ({pos.position_code}) — {(pos.players || []).length} игроков
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <table className="w-full">
                          <thead className="bg-gray-50/80">
                            <tr>
                              <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-600">#</th>
                              <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-600">Игрок</th>
                              <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-600">Команда</th>
                              <th className="px-3 py-1.5 text-right text-xs font-semibold text-gray-600">Core</th>
                              <th className="px-3 py-1.5 text-right text-xs font-semibold text-gray-600">Support</th>
                              <th className="px-3 py-1.5 text-right text-xs font-semibold text-gray-600">Total</th>
                              <th className="px-3 py-1.5 text-right text-xs font-semibold text-gray-600">Good%</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(pos.players || []).map((p: any) => (
                              <tr
                                key={p.player_id}
                                onClick={() => onPlayerClick(p.player_id)}
                                className="hover:bg-white cursor-pointer transition-colors"
                              >
                                <td className="px-3 py-1.5 text-sm text-gray-400">{p.rank}</td>
                                <td className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:underline">
                                  {p.full_name}
                                  {p.position_detail && (
                                    <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-500">{p.position_detail}</span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 text-sm text-gray-600"><span className="flex items-center">{p.team_name}<TierDot teamName={p.team_name} tierMap={props.teamTierMap} /></span></td>
                                <td className="px-3 py-1.5 text-sm text-right tabular-nums"><ScoreCell value={p.core_score_adj} /></td>
                                <td className="px-3 py-1.5 text-sm text-right tabular-nums"><ScoreCell value={p.support_score_adj} /></td>
                                <td className="px-3 py-1.5 text-sm text-right tabular-nums font-semibold"><ScoreCell value={p.total_score} /></td>
                                <td className="px-3 py-1.5 text-sm text-right tabular-nums"><ScoreCell value={p.good_share_core} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })}
          </>
        )
      )}
    </div>
  );
};


// ================================================================
// NewFacesSection — Новые лица в туре
// ================================================================

interface NewFacesSectionProps {
  tournament: any;
  season?: string;
  onBack: () => void;
  onPlayerClick: (playerId: number) => void;
  onOpenProfile: (playerId: number) => void;
}

const NewFacesSection: React.FC<NewFacesSectionProps> = ({ tournament, season, onBack, onPlayerClick, onOpenProfile }) => {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery(
    ['new-faces', tournament.id, season],
    () => apiService.getNewFaces(tournament.id, season),
    { enabled: !!tournament }
  );

  const players: any[] = data?.data || [];
  const roundNumber = data?.round_number;
  const totalCount = data?.total_count || 0;
  const debutsCount = data?.debuts_count || 0;
  const filtered = search
    ? players.filter((p: any) =>
        p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        p.team_name?.toLowerCase().includes(search.toLowerCase())
      )
    : players;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <button onClick={onBack} className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors">
          <ArrowLeftIcon className="w-4 h-4 mr-2" />Назад к разделам
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Новые лица в этом туре</h1>
          <p className="text-gray-600">{tournament.full_name}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-emerald-700">{totalCount}</div>
          <div className="text-xs text-emerald-600 mt-1">Новых лиц</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-700">{debutsCount}</div>
          <div className="text-xs text-blue-600 mt-1">Дебюты</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-amber-700">{roundNumber ? `Тур ${roundNumber}` : '—'}</div>
          <div className="text-xs text-amber-600 mt-1">Последний загруженный</div>
        </div>
      </div>

      <div className="relative">
        <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по имени или команде..." className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin h-8 w-8 text-emerald-500 mr-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Загрузка...
        </div>
      ) : !roundNumber ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          <UserPlusIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium mb-2">Нет данных о турах</p>
          <p className="text-sm">Загрузите TOTAL данные с указанием номера тура, чтобы отслеживать новые лица.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          <p className="text-lg font-medium mb-2">{search ? 'Ничего не найдено' : 'Нет новых лиц в этом туре'}</p>
          <p className="text-sm">{search ? 'Попробуйте другой запрос' : 'Все игроки, сыгравшие в этом туре, имеют 200+ минут.'}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Игрок</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Команда</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Позиция</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Год</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Мин. за тур</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Всего мин.</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Статус</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p: any, idx: number) => (
                  <tr key={p.player_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => onPlayerClick(p.player_id)} className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left">{p.full_name}</button>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{p.team_name || '—'}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-700">{p.position_code || '—'}</span></td>
                    <td className="px-4 py-3 text-center text-gray-600 text-sm">{p.birth_year || '—'}</td>
                    <td className="px-4 py-3 text-center font-mono text-sm font-medium text-gray-900">{p.minutes_in_round}</td>
                    <td className="px-4 py-3 text-center font-mono text-sm">
                      <span className={p.total_minutes < 100 ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>{Math.round(p.total_minutes)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.is_debut ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">Дебют</span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">&lt;200 мин</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => onOpenProfile(p.player_id)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline">Профиль</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
