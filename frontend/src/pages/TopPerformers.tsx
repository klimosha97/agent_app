/**
 * Страница "Топ выступления за неделю"
 * Показывает лучших игроков по различным метрикам
 */

import React, { useState } from 'react';
import { 
  TrophyIcon, 
  FireIcon,
  BoltIcon,
  StarIcon,
  ChartBarIcon 
} from '@heroicons/react/24/outline';
import { useTopPerformers, useTournaments } from '../hooks/useApi';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { PlayerPerformance } from '../types';
import { getTournamentName, formatDecimal, formatMinutes } from '../utils';

interface PerformerCardProps {
  title: string;
  icon: React.ReactNode;
  performers: PlayerPerformance[];
  isLoading: boolean;
  valueLabel: string;
  color: string;
}

const PerformerCard: React.FC<PerformerCardProps> = ({
  title,
  icon,
  performers,
  isLoading,
  valueLabel,
  color
}) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <span className={`mr-2 ${color}`}>{icon}</span>
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-1"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                  <div className="h-6 bg-gray-200 rounded w-12"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (performers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <span className={`mr-2 ${color}`}>{icon}</span>
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            Нет данных за выбранный период
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <span className={`mr-2 ${color}`}>{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {performers.map((performer, index) => (
            <div
              key={performer.id}
              className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50"
            >
              {/* Позиция */}
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm
                ${index === 0 ? 'bg-yellow-500' : 
                  index === 1 ? 'bg-gray-400' : 
                  index === 2 ? 'bg-amber-600' : 
                  'bg-gray-300'
                }
              `}>
                {index + 1}
              </div>

              {/* Информация об игроке */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <p className="font-medium text-gray-900 truncate">
                    {performer.player_name}
                  </p>
                  {performer.position && (
                    <Badge variant="gray" size="sm">
                      {performer.position}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <span>{performer.team_name}</span>
                  <span>•</span>
                  <span>{getTournamentName(performer.tournament_id)}</span>
                  {performer.minutes_played && (
                    <>
                      <span>•</span>
                      <span>{formatMinutes(performer.minutes_played)}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Значение метрики */}
              <div className="text-right">
                <div className={`font-bold text-lg ${color.replace('text-', 'text-')}`}>
                  {performer.metric_value}
                </div>
                {performer.per_90_value && performer.per_90_value !== performer.metric_value && (
                  <div className="text-sm text-gray-500">
                    {formatDecimal(performer.per_90_value, 2)} per90
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export const TopPerformers: React.FC = () => {
  const [period, setPeriod] = useState<'all_time' | 'last_round'>('all_time');
  const [selectedTournament, setSelectedTournament] = useState<number>();
  const [limit, setLimit] = useState(10);

  // Загружаем данные
  const { data: topPerformersResponse, isLoading: isLoadingPerformers } = useTopPerformers(
    period,
    limit,
    selectedTournament
  );

  const { data: tournamentsResponse } = useTournaments();

  const topPerformers = topPerformersResponse || {
    goals: [],
    assists: [],
    shots: [],
    passes: []
  };

  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Топ выступления за неделю
        </h1>
        <p className="text-gray-600">
          Лучшие игроки по ключевым метрикам
        </p>
      </div>

      {/* Фильтры */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-center">
            {/* Период */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Период
              </label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as 'all_time' | 'last_round')}
                className="form-select w-48"
              >
                <option value="all_time">Всё время</option>
                <option value="last_round">Последний тур</option>
              </select>
            </div>

            {/* Турнир */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Турнир
              </label>
              <select
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

            {/* Количество */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Топ-N
              </label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="form-select w-24"
              >
                <option value={5}>Топ-5</option>
                <option value={10}>Топ-10</option>
                <option value={20}>Топ-20</option>
              </select>
            </div>

            {/* Информация о периоде */}
            <div className="ml-auto flex items-center space-x-2">
              <div className="text-sm text-gray-600">
                Период: <span className="font-medium">
                  {period === 'all_time' ? 'Всё время' : 'Последний тур'}
                </span>
              </div>
              {selectedTournament && (
                <Badge variant="blue" size="sm">
                  {getTournamentName(selectedTournament)}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Основные метрики */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Лучшие бомбардиры */}
        <PerformerCard
          title="🥅 Лучшие бомбардиры"
          icon={<TrophyIcon className="w-5 h-5" />}
          performers={topPerformers.goals}
          isLoading={isLoadingPerformers}
          valueLabel="голов"
          color="text-green-600"
        />

        {/* Лучшие ассистенты */}
        <PerformerCard
          title="🎯 Лучшие ассистенты"
          icon={<StarIcon className="w-5 h-5" />}
          performers={topPerformers.assists}
          isLoading={isLoadingPerformers}
          valueLabel="ассистов"
          color="text-blue-600"
        />

        {/* Лучшие стрелки */}
        <PerformerCard
          title="💥 Лучшие стрелки"
          icon={<BoltIcon className="w-5 h-5" />}
          performers={topPerformers.shots}
          isLoading={isLoadingPerformers}
          valueLabel="ударов"
          color="text-red-600"
        />

        {/* Лучшие пасующие */}
        <PerformerCard
          title="🎪 Лучшие пасующие"
          icon={<ChartBarIcon className="w-5 h-5" />}
          performers={topPerformers.passes}
          isLoading={isLoadingPerformers}
          valueLabel="передач"
          color="text-purple-600"
        />
      </div>

      {/* Сводная статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrophyIcon className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Голов забито</p>
                <p className="text-xl font-bold text-gray-900">
                  {(topPerformers.goals as any[])?.reduce((sum: number, p: any) => sum + p.metric_value, 0) || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <StarIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Ассистов</p>
                <p className="text-xl font-bold text-gray-900">
                  {(topPerformers.assists as any[])?.reduce((sum: number, p: any) => sum + p.metric_value, 0) || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <BoltIcon className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Ударов</p>
                <p className="text-xl font-bold text-gray-900">
                  {(topPerformers.shots as any[])?.reduce((sum: number, p: any) => sum + p.metric_value, 0) || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <ChartBarIcon className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Передач</p>
                <p className="text-xl font-bold text-gray-900">
                  {(topPerformers.passes as any[])?.reduce((sum: number, p: any) => sum + p.metric_value, 0) || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Детальная аналитика
            </Button>
            
            <Button variant="secondary" fullWidth disabled>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
              Поделиться отчётом
            </Button>
            
            <Button variant="secondary" fullWidth disabled>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Экспорт данных
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Информационная панель */}
      <Card>
        <CardContent>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  О статистике
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>
                    Рейтинги обновляются автоматически при загрузке новых данных. 
                    Показатели per90 рассчитываются на основе сыгранных минут. 
                    Для более точного анализа рекомендуется фильтровать игроков с минимальным количеством сыгранных минут.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};










