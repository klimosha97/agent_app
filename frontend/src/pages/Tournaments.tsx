/**
 * Страница "Турниры"
 * Показывает список турниров и позволяет просматривать разделы каждого турнира
 */

import React, { useState, useMemo } from 'react';
import { 
  ChevronRightIcon, 
  DocumentArrowUpIcon, 
  ArrowPathIcon,
  CalendarIcon,
  UsersIcon,
  TrophyIcon,
  StarIcon,
  UserPlusIcon,
  ChartBarIcon,
  ArrowLeftIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { useTournaments, useAllPlayersData, useUploadExcelFile } from '../hooks/useApi';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, TrackingStatusBadge } from '../components/ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, LoadingTableRow, TablePagination, EmptyTableState } from '../components/ui/Table';
import { Tournament, TrackingStatus, Player } from '../types';
import { formatDateShort } from '../utils';

// Типы секций внутри турнира
type TournamentSection = 'overview' | 'best_performances' | 'new_faces' | 'all_players' | 'last_round_players' | 'top_by_position';

// Интерфейс колонки таблицы
interface TableColumn {
  key: keyof Player | 'index';
  label: string;
  align?: 'left' | 'center' | 'right';
  format?: 'percent' | 'datetime';
  cellClassName?: string;
  sortable?: boolean;
  sticky?: boolean;
  stickyLeft?: string;
  stickyZIndex?: number;
  render?: (player: Player, index: number) => React.ReactNode;
}

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
    preview: {
      label: 'Топ игроков',
      value: '—'
    },
    isStub: true
  },
  {
    id: 'new_faces' as TournamentSection,
    title: 'Новые лица в этом туре',
    description: 'Игроки, впервые появившиеся в турнире',
    icon: UserPlusIcon,
    color: 'from-emerald-500 to-teal-600',
    bgColor: 'bg-gradient-to-br from-emerald-50 to-teal-50',
    iconColor: 'text-emerald-600',
    preview: {
      label: 'Новых игроков',
      value: '—'
    },
    isStub: true
  },
  {
    id: 'last_round_players' as TournamentSection,
    title: 'Все футболисты последнего тура',
    description: 'Игроки, сыгравшие в последнем туре',
    icon: UsersIcon,
    color: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-gradient-to-br from-blue-50 to-indigo-50',
    iconColor: 'text-blue-600',
    preview: {
      label: 'Игроков в туре',
      value: '—'
    },
    isStub: true
  },
  {
    id: 'top_by_position' as TournamentSection,
    title: 'Топ по позициям за сезон',
    description: 'Лучшие игроки на каждой позиции',
    icon: ChartBarIcon,
    color: 'from-purple-500 to-pink-600',
    bgColor: 'bg-gradient-to-br from-purple-50 to-pink-50',
    iconColor: 'text-purple-600',
    preview: {
      label: 'Позиций',
      value: '—'
    },
    isStub: true
  }
];

