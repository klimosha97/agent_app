/**
 * Страница "Отслеживаемые футболисты"
 * Показывает список всех отслеживаемых игроков с возможностью поиска и изменения статусов
 */

import React, { useState, useEffect } from 'react';
import { 
  MagnifyingGlassIcon, 
  UserPlusIcon,
  PencilIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { useTrackedPlayersPage, usePlayerSearchWithState, useUpdatePlayerStatus } from '../hooks/useApi';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, TrackingStatusBadge } from '../components/ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, EmptyTableState, LoadingTableRow, TablePagination } from '../components/ui/Table';
import { Player, TrackingStatus, TRACKING_STATUSES } from '../types';
import { getTournamentName, formatStats, formatMinutes, debounce, classNames } from '../utils';

interface PlayerSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PlayerSearchModal: React.FC<PlayerSearchModalProps> = ({ isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTournament, setSelectedTournament] = useState<number>();
  const [debouncedQuery, setDebouncedQuery] = useState('');
  
  const { searchResults, tournaments } = usePlayerSearchWithState();
  const updateStatusMutation = useUpdatePlayerStatus();

  // Дебаунсинг поискового запроса
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleStatusUpdate = async (playerId: string, status: TrackingStatus) => {
    try {
      await updateStatusMutation.mutateAsync({
        playerId,
        status,
        notes: `Статус изменён через поиск: ${TRACKING_STATUSES[status]}`
      });
      
      setSearchQuery(''); // Очищаем поиск после успешного обновления
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Ошибка при обновлении статуса игрока');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Найти и добавить футболиста
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Поиск */}
          <div className="flex space-x-4">
            <div className="flex-1">
              <div className="relative">
                <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="Введите имя игрока..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input pl-10"
                />
              </div>
            </div>
            <select
              value={selectedTournament ?? ''}
              onChange={(e) => setSelectedTournament(e.target.value ? Number(e.target.value) : undefined)}
              className="form-select w-48"
            >
              <option value="">Все турниры</option>
              {tournaments.data?.data?.map((tournament: any) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                </option>
              ))}
            </select>
          </div>

          {/* Результаты поиска */}
          <div className="max-h-96 overflow-y-auto">
            {debouncedQuery.length < 2 ? (
              <div className="text-center py-8 text-gray-500">
                Введите минимум 2 символа для поиска
              </div>
            ) : searchResults.isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
                <p className="text-gray-500 mt-2">Поиск...</p>
              </div>
            ) : searchResults.data?.results?.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Игроки не найдены
              </div>
            ) : (
              <div className="space-y-2">
                {searchResults.data?.results?.map((player) => (
                  <div
                    key={player.id}
                    className="border rounded-lg p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {player.player_name}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {player.team_name} • {getTournamentName(player.tournament_id)}
                            </p>
                          </div>
                        </div>
                        
                        <div className="mt-2 flex items-center space-x-4">
                          <TrackingStatusBadge 
                            status={player.current_status} 
                            size="sm" 
                          />
                          {player.position && (
                            <Badge variant="gray" size="sm">
                              {player.position}
                            </Badge>
                          )}
                          <div className="text-sm text-gray-600">
                            Голы: {player.basic_stats.goals} • 
                            Ассисты: {player.basic_stats.assists}
                          </div>
                        </div>
                      </div>

                      {/* Кнопки изменения статуса */}
                      <div className="flex space-x-2 ml-4">
                        {(['interesting', 'to watch', 'my player'] as TrackingStatus[]).map((status) => (
                          <Button
                            key={status}
                            size="sm"
                            variant={player.current_status === status ? 'primary' : 'secondary'}
                            disabled={updateStatusMutation.isLoading}
                            onClick={() => handleStatusUpdate(player.id, status)}
                          >
                            {TRACKING_STATUSES[status]}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const TrackedPlayers: React.FC = () => {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [newStatus, setNewStatus] = useState<TrackingStatus>('interesting');

  const {
    trackedPlayers,
    tournaments,
    tournamentFilter,
    setTournamentFilter,
    pagination,
    setPagination
  } = useTrackedPlayersPage();

  const updateStatusMutation = useUpdatePlayerStatus();

  const players = trackedPlayers.data?.data || [];
  const totalPlayers = trackedPlayers.data?.total || 0;
  const totalPages = Math.ceil(totalPlayers / pagination.per_page);

  const handleStatusUpdate = async (playerId: string, status: TrackingStatus, notes?: string) => {
    try {
      await updateStatusMutation.mutateAsync({ playerId, status, notes });
      setEditingPlayer(null);
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Ошибка при обновлении статуса игрока');
    }
  };

  const openEditModal = (player: Player) => {
    setEditingPlayer(player);
    setNewStatus(player.tracking_status);
  };

  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Отслеживаемые футболисты
          </h1>
          <p className="text-gray-600">
            Управляйте статусами отслеживания игроков ({totalPlayers})
          </p>
        </div>

        <Button
          variant="primary"
          icon={<UserPlusIcon className="w-4 h-4" />}
          onClick={() => setShowSearchModal(true)}
        >
          Найти футболиста
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
                value={tournamentFilter ?? ''}
                onChange={(e) => setTournamentFilter(e.target.value ? Number(e.target.value) : undefined)}
                className="form-select w-48"
              >
                <option value="">Все турниры</option>
                {tournaments.data?.data?.map((tournament: any) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Статистика по статусам */}
            <div className="flex space-x-4 ml-auto">
              {Object.entries(TRACKING_STATUSES)
                .filter(([status]) => status !== 'non interesting')
                .map(([status, label]) => {
                  const count = players.filter(p => p.tracking_status === status).length;
                  return (
                    <div key={status} className="text-center">
                      <TrackingStatusBadge 
                        status={status as TrackingStatus} 
                        size="lg" 
                      />
                      <div className="text-sm text-gray-500 mt-1">
                        {count}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Основной контент */}
      {totalPlayers === 0 && !trackedPlayers.isLoading ? (
        // Пустое состояние
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <div className="mx-auto h-12 w-12 text-gray-400">
                <MagnifyingGlassIcon />
              </div>
              <h3 className="mt-2 text-lg font-medium text-gray-900">
                Нет отслеживаемых футболистов
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Найдите и добавьте футболистов для отслеживания их статистики.
              </p>
              <div className="mt-6">
                <Button
                  variant="primary"
                  icon={<UserPlusIcon className="w-4 h-4" />}
                  onClick={() => setShowSearchModal(true)}
                >
                  Найти футболиста
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
                <TableHeader>Действия</TableHeader>
              </TableRow>
            </TableHead>
            
            <TableBody>
              {trackedPlayers.isLoading ? (
                Array.from({ length: pagination.per_page }).map((_, index) => (
                  <LoadingTableRow key={index} columns={9} />
                ))
              ) : players.length === 0 ? (
                <EmptyTableState
                  title="Игроки не найдены"
                  description="Попробуйте изменить фильтры"
                />
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
                    
                    <TableCell>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<PencilIcon className="w-3 h-3" />}
                        onClick={() => openEditModal(player)}
                      >
                        Изменить
                      </Button>
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
      )}

      {/* Модальное окно поиска */}
      <PlayerSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
      />

      {/* Модальное окно редактирования статуса */}
      {editingPlayer && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Изменить статус игрока
              </h3>
              <button
                onClick={() => setEditingPlayer(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="font-medium text-gray-900">{editingPlayer.player_name}</p>
                <p className="text-sm text-gray-600">{editingPlayer.team_name}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Новый статус
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as TrackingStatus)}
                  className="form-select w-full"
                >
                  {Object.entries(TRACKING_STATUSES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-3 pt-4">
                <Button
                  variant="primary"
                  fullWidth
                  loading={updateStatusMutation.isLoading}
                  onClick={() => handleStatusUpdate(editingPlayer.id, newStatus)}
                >
                  Сохранить
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => setEditingPlayer(null)}
                >
                  Отмена
                </Button>
              </div>
            </div>
          </div>
        </div>
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
              icon={<MagnifyingGlassIcon className="w-4 h-4" />}
              onClick={() => setShowSearchModal(true)}
            >
              Найти нового игрока
            </Button>
            
            <Button
              variant="secondary"
              fullWidth
              disabled
            >
              Массовое изменение
            </Button>
            
            <Button
              variant="secondary"
              fullWidth
              disabled
            >
              Экспорт списка
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};








