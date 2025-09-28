/**
 * Страница "База данных"
 * Показывает все записи из таблицы players_stats_raw с поиском по всем параметрам
 */

import React, { useMemo, useState } from 'react';
import { MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { useAllPlayersData } from '../hooks/useApi';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, EmptyTableState, LoadingTableRow, TablePagination } from '../components/ui/Table';
import { Badge, TrackingStatusBadge } from '../components/ui/Badge';
import { TrackingStatus, Player } from '../types';

interface TableColumn {
  key: keyof Player | 'index';
  label: string;
  align?: 'left' | 'center' | 'right';
  format?: 'percent' | 'datetime';
  cellClassName?: string;
  render?: (player: Player, index: number) => React.ReactNode;
}

interface SearchFilters {
  query: string;
  tournament: string;
  position: string;
  minGoals: string;
  maxGoals: string;
  minAssists: string;
  maxAssists: string;
}

export const Database: React.FC = () => {
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    query: '',
    tournament: '',
    position: '',
    minGoals: '',
    maxGoals: '',
    minAssists: '',
    maxAssists: ''
  });
  
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const { data: playersResponse, isLoading, error } = useAllPlayersData();
  const players: Player[] = playersResponse?.data || [];

  // Фильтрация данных
  const filteredPlayers = useMemo(() => {
    const query = searchFilters.query.toLowerCase().trim();

    return players.filter((player) => {
      const matchesQuery = !query || [
        player.player_name,
        player.team_name,
        player.position,
        player.notes,
        player.citizenship,
      ].some((field) => field?.toLowerCase().includes(query));
      
      const matchesTournament = !searchFilters.tournament || 
        player.tournament_id?.toString() === searchFilters.tournament;
      
      const matchesPosition = !searchFilters.position || 
        player.position?.toLowerCase().includes(searchFilters.position.toLowerCase());
      
      const parseNumber = (value: string) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      };
      
      const minGoals = parseNumber(searchFilters.minGoals);
      const maxGoals = parseNumber(searchFilters.maxGoals);
      const minAssists = parseNumber(searchFilters.minAssists);
      const maxAssists = parseNumber(searchFilters.maxAssists);
      
      const matchesMinGoals = minGoals === undefined || (player.goals || 0) >= minGoals;
      const matchesMaxGoals = maxGoals === undefined || (player.goals || 0) <= maxGoals;
      const matchesMinAssists = minAssists === undefined || (player.assists || 0) >= minAssists;
      const matchesMaxAssists = maxAssists === undefined || (player.assists || 0) <= maxAssists;

      return matchesQuery && matchesTournament && matchesPosition && 
             matchesMinGoals && matchesMaxGoals && matchesMinAssists && matchesMaxAssists;
    });
  }, [players, searchFilters]);

  // Пагинация
  const totalPages = Math.ceil(filteredPlayers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPlayers = filteredPlayers.slice(startIndex, startIndex + itemsPerPage);

  const handleFilterChange = (field: keyof SearchFilters, value: string) => {
    setSearchFilters(prev => ({ ...prev, [field]: value }));
    setCurrentPage(1); // Сбрасываем на первую страницу при изменении фильтров
  };

  const clearFilters = () => {
    setSearchFilters({
      query: '',
      tournament: '',
      position: '',
      minGoals: '',
      maxGoals: '',
      minAssists: '',
      maxAssists: ''
    });
    setCurrentPage(1);
  };

  const TOURNAMENT_NAMES: Record<number, string> = useMemo(() => ({
    0: 'МФЛ',
    1: 'ЮФЛ-1',
    2: 'ЮФЛ-2',
    3: 'ЮФЛ-3',
  }), []);

  const getTournamentName = (tournamentId: number) => {
    return TOURNAMENT_NAMES[tournamentId] || `Турнир ${tournamentId}`;
  };

  const formatValue = (value: unknown, format?: 'percent' | 'datetime') => {
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
        return `${asPercent.toFixed(1)}%`;
      }
      return Number.isInteger(numericValue) ? numericValue : Number(numericValue.toFixed(2));
    }

    return String(value);
  };

  const dataColumns: TableColumn[] = useMemo(() => ([
    { key: 'player_name', label: 'Игрок', cellClassName: 'min-w-[160px] text-sm font-medium text-gray-900' },
    { key: 'team_name', label: 'Команда', cellClassName: 'min-w-[160px] text-sm text-gray-700' },
    {
      key: 'tracking_status',
      label: 'Статус',
      align: 'center',
      render: (player) => <TrackingStatusBadge status={player.tracking_status as TrackingStatus} />, 
      cellClassName: 'whitespace-nowrap'
    },
    {
      key: 'tournament_id',
      label: 'Турнир',
      align: 'center',
      render: (player) => <Badge variant="indigo">{getTournamentName(player.tournament_id)}</Badge>,
      cellClassName: 'whitespace-nowrap'
    },
    { key: 'player_number', label: 'Игровой номер', align: 'center' },
    { key: 'position', label: 'Позиция', align: 'center' },
    { key: 'age', label: 'Возраст', align: 'center' },
    { key: 'height', label: 'Рост', align: 'center' },
    { key: 'weight', label: 'Вес', align: 'center' },
    { key: 'citizenship', label: 'Гражданство', cellClassName: 'min-w-[120px] text-center' },
    { key: 'player_index', label: 'Индекс игрока', align: 'center' },
    { key: 'minutes_played', label: 'Минуты', align: 'center' },
    { key: 'goals', label: 'Голы', align: 'center' },
    { key: 'assists', label: 'Ассисты', align: 'center' },
    { key: 'shots', label: 'Удары', align: 'center' },
    { key: 'shots_on_target', label: 'Удары в створ', align: 'center' },
    { key: 'xg', label: 'xG', align: 'center' },
    { key: 'goal_attempts', label: 'Голевые моменты', align: 'center' },
    { key: 'goal_attempts_successful', label: 'Голевые удачные', align: 'center' },
    { key: 'goal_attempts_success_rate', label: 'Голевые удачные, %', align: 'center', format: 'percent' },
    { key: 'goal_moments_created', label: 'Голевые создал', align: 'center' },
    { key: 'goal_attacks_participation', label: 'Участия в голевых атаках', align: 'center' },
    { key: 'passes_total', label: 'Передачи всего', align: 'center' },
    { key: 'passes_accuracy', label: 'Передачи точные, %', align: 'center', format: 'percent' },
    { key: 'passes_key', label: 'Передачи ключевые', align: 'center' },
    { key: 'passes_key_accuracy', label: 'Ключевые точные, %', align: 'center', format: 'percent' },
    { key: 'crosses', label: 'Навесы', align: 'center' },
    { key: 'crosses_accuracy', label: 'Навесы точные, %', align: 'center', format: 'percent' },
    { key: 'passes_progressive', label: 'Прогрессивные передачи', align: 'center' },
    { key: 'passes_progressive_accuracy', label: 'Прогрессивные точные, %', align: 'center', format: 'percent' },
    { key: 'passes_progressive_clean', label: 'Прогрессивные чистые', align: 'center' },
    { key: 'passes_long', label: 'Длинные передачи', align: 'center' },
    { key: 'passes_long_accuracy', label: 'Длинные точные, %', align: 'center', format: 'percent' },
    { key: 'passes_super_long', label: 'Сверхдлинные передачи', align: 'center' },
    { key: 'passes_super_long_accuracy', label: 'Сверхдлинные точные, %', align: 'center', format: 'percent' },
    { key: 'passes_final_third', label: 'Передачи в финальную треть', align: 'center' },
    { key: 'passes_final_third_accuracy', label: 'Финальная треть точные, %', align: 'center', format: 'percent' },
    { key: 'passes_penalty_area', label: 'Передачи в штрафную', align: 'center' },
    { key: 'passes_penalty_area_accuracy', label: 'В штрафную точные, %', align: 'center', format: 'percent' },
    { key: 'passes_for_shot', label: 'Передачи под удар', align: 'center' },
    { key: 'goal_errors', label: 'Голевые ошибки', align: 'center' },
    { key: 'rough_errors', label: 'Грубые ошибки', align: 'center' },
    { key: 'yellow_cards', label: 'Жёлтые карточки', align: 'center' },
    { key: 'red_cards', label: 'Красные карточки', align: 'center' },
    { key: 'fouls_committed', label: 'Фолы совершённые', align: 'center' },
    { key: 'fouls_suffered', label: 'Фолы против', align: 'center' },
    { key: 'duels_total', label: 'Единоборства всего', align: 'center' },
    { key: 'duels_success_rate', label: 'Единоборства удачные, %', align: 'center', format: 'percent' },
    { key: 'duels_defensive', label: 'Единоборства (оборона)', align: 'center' },
    { key: 'duels_defensive_success_rate', label: 'Оборона удачные, %', align: 'center', format: 'percent' },
    { key: 'duels_offensive', label: 'Единоборства (атака)', align: 'center' },
    { key: 'duels_offensive_success_rate', label: 'Атака удачные, %', align: 'center', format: 'percent' },
    { key: 'duels_aerial', label: 'Единоборства верховые', align: 'center' },
    { key: 'duels_aerial_success_rate', label: 'Верховые удачные, %', align: 'center', format: 'percent' },
    { key: 'dribbles', label: 'Обводки', align: 'center' },
    { key: 'dribbles_success_rate', label: 'Обводки удачные, %', align: 'center', format: 'percent' },
    { key: 'dribbles_final_third', label: 'Обводки в финальной трети', align: 'center' },
    { key: 'dribbles_final_third_success_rate', label: 'Обводки финальная треть, %', align: 'center', format: 'percent' },
    { key: 'tackles', label: 'Отборы', align: 'center' },
    { key: 'tackles_success_rate', label: 'Отборы удачные, %', align: 'center', format: 'percent' },
    { key: 'interceptions', label: 'Перехваты', align: 'center' },
    { key: 'recoveries', label: 'Подборы', align: 'center' },
    {
      key: 'notes',
      label: 'Заметки',
      cellClassName: 'whitespace-normal break-words min-w-[200px] text-sm text-gray-700',
    },
    {
      key: 'created_at',
      label: 'Создано',
      align: 'center',
      format: 'datetime',
    },
    {
      key: 'updated_at',
      label: 'Обновлено',
      align: 'center',
      format: 'datetime',
    },
    {
      key: 'id',
      label: 'ID',
      cellClassName: 'text-xs text-gray-500 max-w-[160px] truncate',
    },
  ]), [getTournamentName]);

  const columns: TableColumn[] = useMemo(() => [
    {
      key: 'index',
      label: '№',
      align: 'center',
      render: (_, index) => startIndex + index + 1,
    },
    ...dataColumns,
  ], [dataColumns, startIndex]);

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-red-600 mb-2">
          Ошибка загрузки данных
        </h2>
        <p className="text-gray-600">{error instanceof Error ? error.message : 'Произошла ошибка'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>База данных футболистов</CardTitle>
              <p className="mt-2 text-sm text-gray-500">
                Всего игроков: {players.length}. Все данные импортированы из Excel-файлов и отражают столбцы таблицы players_stats_raw.
              </p>
            </div>
            <div className="flex items-center space-x-2 self-start md:self-auto">
              <Button
                variant={showFilters ? "primary" : "secondary"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <FunnelIcon className="w-4 h-4 mr-2" />
                Фильтры
              </Button>
              {Object.values(searchFilters).some(v => v) && (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Очистить
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Основной поиск */}
          <div className="mb-4">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Поиск по имени игрока, команде или позиции..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchFilters.query}
                onChange={(e) => handleFilterChange('query', e.target.value)}
              />
            </div>
          </div>

          {/* Расширенные фильтры */}
          {showFilters && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Турнир
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={searchFilters.tournament}
                    onChange={(e) => handleFilterChange('tournament', e.target.value)}
                  >
                    <option value="">Все турниры</option>
                    {Object.entries(TOURNAMENT_NAMES).map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Позиция
                  </label>
                  <input
                    type="text"
                    placeholder="Например: GK, DF, MF, FW"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={searchFilters.position}
                    onChange={(e) => handleFilterChange('position', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Голы (от - до)
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      placeholder="От"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={searchFilters.minGoals}
                      onChange={(e) => handleFilterChange('minGoals', e.target.value)}
                    />
                    <input
                      type="number"
                      placeholder="До"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={searchFilters.maxGoals}
                      onChange={(e) => handleFilterChange('maxGoals', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ассисты (от - до)
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      placeholder="От"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={searchFilters.minAssists}
                      onChange={(e) => handleFilterChange('minAssists', e.target.value)}
                    />
                    <input
                      type="number"
                      placeholder="До"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={searchFilters.maxAssists}
                      onChange={(e) => handleFilterChange('maxAssists', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Статистика */}
          <div className="mb-4 text-sm text-gray-600">
            Показано {paginatedPlayers.length} из {filteredPlayers.length} записей 
            {filteredPlayers.length !== players.length && ` (всего в базе: ${players.length})`}
          </div>

          {/* Таблица */}
          <Table>
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableHeader key={String(column.key)} align={column.align}>
                    {column.label}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <LoadingTableRow columns={columns.length} />
              ) : paginatedPlayers.length === 0 ? (
                <EmptyTableState 
                  title={
                    Object.values(searchFilters).some(v => v)
                      ? "По вашему запросу ничего не найдено"
                      : "Нет данных для отображения"
                  }
                  description={
                    Object.values(searchFilters).some(v => v)
                      ? "Попробуйте изменить параметры поиска"
                      : "Загрузите данные или обновите фильтры"
                  }
                  colSpan={columns.length}
                />
              ) : (
                paginatedPlayers.map((player: Player, index: number) => (
                  <TableRow key={`${player.id || player.player_name}-${index}`}>
                    {columns.map((column) => {
                      const value = column.key === 'index'
                        ? column.render?.(player, index)
                        : column.render
                          ? column.render(player, index)
                          : formatValue(
                              player[column.key as keyof Player],
                              column.format,
                            );

                      return (
                        <TableCell
                          key={`${player.id || player.player_name}-${String(column.key)}`}
                          align={column.align}
                          className={column.cellClassName}
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
              totalItems={filteredPlayers.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};
