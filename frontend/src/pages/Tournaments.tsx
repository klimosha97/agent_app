/**
 * Страница "Турниры"
 * Показывает список турниров и детальную статистику игроков
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { 
  ChevronRightIcon, 
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
  ArrowDownIcon
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
    description: 'Лучшие игроки на каждой позиции',
    icon: ChartBarIcon,
    color: 'from-purple-500 to-pink-600',
    bgColor: 'bg-gradient-to-br from-purple-50 to-pink-50',
    iconColor: 'text-purple-600',
  }
];

export const Tournaments: React.FC = () => {
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<TournamentSection>('overview');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTournament, setUploadTournament] = useState<Tournament | null>(null);
  const [roundUploadModalOpen, setRoundUploadModalOpen] = useState(false);
  const [roundUploadTournament, setRoundUploadTournament] = useState<Tournament | null>(null);
  
  // Состояния для таблицы игроков турнира
  const [sliceType, setSliceType] = useState<'TOTAL' | 'PER90'>('TOTAL');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [sortField, setSortField] = useState<string | null>('goals');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Состояния для таблицы игроков за тур
  const [roundSliceType, setRoundSliceType] = useState<'TOTAL' | 'PER90'>('TOTAL');
  const [roundSearch, setRoundSearch] = useState('');
  const [roundSearchInput, setRoundSearchInput] = useState('');
  const [roundCurrentPage, setRoundCurrentPage] = useState(1);
  const [roundSortField, setRoundSortField] = useState<string | null>('goals');
  const [roundSortOrder, setRoundSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedRound, setSelectedRound] = useState<number | null>(null); // Выбранный тур для просмотра

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
    }
    if (selectedSection === 'last_round_players') {
      setRoundSearchInput('');
      setRoundSearch('');
      setRoundCurrentPage(1);
      setRoundSortField('goals');
      setRoundSortOrder('desc');
      setSelectedRound(null); // Сброс на последний тур
    }
  }, [selectedTournamentId, selectedSection]);

  // Загружаем данные игроков турнира (за сезон)
  const { data: playersData, isLoading: isLoadingPlayers } = useQuery(
    ['tournament-players', selectedTournamentId, sliceType, search, currentPage, itemsPerPage, sortField, sortOrder],
    () => apiService.getAllPlayersFromDatabase(
      currentPage,
      itemsPerPage,
      sliceType,
      search || undefined,
      selectedTournamentId ?? undefined,
      undefined,
      sortField || undefined,
      sortOrder,
      'SEASON'
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
  
  // Выбранный тур для отображения (по умолчанию - последний загруженный)
  const displayRound = selectedRound ?? currentRound;

  // Загружаем данные игроков за выбранный тур
  const { data: roundPlayersData, isLoading: isLoadingRoundPlayers } = useQuery(
    ['round-players', selectedTournamentId, displayRound, roundSliceType, roundSearch, roundCurrentPage, itemsPerPage, roundSortField, roundSortOrder],
    () => apiService.getAllPlayersFromDatabase(
      roundCurrentPage,
      itemsPerPage,
      roundSliceType,
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
                🚧 В разработке
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ========================================
  // РЕНДЕР: Все игроки турнира (полная таблица)
  // ========================================
  const renderAllPlayersSection = () => {
    if (!selectedTournament) return null;

    const players = playersData?.data || [];
    const totalCount = playersData?.total || 0;
    const totalPages = playersData?.pages || 0;

    // Фильтруем колонки по видимым
    const displayedColumns = PLAYER_COLUMNS.filter(col => visibleColumns.includes(col.key));
    const totalColumnsCount = displayedColumns.length + 3; // +3 за Игрок, Команда, Поз

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
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 border-b border-gray-200 sticky left-[320px] z-20 w-[60px]" style={{ boxShadow: '4px 0 6px -2px rgba(0, 0, 0, 0.1)' }}>
                        <span className="whitespace-nowrap">Поз</span>
                      </th>
                      
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
                          <tr key={player.player_id} className={`hover:bg-blue-50 transition-colors ${rowBg}`}>
                            <td className={`px-3 py-2 text-sm font-medium text-gray-900 sticky left-0 z-10 min-w-[180px] whitespace-nowrap ${rowBg}`}>
                              {player.full_name}
                            </td>
                            <td className={`px-3 py-2 text-sm text-gray-600 sticky left-[180px] z-10 min-w-[140px] whitespace-nowrap ${rowBg}`}>
                              {player.team_name}
                            </td>
                            <td className={`px-3 py-2 text-sm sticky left-[320px] z-10 w-[60px] ${rowBg}`} style={{ boxShadow: '4px 0 6px -2px rgba(0, 0, 0, 0.1)' }}>
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800">
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

            {/* Тумблер TOTAL / PER90 */}
            <div className="flex items-center gap-2 bg-yellow-50 rounded-lg p-1 border border-yellow-200">
              <button
                onClick={() => { setRoundSliceType('TOTAL'); setRoundCurrentPage(1); }}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  roundSliceType === 'TOTAL' ? 'bg-white text-yellow-700 shadow' : 'text-yellow-600 hover:text-yellow-800'
                }`}
              >
                Всего за тур
              </button>
              <button
                onClick={() => { setRoundSliceType('PER90'); setRoundCurrentPage(1); }}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  roundSliceType === 'PER90' ? 'bg-white text-yellow-700 shadow' : 'text-yellow-600 hover:text-yellow-800'
                }`}
              >
                За 90 минут
              </button>
            </div>
          </div>
        </div>

        {/* Поиск и настройки */}
        <Card>
          <CardContent>
            <div className="flex gap-4 items-center">
              {/* Переключатель туров */}
              {availableRounds.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Тур:</label>
                  <select
                    value={displayRound}
                    onChange={(e) => {
                      setSelectedRound(Number(e.target.value));
                      setRoundCurrentPage(1);
                    }}
                    className="px-3 py-2 border border-yellow-300 rounded-lg bg-yellow-50 text-yellow-800 font-medium focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 cursor-pointer min-w-[100px]"
                  >
                    {availableRounds.map((round) => (
                      <option key={round} value={round}>
                        {round === currentRound ? `Тур ${round} (последний)` : `Тур ${round}`}
                      </option>
                    ))}
                  </select>
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
              {' '}
              <span className="text-sm font-normal text-gray-500 ml-2">
                ({roundSliceType === 'TOTAL' ? 'суммарная за тур' : 'за 90 минут'})
              </span>
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
                          <tr key={player.player_id} className={`hover:bg-yellow-50 transition-colors ${rowBg}`}>
                            <td className={`px-3 py-2 text-sm font-medium text-gray-900 sticky left-0 z-10 min-w-[180px] whitespace-nowrap ${rowBg}`}>
                              {player.full_name}
                            </td>
                            <td className={`px-3 py-2 text-sm text-gray-600 sticky left-[180px] z-10 min-w-[140px] whitespace-nowrap ${rowBg}`}>
                              {player.team_name}
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
            const isReady = tile.id === 'all_players'; // Только эта секция готова
            
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
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">{getTileLabel()}</p>
                      <p className={`text-2xl font-bold ${tile.iconColor}`}>{getTileValue()}</p>
                    </div>
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
  // ОСНОВНОЙ РЕНДЕР
  // ========================================
  
  if (selectedTournament) {
    if (selectedSection === 'overview') {
      return renderTournamentOverview();
    } else if (selectedSection === 'all_players') {
      return renderAllPlayersSection();
    } else if (selectedSection === 'last_round_players') {
      return renderLastRoundPlayersSection();
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
    </div>
  );
};
