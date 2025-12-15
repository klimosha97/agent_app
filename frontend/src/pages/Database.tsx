/**
 * Страница "База данных"
 * Показывает всех игроков со всей статистикой
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, LoadingTableRow, EmptyTableState, TablePagination } from '../components/ui/Table';
import { apiService } from '../services/api';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

type SliceType = 'TOTAL' | 'PER90';

export const Database: React.FC = () => {
  const [sliceType, setSliceType] = useState<SliceType>('TOTAL');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);

  // Поиск в реальном времени с debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setCurrentPage(1);
    }, 300); // Задержка 300ms

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Загружаем данные
  const { data, isLoading, error } = useQuery(
    ['database-players', sliceType, search, currentPage, itemsPerPage],
    () => apiService.getAllPlayersFromDatabase(
      currentPage,
      itemsPerPage,
      sliceType,
      search || undefined
    ),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false
    }
  );

  const players = data?.data || [];
  const totalCount = data?.total || 0;
  const totalPages = data?.pages || 0;

  const formatValue = (value: number | null | undefined, isPercent: boolean = false): string => {
    if (value === null || value === undefined) return '—';
    
    if (isPercent) {
      return `${value.toFixed(1)}%`;
    }
    
    return value % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
  };

  return (
    <div className="space-y-6">
      {/* Заголовок и тумблер */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">База данных футболистов</h1>
          <p className="text-gray-600">Все игроки со статистикой</p>
        </div>

        {/* Тумблер TOTAL / PER90 */}
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => {
              setSliceType('TOTAL');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              sliceType === 'TOTAL'
                ? 'bg-white text-blue-600 shadow'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Всего
          </button>
          <button
            onClick={() => {
              setSliceType('PER90');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              sliceType === 'PER90'
                ? 'bg-white text-blue-600 shadow'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            За 90 минут
          </button>
        </div>
      </div>

      {/* Поиск */}
      <Card>
        <CardContent>
          <div className="flex gap-2">
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
                  onClick={() => {
                    setSearchInput('');
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {searchInput && (
              <div className="flex items-center text-sm text-gray-500">
                Поиск...
              </div>
            )}
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
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Игрок</TableHeader>
                  <TableHeader>Команда</TableHeader>
                  <TableHeader>Поз</TableHeader>
                  <TableHeader className="text-right">Мин</TableHeader>
                  <TableHeader className="text-right">Голы</TableHeader>
                  <TableHeader className="text-right">Ассисты</TableHeader>
                  <TableHeader className="text-right">xG</TableHeader>
                  <TableHeader className="text-right">Удары</TableHeader>
                  <TableHeader className="text-right">В створ</TableHeader>
                  <TableHeader className="text-right">Передачи</TableHeader>
                  <TableHeader className="text-right">Точн. %</TableHeader>
                  <TableHeader className="text-right">Ключевые</TableHeader>
                  <TableHeader className="text-right">Единоборства</TableHeader>
                  <TableHeader className="text-right">Успеш. %</TableHeader>
                  <TableHeader className="text-right">Обводки</TableHeader>
                  <TableHeader className="text-right">Отборы</TableHeader>
                  <TableHeader className="text-right">Перехваты</TableHeader>
                  <TableHeader className="text-right">Подборы</TableHeader>
                  <TableHeader className="text-right">ЖК</TableHeader>
                  <TableHeader className="text-right">КК</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <LoadingTableRow colSpan={20} />
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={20} className="text-center text-red-600 py-8">
                      Ошибка загрузки данных
                    </TableCell>
                  </TableRow>
                ) : players.length === 0 ? (
                  <EmptyTableState
                    colSpan={20}
                    message={search ? 'Ничего не найдено' : 'Нет данных'}
                  />
                ) : (
                  players.map((player: any) => (
                    <TableRow key={player.player_id}>
                      <TableCell className="font-medium">{player.full_name}</TableCell>
                      <TableCell className="text-sm text-gray-600">{player.team_name}</TableCell>
                      <TableCell>
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800">
                          {player.position_code}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(player.minutes)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatValue(player.goals)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(player.assists)}</TableCell>
                      <TableCell className="text-right tabular-nums text-purple-600 font-medium">{formatValue(player.xg)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(player.shots)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(player.shots_on_target)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(player.passes)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(player.passes_accurate_pct, true)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(player.key_passes)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(player.duels)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(player.duels_success_pct, true)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(player.dribbles)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(player.tackles)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(player.interceptions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatValue(player.recoveries)}</TableCell>
                      <TableCell className="text-right tabular-nums text-yellow-600">{formatValue(player.yellow_cards)}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-600">{formatValue(player.red_cards)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Пагинация */}
          {totalPages > 1 && (
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};
