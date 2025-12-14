/**
 * Страница "База данных"
 * Показывает все записи из таблицы players_stats_raw с серверной пагинацией (100 записей на страницу)
 * Реализован поиск по фамилии игрока, команде и позиции
 * Корректно обрабатывает изменение количества записей в таблице
 */


import React, { useMemo, useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useAllPlayersData } from '../hooks/useApi';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, EmptyTableState, LoadingTableRow, TablePagination } from '../components/ui/Table';
import { Badge, TrackingStatusBadge } from '../components/ui/Badge';
import { TrackingStatus, Player } from '../types';

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

export const Database: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<string>('player_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const itemsPerPage = 100; // 100 человек на странице

  // Серверная пагинация, поиск и сортировка
  const { data: playersResponse, isLoading, error } = useAllPlayersData(
    currentPage, 
    itemsPerPage, 
    searchQuery,
    sortField,
    sortOrder
  );
  
  const players: Player[] = playersResponse?.data || [];
  const totalItems = playersResponse?.total || 0;
  const totalPages = playersResponse?.total_pages || Math.ceil(totalItems / itemsPerPage) || 0;

  // При изменении поискового запроса сбрасываем на первую страницу
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Обработчик сортировки
  const handleSort = (field: string) => {
    if (field === 'index') return; // Нельзя сортировать по номеру строки
    
    if (sortField === field) {
      // Переключаем порядок если кликнули на ту же колонку
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Новая колонка - начинаем с ascending
      setSortField(field);
      setSortOrder('asc');
    }
    // Сбрасываем на первую страницу при изменении сортировки
    setCurrentPage(1);
  };

  // Индекс для нумерации строк
  const startIndex = (currentPage - 1) * itemsPerPage;

  const TOURNAMENT_NAMES: Record<number, string> = useMemo(() => ({
    0: 'МФЛ',
    1: 'ЮФЛ-1',
    2: 'ЮФЛ-2',
    3: 'ЮФЛ-3',
  }), []);

  const getTournamentName = (tournamentId: number) => {
    return TOURNAMENT_NAMES[tournamentId] || `Турнир ${tournamentId}`;
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
        // Преобразуем в проценты если нужно
        const asPercent = numericValue <= 1 ? numericValue * 100 : numericValue;
        // Проценты тоже округляются до 0.5
        const rounded = roundToHalf(asPercent);
        const displayValue = rounded % 1 === 0 ? rounded : rounded.toFixed(1);
        return `${displayValue}%`;
      }
      
      // Целые числа - без дробной части
      if (Number.isInteger(numericValue)) {
        return numericValue;
      }
      
      // xG отображается с 2 цифрами после запятой без округления
      if (fieldKey === 'xg') {
        return numericValue.toFixed(2);
      }
      
      // Остальные дробные числа округляются до ближайшего 0.5
      const rounded = roundToHalf(numericValue);
      return rounded % 1 === 0 ? rounded : rounded.toFixed(1);
    }

    return String(value);
  };

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
    {
      key: 'tournament_id',
      label: 'Турнир',
      align: 'center',
      sortable: true,
      render: (player) => <Badge variant="indigo">{getTournamentName(player.tournament_id)}</Badge>,
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

  // Сбрасываем на первую страницу, если текущая страница больше общего количества
  React.useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

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
          <div className="flex flex-col gap-4">
            <div>
              <CardTitle>База данных футболистов</CardTitle>
              <p className="mt-2 text-sm text-gray-500">
                Всего игроков в базе: {totalItems}. По {itemsPerPage} игроков на странице.
              </p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Поиск по фамилии */}
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
              {isLoading ? (
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
