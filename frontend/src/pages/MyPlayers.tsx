/**
 * Страница "Мои футболисты"
 * Показывает список игроков с tracking_status != "non interesting"
 */

import React, { useState } from 'react';
import { PlusIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { useTrackedPlayers, useTournaments } from '../hooks/useApi';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, TrackingStatusBadge } from '../components/ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, EmptyTableState, LoadingTableRow, TablePagination } from '../components/ui/Table';
import { Player, TrackingStatus } from '../types';
import { getTournamentName, formatStats, formatMinutes } from '../utils';

export const MyPlayers: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [selectedTournament, setSelectedTournament] = useState<number>();

  // Загружаем данные
  const { data: trackedPlayersResponse, isLoading: isLoadingPlayers, error: playersError } = useTrackedPlayers(
    selectedTournament,
    { page: currentPage, per_page: itemsPerPage }
  );

  const { data: tournamentsResponse } = useTournaments();

  const trackedPlayers = trackedPlayersResponse?.data || [];
  const totalPlayers = trackedPlayersResponse?.total || 0;
  const totalPages = Math.ceil(totalPlayers / itemsPerPage);

  // Группировка игроков по статусам
  const playersByStatus = trackedPlayers.reduce((acc, player) => {
    const status = player.tracking_status as TrackingStatus;
    if (!acc[status]) {
      acc[status] = [];
    }
    acc[status].push(player);
    return acc;
  }, {} as Record<TrackingStatus, Player[]>);

  const handleAddPlayer = () => {
    // TODO: Открыть модальное окно для добавления игрока
    console.log('Открыть поиск игроков');
  };

  if (playersError) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-red-600 mb-2">
          Ошибка загрузки данных
        </h2>
        <p className="text-gray-600">{(playersError as any)?.message || 'Произошла ошибка'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Мои футболисты
          </h1>
          <p className="text-gray-600">
            Список отслеживаемых игроков ({totalPlayers})
          </p>
        </div>

        <Button
          variant="primary"
          icon={<PlusIcon className="w-4 h-4" />}
          onClick={handleAddPlayer}
        >
          Добавить футболиста
        </Button>
      </div>

      {/* Фильтры */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label htmlFor="tournament-filter" className="block text-sm font-medium text-gray-700 mb-1">
                Турнир
              </label>
              <select
                id="tournament-filter"
                value={selectedTournament ?? ''}
                onChange={(e) => setSelectedTournament(e.target.value ? Number(e.target.value) : undefined)}
                className="form-select w-48"
              >
                <option value="">Все турниры</option>
                {tournamentsResponse?.data?.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Статистика по статусам */}
            <div className="flex space-x-4 ml-auto">
              {Object.entries(playersByStatus).map(([status, players]) => (
                <div key={status} className="text-center">
                  <TrackingStatusBadge 
                    status={status as TrackingStatus} 
                    size="lg" 
                  />
                  <div className="text-sm text-gray-500 mt-1">
                    {players.length}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Основной контент */}
      {totalPlayers === 0 && !isLoadingPlayers ? (
        // Пустое состояние
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <div className="mx-auto h-12 w-12 text-gray-400">
                <UserPlusIcon />
              </div>
              <h3 className="mt-2 text-lg font-medium text-gray-900">
                Нет отслеживаемых футболистов
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Добавьте первого футболиста, чтобы начать отслеживание его статистики.
              </p>
              <div className="mt-6">
                <Button
                  variant="primary"
                  icon={<PlusIcon className="w-4 h-4" />}
                  onClick={handleAddPlayer}
                >
                  Добавить футболиста
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        // Таблица с игроками
        <Card padding="none">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Игрок</TableHeader>
                <TableHeader>Команда</TableHeader>
                <TableHeader>Турнир</TableHeader>
                <TableHeader>Позиция</TableHeader>
                <TableHeader>Статус</TableHeader>
                <TableHeader align="center">Голы</TableHeader>
                <TableHeader align="center">Ассисты</TableHeader>
                <TableHeader align="center">Минуты</TableHeader>
                <TableHeader align="center">Рейтинг</TableHeader>
              </TableRow>
            </TableHead>
            
            <TableBody>
              {isLoadingPlayers ? (
                // Состояние загрузки
                Array.from({ length: itemsPerPage }).map((_, index) => (
                  <LoadingTableRow key={index} columns={9} />
                ))
              ) : trackedPlayers.length === 0 ? (
                <EmptyTableState
                  title="Игроки не найдены"
                  description="Попробуйте изменить фильтры или добавить новых игроков"
                />
              ) : (
                // Данные игроков
                trackedPlayers.map((player) => (
                  <TableRow key={player.id} hover>
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="font-medium text-gray-900">
                          {player.player_name}
                        </div>
                        {player.age && (
                          <div className="text-sm text-gray-500">
                            {player.age} лет
                          </div>
                        )}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div className="text-sm text-gray-900">
                        {player.team_name}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <Badge variant="blue" size="sm">
                        {getTournamentName(player.tournament_id)}
                      </Badge>
                    </TableCell>
                    
                    <TableCell>
                      {player.position ? (
                        <Badge variant="gray" size="sm">
                          {player.position}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    
                    <TableCell>
                      <TrackingStatusBadge 
                        status={player.tracking_status}
                        size="sm"
                      />
                    </TableCell>
                    
                    <TableCell align="center">
                      <span className="font-semibold text-green-600">
                        {formatStats(player.goals)}
                      </span>
                    </TableCell>
                    
                    <TableCell align="center">
                      <span className="font-semibold text-blue-600">
                        {formatStats(player.assists)}
                      </span>
                    </TableCell>
                    
                    <TableCell align="center">
                      <span className="text-sm text-gray-600">
                        {formatMinutes(player.minutes_played)}
                      </span>
                    </TableCell>
                    
                    <TableCell align="center">
                      {player.xg ? (
                        <span className="text-sm font-medium text-purple-600">
                          {player.xg.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Пагинация */}
          {totalPlayers > 0 && (
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalPlayers}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
            />
          )}
        </Card>
      )}

      {/* Быстрые действия */}
      <Card>
        <CardHeader>
          <CardTitle as="h3">Быстрые действия</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="secondary"
              fullWidth
              icon={<PlusIcon className="w-4 h-4" />}
              onClick={handleAddPlayer}
            >
              Найти игрока
            </Button>
            
            <Button
              variant="secondary"
              fullWidth
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
              disabled
            >
              Сравнить игроков
            </Button>
            
            <Button
              variant="secondary"
              fullWidth
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              disabled
            >
              Экспорт отчёта
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};