export const Tournaments: React.FC = () => {
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [selectedSection, setSelectedSection] = useState<TournamentSection>('overview');
  
  // Состояние для таблицы всех игроков
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<string>('player_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const itemsPerPage = 100;

  // Загружаем данные
  const { data: tournamentsResponse, isLoading: isLoadingTournaments } = useTournaments();
  
  // Загружаем игроков турнира с поиском
  const { 
    data: playersResponse, 
    isLoading: isLoadingPlayers,
    error: playersError
  } = useAllPlayersData(
    currentPage,
    itemsPerPage,
    searchQuery,
    sortField,
    sortOrder,
    selectedTournament?.id
  );

  const uploadMutation = useUploadExcelFile();

  const tournaments = tournamentsResponse?.data || [];
  const players: Player[] = playersResponse?.data || [];
  const totalItems = playersResponse?.total || 0;
  const totalPages = playersResponse?.pages || Math.ceil(totalItems / itemsPerPage) || 0;
  const startIndex = (currentPage - 1) * itemsPerPage;

  // Обработчики
  const handleTournamentClick = (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setSelectedSection('overview');
    resetTableState();
  };

  const handleBackToTournaments = () => {
    setSelectedTournament(null);
    setSelectedSection('overview');
    resetTableState();
  };

  const handleBackToOverview = () => {
    setSelectedSection('overview');
    resetTableState();
  };

  const handleTileClick = (sectionId: TournamentSection) => {
    setSelectedSection(sectionId);
    if (sectionId === 'all_players') {
      resetTableState();
    }
  };

  const resetTableState = () => {
    setSearchQuery('');
    setCurrentPage(1);
    setSortField('player_name');
    setSortOrder('asc');
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setCurrentPage(1);
  };

  const handleSort = (field: string) => {
    if (field === 'index') return;
    
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, tournamentId: number) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      await uploadMutation.mutateAsync({
        file,
        tournamentId,
        options: {
          importToMain: true,
          importToLastRound: false,
        }
      });
      
      event.target.value = '';
      alert('Файл успешно загружен!');
    } catch (error: any) {
      console.error('Upload failed:', error);
      
      let errorMessage = 'Неизвестная ошибка';
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(`Ошибка загрузки: ${errorMessage}`);
      event.target.value = '';
    }
  };

  // Округление до ближайшего 0.5
  const roundToHalf = (value: number): number => {
    return Math.round(value * 2) / 2;
  };

  const formatValue = (value: unknown, format?: 'percent' | 'datetime', fieldKey?: string) => {
    if (value === null || value === undefined || value === '') {
      return '—';
    }

    if (format === 'datetime') {
      const date = new Date(value as string);
      if (Number.isNaN(date.getTime())) {
        return value as string;
      }
      return date.toLocaleString('ru-RU', { hour12: false });
    }

    const numericValue = typeof value === 'number' ? value : Number(value);

    if (!Number.isNaN(numericValue) && Number.isFinite(numericValue)) {
      if (format === 'percent') {
        const asPercent = numericValue <= 1 ? numericValue * 100 : numericValue;
        const rounded = roundToHalf(asPercent);
        const displayValue = rounded % 1 === 0 ? rounded : rounded.toFixed(1);
        return `${displayValue}%`;
      }
      
      if (Number.isInteger(numericValue)) {
        return numericValue;
      }
      
      if (fieldKey === 'xg') {
        return numericValue.toFixed(2);
      }
      
      const rounded = roundToHalf(numericValue);
      return rounded % 1 === 0 ? rounded : rounded.toFixed(1);
    }

    return String(value);
  };

  // Колонки таблицы (без колонки Турнир, так как мы уже внутри турнира)
  const dataColumns: TableColumn[] = useMemo(() => ([
    { key: 'player_name', label: 'Игрок', sortable: true, sticky: true, stickyLeft: '0px', stickyZIndex: 21, cellClassName: 'min-w-[200px] text-sm font-medium text-gray-900' },
    { key: 'team_name', label: 'Команда', sortable: true, cellClassName: 'min-w-[160px] text-sm text-gray-700' },
    {
      key: 'tracking_status',
      label: 'Статус',
      align: 'center',
      sortable: true,
      render: (player) => <TrackingStatusBadge status={player.tracking_status as TrackingStatus} />, 
      cellClassName: 'whitespace-nowrap'
    },
    { key: 'player_number', label: 'Игровой номер', sortable: true, align: 'center' },
    { key: 'position', label: 'Позиция', sortable: true, align: 'center' },
    { key: 'age', label: 'Возраст', sortable: true, align: 'center' },
    { key: 'height', label: 'Рост', sortable: true, align: 'center' },
    { key: 'weight', label: 'Вес', sortable: true, align: 'center' },
    { key: 'citizenship', label: 'Гражданство', sortable: true, cellClassName: 'min-w-[120px] text-center' },
    { key: 'player_index', label: 'Индекс игрока', sortable: true, align: 'center' },
    { key: 'minutes_played', label: 'Минуты', sortable: true, align: 'center' },
    { key: 'goals', label: 'Голы', sortable: true, align: 'center' },
    { key: 'assists', label: 'Ассисты', sortable: true, align: 'center' },
    { key: 'shots', label: 'Удары', sortable: true, align: 'center' },
    { key: 'shots_on_target', label: 'Удары в створ', sortable: true, align: 'center' },
    { key: 'xg', label: 'xG', sortable: true, align: 'center' },
    { key: 'goal_attempts', label: 'Голевые моменты', sortable: true, align: 'center' },
    { key: 'goal_attempts_successful', label: 'Голевые удачные', sortable: true, align: 'center' },
    { key: 'goal_attempts_success_rate', label: 'Голевые удачные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'goal_moments_created', label: 'Голевые создал', sortable: true, align: 'center' },
    { key: 'goal_attacks_participation', label: 'Участия в голевых атаках', sortable: true, align: 'center' },
    { key: 'passes_total', label: 'Передачи всего', sortable: true, align: 'center' },
    { key: 'passes_accuracy', label: 'Передачи точные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'passes_key', label: 'Передачи ключевые', sortable: true, align: 'center' },
    { key: 'passes_key_accuracy', label: 'Ключевые точные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'crosses', label: 'Навесы', sortable: true, align: 'center' },
    { key: 'crosses_accuracy', label: 'Навесы точные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'passes_progressive', label: 'Прогрессивные передачи', sortable: true, align: 'center' },
    { key: 'passes_progressive_accuracy', label: 'Прогрессивные точные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'passes_progressive_clean', label: 'Прогрессивные чистые', sortable: true, align: 'center' },
    { key: 'passes_long', label: 'Длинные передачи', sortable: true, align: 'center' },
    { key: 'passes_long_accuracy', label: 'Длинные точные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'passes_super_long', label: 'Сверхдлинные передачи', sortable: true, align: 'center' },
    { key: 'passes_super_long_accuracy', label: 'Сверхдлинные точные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'passes_final_third', label: 'Передачи в финальную треть', sortable: true, align: 'center' },
    { key: 'passes_final_third_accuracy', label: 'Финальная треть точные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'passes_penalty_area', label: 'Передачи в штрафную', sortable: true, align: 'center' },
    { key: 'passes_penalty_area_accuracy', label: 'В штрафную точные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'passes_for_shot', label: 'Передачи под удар', sortable: true, align: 'center' },
    { key: 'goal_errors', label: 'Голевые ошибки', sortable: true, align: 'center' },
    { key: 'rough_errors', label: 'Грубые ошибки', sortable: true, align: 'center' },
    { key: 'yellow_cards', label: 'Жёлтые карточки', sortable: true, align: 'center' },
    { key: 'red_cards', label: 'Красные карточки', sortable: true, align: 'center' },
    { key: 'fouls_committed', label: 'Фолы', sortable: true, align: 'center' },
    { key: 'fouls_suffered', label: 'Фолы на игроке', sortable: true, align: 'center' },
    { key: 'duels_total', label: 'Единоборства всего', sortable: true, align: 'center' },
    { key: 'duels_success_rate', label: 'Единоборства удачные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'duels_defensive', label: 'Единоборства (оборона)', sortable: true, align: 'center' },
    { key: 'duels_defensive_success_rate', label: 'Оборона удачные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'duels_offensive', label: 'Единоборства (атака)', sortable: true, align: 'center' },
    { key: 'duels_offensive_success_rate', label: 'Единоборства атака удачные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'duels_aerial', label: 'Единоборства верховые', sortable: true, align: 'center' },
    { key: 'duels_aerial_success_rate', label: 'Верховые удачные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'dribbles', label: 'Обводки', sortable: true, align: 'center' },
    { key: 'dribbles_success_rate', label: 'Обводки удачные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'dribbles_final_third', label: 'Обводки в финальной трети', sortable: true, align: 'center' },
    { key: 'dribbles_final_third_success_rate', label: 'Обводки финальная треть, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'tackles', label: 'Отборы', sortable: true, align: 'center' },
    { key: 'tackles_success_rate', label: 'Отборы удачные, %', sortable: true, align: 'center', format: 'percent' },
    { key: 'interceptions', label: 'Перехваты', sortable: true, align: 'center' },
    { key: 'recoveries', label: 'Подборы', sortable: true, align: 'center' },
    {
      key: 'notes',
      label: 'Заметки',
      sortable: true,
      cellClassName: 'whitespace-normal break-words min-w-[200px] text-sm text-gray-700',
    },
    {
      key: 'created_at',
      label: 'Создано',
      sortable: true,
      align: 'center',
      format: 'datetime',
    },
    {
      key: 'updated_at',
      label: 'Обновлено',
      sortable: true,
      align: 'center',
      format: 'datetime',
    },
    {
      key: 'id',
      label: 'ID',
      sortable: true,
      cellClassName: 'text-xs text-gray-500 max-w-[160px] truncate',
    },
  ]), []);

  const columns: TableColumn[] = useMemo(() => [
    {
      key: 'index',
      label: '№',
      align: 'center',
      render: (_, index) => startIndex + index + 1,
    },
    ...dataColumns,
  ], [dataColumns, startIndex]);

  // Сбрасываем на первую страницу, если текущая страница больше общего количества
  React.useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // ========================================
  // РЕНДЕР: Секция "Все футболисты турнира"
  // ========================================
  const renderAllPlayersSection = () => {
    if (!selectedTournament) return null;

    if (playersError) {
      return (
        <div className="text-center py-12">
          <h2 className="text-lg font-semibold text-red-600 mb-2">
            Ошибка загрузки данных
          </h2>
          <p className="text-gray-600">{playersError instanceof Error ? playersError.message : 'Произошла ошибка'}</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Заголовок с кнопкой возврата */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBackToOverview}
            >
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Назад к разделам
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Все футболисты турнира
              </h1>
              <p className="text-gray-600">
                {selectedTournament.full_name} • Всего игроков: {totalItems}
              </p>
            </div>
          </div>

          {/* Кнопка загрузки */}
          <div className="relative">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFileUpload(e, selectedTournament.id)}
              className="sr-only"
              id={`upload-players-${selectedTournament.id}`}
              disabled={uploadMutation.isLoading}
            />
            <label
              htmlFor={`upload-players-${selectedTournament.id}`}
              className="btn btn-primary cursor-pointer"
            >
              {uploadMutation.isLoading ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                  Загрузка...
                </>
              ) : (
                <>
                  <DocumentArrowUpIcon className="w-4 h-4 mr-2" />
                  Загрузить XLSX
                </>
              )}
            </label>
          </div>
        </div>

        <Card>
          <CardContent>
            {/* Поиск */}
            <div className="mb-6">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Поиск по фамилии игрока, команде или позиции..."
                  className="w-full pl-10 pr-20 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Статистика */}
            <div className="mb-4 text-sm text-gray-600">
              {searchQuery ? (
                <>Найдено {totalItems} записей. Страница {currentPage} из {totalPages}.</>
              ) : (
                <>Показано записи с {startIndex + 1} по {Math.min(startIndex + itemsPerPage, totalItems)} из {totalItems}. Страница {currentPage} из {totalPages}.</>
              )}
            </div>

            {/* Таблица */}
            <Table>
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableHeader 
                      key={String(column.key)} 
                      align={column.align}
                      sortable={column.sortable}
                      sorted={sortField === String(column.key) ? sortOrder : null}
                      onSort={column.sortable ? () => handleSort(String(column.key)) : undefined}
                      sticky={column.sticky}
                      stickyLeft={column.stickyLeft}
                      stickyZIndex={column.stickyZIndex}
                    >
                      {column.label}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoadingPlayers ? (
                  <LoadingTableRow columns={columns.length} />
                ) : players.length === 0 ? (
                  <EmptyTableState 
                    title={
                      searchQuery
                        ? "По вашему запросу ничего не найдено"
                        : "Нет данных для отображения"
                    }
                    description={
                      searchQuery
                        ? "Попробуйте изменить поисковый запрос"
                        : "Загрузите данные из Excel-файлов"
                    }
                    colSpan={columns.length}
                  />
                ) : (
                  players.map((player: Player, index: number) => (
                    <TableRow key={`${player.id || player.player_name}-${index}`}>
                      {columns.map((column) => {
                        const value = column.key === 'index'
                          ? column.render?.(player, index)
                          : column.render
                            ? column.render(player, index)
                            : formatValue(
                                player[column.key as keyof Player],
                                column.format,
                                String(column.key)
                              );

                        return (
                          <TableCell
                            key={`${player.id || player.player_name}-${String(column.key)}`}
                            align={column.align}
                            className={column.cellClassName}
                            sticky={column.sticky}
                            stickyLeft={column.stickyLeft}
                            stickyZIndex={column.stickyZIndex}
                          >
                            {value}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Пагинация */}
            {totalPages > 1 && (
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
              />
            )}
          </CardContent>
        </Card>
      </div>
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
        {/* Заголовок с кнопкой возврата */}
        <div className="flex items-center space-x-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBackToOverview}
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Назад к разделам
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {tile.title}
            </h1>
            <p className="text-gray-600">
              {selectedTournament.full_name}
            </p>
          </div>
        </div>

        {/* Заглушка */}
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
                {tile.description}. Этот функционал будет доступен в ближайших обновлениях.
              </p>
              <Badge variant="warning" size="lg">
                Скоро
              </Badge>
            </div>
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
        {/* Заголовок с кнопкой возврата */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBackToTournaments}
            >
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Все турниры
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {selectedTournament.full_name}
              </h1>
              <p className="text-gray-600">
                Выберите раздел для просмотра
              </p>
            </div>
          </div>

          {/* Кнопка загрузки */}
          <div className="relative">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFileUpload(e, selectedTournament.id)}
              className="sr-only"
              id={`upload-overview-${selectedTournament.id}`}
              disabled={uploadMutation.isLoading}
            />
            <label
              htmlFor={`upload-overview-${selectedTournament.id}`}
              className="btn btn-primary cursor-pointer"
            >
              {uploadMutation.isLoading ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                  Загрузка...
                </>
              ) : (
                <>
                  <DocumentArrowUpIcon className="w-4 h-4 mr-2" />
                  Загрузить XLSX
                </>
              )}
            </label>
          </div>
        </div>

        {/* Информация о турнире */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card 
            hover 
            className="cursor-pointer group transition-all duration-200 hover:shadow-lg hover:border-blue-300"
            onClick={() => handleTileClick('all_players')}
          >
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <UsersIcon className="w-8 h-8 text-blue-500 group-hover:text-blue-600 transition-colors" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">Всего игроков</p>
                    <p className="text-2xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{selectedTournament.players_count}</p>
                  </div>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center">
                <CalendarIcon className="w-8 h-8 text-green-500" />
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

          <Card>
            <CardContent>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                  <span className="text-yellow-600 font-bold text-sm">—</span>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Текущий тур</p>
                  <p className="text-lg font-bold text-gray-900">Тур —</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center">
                <TrophyIcon className="w-8 h-8 text-purple-500" />
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
            const previewValue = tile.preview.value === 'dynamic' 
              ? selectedTournament.players_count.toString()
              : tile.preview.value;

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
                {/* Заглушка бейдж */}
                {tile.isStub && (
                  <div className="absolute top-3 right-3">
                    <Badge variant="warning" size="sm">
                      Скоро
                    </Badge>
                  </div>
                )}

                <div className="p-6">
                  {/* Иконка */}
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${tile.color} flex items-center justify-center mb-4 shadow-md group-hover:shadow-lg transition-shadow`}>
                    <IconComponent className="w-7 h-7 text-white" />
                  </div>

                  {/* Заголовок и описание */}
                  <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-gray-700">
                    {tile.title}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {tile.description}
                  </p>

                  {/* Превью */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">
                        {tile.preview.label}
                      </p>
                      <p className={`text-2xl font-bold ${tile.iconColor}`}>
                        {previewValue}
                      </p>
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
  
  // Если выбран турнир
  if (selectedTournament) {
    switch (selectedSection) {
      case 'overview':
        return renderTournamentOverview();
      case 'all_players':
        return renderAllPlayersSection();
      case 'best_performances':
      case 'new_faces':
      case 'last_round_players':
      case 'top_by_position':
        return renderStubSection(selectedSection);
      default:
        return renderTournamentOverview();
    }
  }

  // Показываем список турниров
  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Турниры
        </h1>
        <p className="text-gray-600">
          Выберите турнир для просмотра статистики и управления данными
        </p>
      </div>

      {/* Список турниров */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoadingTournaments ? (
          // Состояние загрузки
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
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold tournament-badge ${tournament.code.toLowerCase()}`}>
                        {tournament.code.toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                          {tournament.name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {tournament.full_name}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex space-x-4">
                        <div className="text-sm">
                          <span className="text-gray-500">Игроков:</span>
                          <span className="font-semibold text-gray-900 ml-1">
                            {tournament.players_count}
                          </span>
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

                      {/* Кнопки загрузки */}
                      <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                        {/* Загрузить общую статистику */}
                        <div className="relative group/upload">
                          <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={(e) => handleFileUpload(e, tournament.id)}
                            className="sr-only"
                            id={`upload-${tournament.id}`}
                            disabled={uploadMutation.isLoading}
                          />
                          <label
                            htmlFor={`upload-${tournament.id}`}
                            className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-600 cursor-pointer transition-colors"
                            title="Загрузить общую статистику (players_stats_raw)"
                          >
                            <DocumentArrowUpIcon className="w-5 h-5" />
                          </label>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/upload:opacity-100 transition-opacity pointer-events-none z-10">
                            Загрузить общую статистику
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>

                        {/* Загрузить последний тур (заглушка) */}
                        <div className="relative group/round">
                          <button
                            className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-600 cursor-pointer transition-colors"
                            title="Загрузить последний тур (в разработке)"
                            onClick={() => alert('Функционал загрузки последнего тура в разработке')}
                          >
                            <ArrowPathIcon className="w-5 h-5" />
                          </button>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/round:opacity-100 transition-opacity pointer-events-none z-10">
                            Загрузить последний тур
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <ChevronRightIcon className="w-5 h-5 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all ml-4" />
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
