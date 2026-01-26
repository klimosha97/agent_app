/**
 * Страница профиля игрока
 * Показывает полную статистику игрока с возможностью переключения:
 * - TOTAL / PER90
 * - SEASON / ROUND (выбор конкретного тура)
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { 
  ArrowLeftIcon, 
  UserIcon,
  MapPinIcon,
  CalendarIcon,
  TrophyIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlagIcon
} from '@heroicons/react/24/outline';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { apiService } from '../services/api';

interface PlayerProfileProps {
  playerId: number;
  onBack: () => void;
}

// Группировка метрик по категориям для красивого отображения
const CATEGORY_NAMES: Record<string, string> = {
  'basic': 'Основное',
  'scoring': 'Голы и результативность',
  'shooting': 'Удары',
  'passing': 'Передачи',
  'duels': 'Единоборства',
  'dribbling': 'Обводки',
  'defense': 'Защита',
  'discipline': 'Дисциплина',
  'errors': 'Ошибки',
};

const CATEGORY_ORDER = ['basic', 'scoring', 'shooting', 'passing', 'duels', 'dribbling', 'defense', 'discipline', 'errors'];

export const PlayerProfile: React.FC<PlayerProfileProps> = ({ playerId, onBack }) => {
  // Состояния для выбора слайса
  const [sliceType, setSliceType] = useState<'TOTAL' | 'PER90'>('TOTAL');
  const [periodType, setPeriodType] = useState<'SEASON' | 'ROUND'>('SEASON');
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  // Загружаем базовую информацию об игроке
  const { data: playerInfo, isLoading: isLoadingInfo } = useQuery(
    ['player-info', playerId],
    () => apiService.getPlayerInfo(playerId),
    { enabled: !!playerId }
  );

  // Загружаем доступные слайсы
  const { data: availableSlices } = useQuery(
    ['player-slices', playerId],
    () => apiService.getPlayerAvailableSlices(playerId),
    { enabled: !!playerId }
  );

  // Загружаем статистику игрока
  const { data: statsData, isLoading: isLoadingStats } = useQuery(
    ['player-stats', playerId, sliceType, periodType, selectedRound],
    () => apiService.getPlayerStats(
      playerId, 
      sliceType, 
      periodType, 
      periodType === 'ROUND' ? selectedRound ?? undefined : undefined
    ),
    { 
      enabled: !!playerId && (periodType === 'SEASON' || selectedRound !== null),
      keepPreviousData: true 
    }
  );

  // Устанавливаем последний тур по умолчанию при загрузке
  useEffect(() => {
    if (availableSlices?.slices?.rounds?.length && selectedRound === null) {
      setSelectedRound(availableSlices.slices.rounds[0]);
    }
  }, [availableSlices, selectedRound]);

  const player = playerInfo?.data;
  const stats = statsData?.stats_detailed || [];
  const availableRounds = availableSlices?.slices?.rounds || [];

  // Группируем статистику по категориям
  const groupedStats: Record<string, typeof stats> = {};
  stats.forEach(stat => {
    const category = stat.category || 'other';
    if (!groupedStats[category]) {
      groupedStats[category] = [];
    }
    groupedStats[category].push(stat);
  });

  // Форматирование значения
  const formatValue = (value: number | null, dataType: string): string => {
    if (value === null || value === undefined) return '—';
    if (dataType === 'PERCENTAGE') return `${value.toFixed(1)}%`;
    if (dataType === 'FLOAT') return value.toFixed(2);
    return value % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
  };

  // Вычисляем возраст
  const getAge = () => {
    if (!player?.birth_year) return null;
    return new Date().getFullYear() - player.birth_year;
  };

  if (isLoadingInfo) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin h-10 w-10 text-blue-500 mr-3" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-gray-500 text-lg">Загрузка данных игрока...</span>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 text-lg">Игрок не найден</p>
        <Button variant="secondary" onClick={onBack} className="mt-4">
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          Назад
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Кнопка назад */}
      <div>
        <Button variant="secondary" size="sm" onClick={onBack}>
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          Назад к списку
        </Button>
      </div>

      {/* Карточка игрока */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-6">
              {/* Аватар */}
              <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center">
                <UserIcon className="w-14 h-14 text-white/80" />
              </div>
              
              {/* Основная информация */}
              <div>
                <h1 className="text-3xl font-bold">{player.full_name}</h1>
                <div className="flex items-center space-x-4 mt-2 text-blue-100">
                  <span className="flex items-center">
                    <MapPinIcon className="w-5 h-5 mr-1" />
                    {player.team_name}
                  </span>
                  <span className="flex items-center">
                    <TrophyIcon className="w-5 h-5 mr-1" />
                    {player.tournament_name}
                  </span>
                </div>
                <div className="flex items-center space-x-3 mt-3">
                  <Badge variant="primary" size="lg" className="bg-white/20 text-white border-white/30">
                    {player.position_code}
                  </Badge>
                  <span className="text-sm text-blue-200">{player.position_name}</span>
                </div>
              </div>
            </div>

            {/* Дополнительная информация */}
            <div className="text-right space-y-1 text-blue-100">
              {getAge() && (
                <p className="flex items-center justify-end">
                  <CalendarIcon className="w-4 h-4 mr-1" />
                  {getAge()} лет ({player.birth_year} г.р.)
                </p>
              )}
              {player.height && <p>Рост: {player.height} см</p>}
              {player.weight && <p>Вес: {player.weight} кг</p>}
              {player.citizenship && <p>Гражданство: {player.citizenship}</p>}
            </div>
          </div>
        </div>
      </Card>

      {/* Панель управления */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Переключатель TOTAL / PER90 */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setSliceType('TOTAL')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  sliceType === 'TOTAL' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Всего
              </button>
              <button
                onClick={() => setSliceType('PER90')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  sliceType === 'PER90' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                За 90 минут
              </button>
            </div>

            {/* Переключатель SEASON / ROUND */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setPeriodType('SEASON')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    periodType === 'SEASON' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  За сезон
                </button>
                <button
                  onClick={() => setPeriodType('ROUND')}
                  disabled={availableRounds.length === 0}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    periodType === 'ROUND' ? 'bg-white text-yellow-600 shadow' : 'text-gray-600 hover:text-gray-900'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  За тур
                </button>
              </div>

              {/* Выбор тура */}
              {periodType === 'ROUND' && availableRounds.length > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const currentIdx = availableRounds.indexOf(selectedRound!);
                      if (currentIdx < availableRounds.length - 1) {
                        setSelectedRound(availableRounds[currentIdx + 1]);
                      }
                    }}
                    disabled={selectedRound === availableRounds[availableRounds.length - 1]}
                    className="p-2 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeftIcon className="w-5 h-5" />
                  </button>

                  <select
                    value={selectedRound || ''}
                    onChange={(e) => setSelectedRound(Number(e.target.value))}
                    className="px-4 py-2 border border-yellow-300 rounded-lg bg-yellow-50 text-yellow-800 font-bold text-center focus:ring-2 focus:ring-yellow-500 cursor-pointer min-w-[100px]"
                  >
                    {availableRounds.map((round) => (
                      <option key={round} value={round}>
                        Тур {round}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      const currentIdx = availableRounds.indexOf(selectedRound!);
                      if (currentIdx > 0) {
                        setSelectedRound(availableRounds[currentIdx - 1]);
                      }
                    }}
                    disabled={selectedRound === availableRounds[0]}
                    className="p-2 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRightIcon className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Информация о текущем отображении */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 flex items-center">
              {periodType === 'ROUND' && <FlagIcon className="w-4 h-4 mr-2 text-yellow-600" />}
              <span className="font-medium">
                Показана статистика: {sliceType === 'TOTAL' ? 'суммарная' : 'за 90 минут'},{' '}
                {periodType === 'SEASON' ? 'за весь сезон' : `за тур ${selectedRound}`}
              </span>
              {stats.length > 0 && (
                <span className="ml-2 text-gray-400">
                  ({stats.length} метрик)
                </span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Статистика по категориям */}
      {isLoadingStats ? (
        <Card>
          <CardContent>
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-500 mr-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-gray-500">Загрузка статистики...</span>
            </div>
          </CardContent>
        </Card>
      ) : stats.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">
                {periodType === 'ROUND' 
                  ? `Нет данных за тур ${selectedRound}` 
                  : 'Нет данных за сезон'}
              </p>
              <p className="text-gray-400 text-sm mt-2">
                Возможно, данные ещё не загружены
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {CATEGORY_ORDER.filter(cat => groupedStats[cat]?.length > 0).map((category) => (
            <Card key={category} className={periodType === 'ROUND' ? 'border-yellow-200' : ''}>
              <CardHeader className={periodType === 'ROUND' ? 'bg-yellow-50/50' : 'bg-gray-50'}>
                <CardTitle className="text-lg">
                  {CATEGORY_NAMES[category] || category}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <tbody className="divide-y divide-gray-100">
                    {groupedStats[category].map((stat, idx) => (
                      <tr 
                        key={stat.code} 
                        className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50 transition-colors`}
                      >
                        <td className="px-4 py-2.5 text-sm text-gray-700">
                          <span className={stat.is_key_metric ? 'font-semibold' : ''}>
                            {stat.display_name}
                          </span>
                          {stat.is_key_metric && (
                            <span className="ml-2 text-xs text-blue-500">★</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-medium tabular-nums">
                          <span className={
                            stat.code === 'goals' || stat.code === 'assists' ? 'text-green-600 font-bold text-base' :
                            stat.code === 'xg' || stat.code === 'xa' ? 'text-purple-600' :
                            stat.code === 'yellow_cards' ? 'text-yellow-600' :
                            stat.code === 'red_cards' ? 'text-red-600' :
                            stat.data_type === 'PERCENTAGE' ? 'text-gray-500' :
                            'text-gray-900'
                          }>
                            {formatValue(stat.value, stat.data_type)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}

          {/* Показываем остальные категории если есть */}
          {Object.keys(groupedStats)
            .filter(cat => !CATEGORY_ORDER.includes(cat) && groupedStats[cat]?.length > 0)
            .map((category) => (
              <Card key={category}>
                <CardHeader className="bg-gray-50">
                  <CardTitle className="text-lg">
                    {CATEGORY_NAMES[category] || category}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full">
                    <tbody className="divide-y divide-gray-100">
                      {groupedStats[category].map((stat, idx) => (
                        <tr 
                          key={stat.code} 
                          className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50 transition-colors`}
                        >
                          <td className="px-4 py-2.5 text-sm text-gray-700">
                            {stat.display_name}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right font-medium tabular-nums text-gray-900">
                            {formatValue(stat.value, stat.data_type)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
};
