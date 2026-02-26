/**
 * Страница "Отслеживаемые футболисты"
 * Показывает игроков, добавленных в список TRACKED
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { apiService } from '../services/api';
import { usePlayerNavigation } from '../App';
import { TrashIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

const POSITION_GROUP_COLORS: Record<string, string> = {
  ATT: 'bg-red-100 text-red-700',
  MID: 'bg-green-100 text-green-700',
  DEF: 'bg-blue-100 text-blue-700',
  GK: 'bg-yellow-100 text-yellow-700',
};

export const TrackedPlayers: React.FC = () => {
  const queryClient = useQueryClient();
  const { setSelectedPlayerId } = usePlayerNavigation();
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading } = useQuery(
    ['watched-players', 'TRACKED'],
    () => apiService.getWatchedPlayers('TRACKED'),
  );

  const removeMutation = useMutation(
    (playerId: number) => apiService.removeWatchedPlayer(playerId, 'TRACKED'),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['watched-players', 'TRACKED']);
        queryClient.invalidateQueries(['watch-status']);
      },
    }
  );

  const players = data?.data || [];
  const filtered = searchInput
    ? players.filter((p: any) =>
        p.full_name.toLowerCase().includes(searchInput.toLowerCase()) ||
        p.team_name?.toLowerCase().includes(searchInput.toLowerCase())
      )
    : players;

  const handlePlayerClick = (player: any) => {
    setSelectedPlayerId(player.player_id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Отслеживаемые футболисты</h1>
          <p className="text-gray-600">
            Игроки для наблюдения. Нажмите на игрока для полной аналитики.
          </p>
        </div>
        <span className="text-sm text-gray-500">{players.length} игроков</span>
      </div>

      {players.length > 0 && (
        <Card>
          <CardContent>
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Поиск по имени или команде..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-500">Загрузка...</div>
      ) : players.length === 0 ? (
        <Card>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-6 shadow-lg">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Список пуст</h2>
              <p className="text-gray-500 text-center max-w-md">
                Откройте карточку игрока в любом турнире и нажмите кнопку «Отслеж.» чтобы добавить.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((player: any) => (
            <div
              key={player.player_id}
              onClick={() => handlePlayerClick(player)}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg hover:border-emerald-300 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 truncate group-hover:text-emerald-600 transition-colors">
                    {player.full_name}
                  </h3>
                  <p className="text-sm text-gray-500 truncate">{player.team_name}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeMutation.mutate(player.player_id); }}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  title="Удалить из списка"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${POSITION_GROUP_COLORS[player.position_group] || 'bg-gray-100 text-gray-600'}`}>
                  {player.position_code}
                </span>
                <span className="text-xs text-gray-400">{player.tournament_name}</span>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};
