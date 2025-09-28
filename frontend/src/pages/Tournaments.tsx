/**
 * Страница "Турниры"
 * Показывает список турниров и позволяет просматривать игроков каждого турнира
 */

import React, { useState } from 'react';
import { 
  ChevronRightIcon, 
  DocumentArrowUpIcon, 
  ArrowPathIcon,
  CalendarIcon,
  UsersIcon,
  TrophyIcon
} from '@heroicons/react/24/outline';
import { useTournaments, useTournamentPlayers, useUploadExcelFile } from '../hooks/useApi';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, LoadingTableRow, TablePagination } from '../components/ui/Table';
import { Tournament, SortOptions, PaginationParams } from '../types';
import { getTournamentName, formatDate, formatStats, timeAgo } from '../utils';

export const Tournaments: React.FC = () => {
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [sort, setSort] = useState<SortOptions>({ field: 'player_name', order: 'asc' });
  const [pagination, setPagination] = useState<PaginationParams>({ page: 1, per_page: 50 });
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);

  // Загружаем данные
  const { data: tournamentsResponse, isLoading: isLoadingTournaments } = useTournaments();
  
  const { 
    data: playersResponse, 
    isLoading: isLoadingPlayers 
  } = useTournamentPlayers(
    selectedTournament?.id ?? -1,
    sort,
    pagination
  );

  const uploadMutation = useUploadExcelFile();

  const tournaments = tournamentsResponse?.data || [];
  const players = playersResponse?.data || [];
  const totalPlayers = playersResponse?.total || 0;
  const totalPages = Math.ceil(totalPlayers / pagination.per_page);

  // Обработчики
  const handleTournamentClick = (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setPagination({ page: 1, per_page: 50 }); // Сбрасываем пагинацию
  };

  const handleBackToTournaments = () => {
    setSelectedTournament(null);
  };

  const handleSort = (field: string) => {
    setSort(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, tournamentId: number) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingFile(file);
    
    try {
      await uploadMutation.mutateAsync({
        file,
        tournamentId,
        options: {
          importToMain: true,
          importToLastRound: true,
        }
      });
      
      // Сбрасываем input
      event.target.value = '';
      
      alert('Файл успешно загружен!');
    } catch (error: any) {
      console.error('Upload failed:', error);
      alert(`Ошибка загрузки: ${error.message || 'Неизвестная ошибка'}`);
    } finally {
      setUploadingFile(null);
    }
  };

  // Если выбран турнир, показываем его игроков
  if (selectedTournament) {
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
              ← Назад к турнирам
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {selectedTournament.full_name}
              </h1>
              <p className="text-gray-600">
                Игроки турнира ({totalPlayers})
              </p>
            </div>
          </div>

          {/* Действия */}
          <div className="flex space-x-3">
            <div className="relative">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileUpload(e, selectedTournament.id)}
                className="sr-only"
                id={`upload-${selectedTournament.id}`}
                disabled={uploadMutation.isLoading}
              />
              <label
                htmlFor={`upload-${selectedTournament.id}`}
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

            <Button variant="secondary" disabled>
              <ArrowPathIcon className="w-4 h-4 mr-2" />
              Обновить данные
            </Button>
          </div>
        </div>

        {/* Информация о турнире */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent>
              <div className="flex items-center">
                <UsersIcon className="w-8 h-8 text-blue-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Всего игроков</p>
                  <p className="text-2xl font-bold text-gray-900">{selectedTournament.players_count}</p>
                </div>
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
                      ? timeAgo(selectedTournament.last_update)
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
                <TrophyIcon className="w-8 h-8 text-yellow-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Код турнира</p>
                  <p className="text-lg font-bold text-gray-900">{selectedTournament.code.toUpperCase()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-primary-600 font-bold">{selectedTournament.id}</span>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">ID турнира</p>
                  <p className="text-lg font-bold text-gray-900">{selectedTournament.id}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Таблица игроков */}
        <Card padding="none">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader 
                  sortable 
                  sorted={sort.field === 'player_name' ? sort.order : null}
                  onSort={() => handleSort('player_name')}
                >
                  Игрок
                </TableHeader>
                <TableHeader 
                  sortable 
                  sorted={sort.field === 'team_name' ? sort.order : null}
                  onSort={() => handleSort('team_name')}
                >
                  Команда
                </TableHeader>
                <TableHeader 
                  sortable 
                  sorted={sort.field === 'position' ? sort.order : null}
                  onSort={() => handleSort('position')}
                >
                  Позиция
                </TableHeader>
                <TableHeader 
                  sortable 
                  sorted={sort.field === 'goals' ? sort.order : null}
                  onSort={() => handleSort('goals')}
                  align="center"
                >
                  Голы
                </TableHeader>
                <TableHeader 
                  sortable 
                  sorted={sort.field === 'assists' ? sort.order : null}
                  onSort={() => handleSort('assists')}
                  align="center"
                >
                  Ассисты
                </TableHeader>
                <TableHeader 
                  sortable 
                  sorted={sort.field === 'minutes_played' ? sort.order : null}
                  onSort={() => handleSort('minutes_played')}
                  align="center"
                >
                  Минуты
                </TableHeader>
                <TableHeader align="center">xG</TableHeader>
                <TableHeader>Статус</TableHeader>
              </TableRow>
            </TableHead>
            
            <TableBody>
              {isLoadingPlayers ? (
                Array.from({ length: pagination.per_page }).map((_, index) => (
                  <LoadingTableRow key={index} columns={8} />
                ))
              ) : (
                players.map((player) => (
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
                      {player.team_name}
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
                        {formatStats(player.minutes_played)}
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
                    
                    <TableCell>
                      <Badge
                        variant={player.tracking_status === 'non interesting' ? 'gray' : 'blue'}
                        size="sm"
                      >
                        {player.tracking_status === 'non interesting' ? 'Обычный' : 'Отслеживается'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Пагинация */}
          {totalPlayers > 0 && (
            <TablePagination
              currentPage={pagination.page}
              totalPages={totalPages}
              totalItems={totalPlayers}
              itemsPerPage={pagination.per_page}
              onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
              onItemsPerPageChange={(per_page) => setPagination({ page: 1, per_page })}
            />
          )}
        </Card>
      </div>
    );
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
          Выберите турнир для просмотра игроков и управления данными
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
            <Card key={tournament.id} hover className="cursor-pointer">
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold tournament-badge ${tournament.code.toLowerCase()}`}>
                        {tournament.code.toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
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
                              ? timeAgo(tournament.last_update)
                              : 'Нет данных'
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                </div>
              </CardContent>

              <CardFooter>
                <div className="flex space-x-2 w-full">
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={() => handleTournamentClick(tournament)}
                  >
                    Просмотреть игроков
                  </Button>

                  <div className="relative">
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
                      className="btn btn-secondary cursor-pointer whitespace-nowrap"
                    >
                      <DocumentArrowUpIcon className="w-4 h-4" />
                    </label>
                  </div>
                </div>
              </CardFooter>
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










