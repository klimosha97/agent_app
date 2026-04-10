/**
 * Страница профиля игрока
 * Показывает полную статистику игрока с возможностью переключения:
 * - TOTAL / PER90
 * - SEASON / ROUND (выбор конкретного тура)
 * + Раздел перцентилей по позиции (сезон + тур)
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { 
  ArrowLeftIcon, 
  UserIcon,
  MapPinIcon,
  CalendarIcon,
  TrophyIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlagIcon,
  ChartBarIcon,
  UserPlusIcon,
  EyeIcon,
  CheckCircleIcon,
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
  const queryClient = useQueryClient();
  const [sliceType, setSliceType] = useState<'TOTAL' | 'PER90'>('TOTAL');
  const [periodType, setPeriodType] = useState<'SEASON' | 'ROUND'>('SEASON');
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [pctRound, setPctRound] = useState<number | undefined>(undefined);

  const { data: playerInfo, isLoading: isLoadingInfo } = useQuery(
    ['player-info', playerId],
    () => apiService.getPlayerInfo(playerId),
    { enabled: !!playerId }
  );

  const { data: watchStatus } = useQuery(
    ['watch-status', playerId],
    () => apiService.checkWatchedStatus(playerId),
    { enabled: !!playerId }
  );

  const addToList = useMutation(
    (listType: 'MY' | 'TRACKED') => apiService.addWatchedPlayer(playerId, listType),
    { onSuccess: () => { queryClient.invalidateQueries(['watch-status', playerId]); queryClient.invalidateQueries(['watched-players']); } }
  );
  const removeFromList = useMutation(
    (listType: 'MY' | 'TRACKED') => apiService.removeWatchedPlayer(playerId, listType),
    { onSuccess: () => { queryClient.invalidateQueries(['watch-status', playerId]); queryClient.invalidateQueries(['watched-players']); } }
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

  // Загружаем перцентили по позиции
  const { data: pctData, isLoading: isLoadingPct } = useQuery(
    ['player-percentiles', playerId, pctRound],
    () => apiService.getPlayerPercentiles(playerId, pctRound),
    { enabled: !!playerId, keepPreviousData: true }
  );

  // Устанавливаем последний тур по умолчанию при загрузке
  useEffect(() => {
    if (availableSlices?.slices?.rounds?.length && selectedRound === null) {
      setSelectedRound(availableSlices.slices.rounds[0]);
    }
  }, [availableSlices, selectedRound]);

  // Устанавливаем последний доступный тур для перцентилей
  useEffect(() => {
    if (pctData?.available_rounds?.length && pctRound === undefined) {
      setPctRound(pctData.available_rounds[0]); // первый = последний (DESC)
    }
  }, [pctData, pctRound]);

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
                  <Badge variant="blue" size="lg" className="bg-white/20 text-white border-white/30">
                    {player.position_code}
                  </Badge>
                  <span className="text-sm text-blue-200">{player.position_name}</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => watchStatus?.in_my ? removeFromList.mutate('MY') : addToList.mutate('MY')}
                    disabled={addToList.isLoading || removeFromList.isLoading}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      watchStatus?.in_my
                        ? 'bg-white/30 text-white hover:bg-white/40'
                        : 'bg-white/10 text-blue-100 hover:bg-white/20 hover:text-white'
                    }`}
                    title={watchStatus?.in_my ? 'Убрать из моих' : 'Добавить в мои'}
                  >
                    {watchStatus?.in_my ? <CheckCircleIcon className="w-4 h-4" /> : <UserPlusIcon className="w-4 h-4" />}
                    {watchStatus?.in_my ? 'Мой игрок' : 'В мои'}
                  </button>
                  <button
                    onClick={() => watchStatus?.in_tracked ? removeFromList.mutate('TRACKED') : addToList.mutate('TRACKED')}
                    disabled={addToList.isLoading || removeFromList.isLoading}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      watchStatus?.in_tracked
                        ? 'bg-white/30 text-white hover:bg-white/40'
                        : 'bg-white/10 text-blue-100 hover:bg-white/20 hover:text-white'
                    }`}
                    title={watchStatus?.in_tracked ? 'Убрать из отслеживаемых' : 'Добавить в отслеживаемые'}
                  >
                    {watchStatus?.in_tracked ? <CheckCircleIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    {watchStatus?.in_tracked ? 'Отслеживается' : 'Отслеживать'}
                  </button>
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

      {/* ===== Перцентили по позиции (сверху!) ===== */}
      <PercentileSection
        pctData={pctData}
        isLoading={isLoadingPct}
        pctRound={pctRound}
        setPctRound={setPctRound}
        formatValue={formatValue}
      />

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


// =====================================================================
// Компонент: визуализация перцентилей по позиции
// =====================================================================

const BUCKET_LABELS: Record<string, string> = { core: 'Core', support: 'Support', risk: 'Risk' };
const BUCKET_COLORS: Record<string, { bar: string; bg: string; text: string; header: string }> = {
  core: { bar: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', header: 'bg-blue-50 border-blue-200' },
  support: { bar: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', header: 'bg-emerald-50 border-emerald-200' },
  risk: { bar: 'bg-orange-400', bg: 'bg-orange-50', text: 'text-orange-700', header: 'bg-orange-50 border-orange-200' },
};

function pctColor(p: number | null): string {
  if (p === null || p === undefined) return 'text-gray-400';
  if (p >= 0.90) return 'text-emerald-600 font-bold';
  if (p >= 0.80) return 'text-emerald-600';
  if (p >= 0.60) return 'text-blue-600';
  if (p >= 0.40) return 'text-gray-600';
  return 'text-red-500';
}

function pctBarColor(p: number | null): string {
  if (p === null || p === undefined) return 'bg-gray-200';
  if (p >= 0.90) return 'bg-emerald-500';
  if (p >= 0.80) return 'bg-emerald-400';
  if (p >= 0.60) return 'bg-blue-400';
  if (p >= 0.40) return 'bg-yellow-400';
  return 'bg-red-400';
}

interface PercentileSectionProps {
  pctData: any;
  isLoading: boolean;
  pctRound: number | undefined;
  setPctRound: (r: number | undefined) => void;
  formatValue: (v: number | null, dt: string) => string;
}

const SEASON_BASELINES = [
  { key: 'season', label: 'Вся лига' },
  { key: 'season_tier', label: 'По корзине' },
  { key: 'season_benchmark', label: 'Эталон' },
];
const ROUND_BASELINES = [
  { key: 'round', label: 'Вся лига' },
  { key: 'round_tier', label: 'По корзине' },
  { key: 'round_benchmark', label: 'Эталон' },
];

const PercentileSection: React.FC<PercentileSectionProps> = ({
  pctData, isLoading, pctRound, setPctRound, formatValue,
}) => {
  const [activeTab, setActiveTab] = useState<'season' | 'round'>('season');
  const [seasonBaseline, setSeasonBaseline] = useState('season');
  const [roundBaseline, setRoundBaseline] = useState('round');

  if (!pctData && !isLoading) return null;

  const availableRounds: number[] = pctData?.available_rounds || [];
  const posInfo = pctData?.player;

  const currentBaselineKey = activeTab === 'season' ? seasonBaseline : roundBaseline;
  const currentBaseline = pctData?.[currentBaselineKey];
  const baselineOptions = activeTab === 'season' ? SEASON_BASELINES : ROUND_BASELINES;
  const activeBaselineKey = activeTab === 'season' ? seasonBaseline : roundBaseline;
  const setActiveBaseline = activeTab === 'season' ? setSeasonBaseline : setRoundBaseline;

  // Group metrics by bucket
  const metricsByBucket: Record<string, any[]> = { core: [], support: [], risk: [] };
  if (currentBaseline?.metrics) {
    currentBaseline.metrics.forEach((m: any) => {
      if (metricsByBucket[m.bucket]) {
        metricsByBucket[m.bucket].push(m);
      }
    });
  }

  const scores = currentBaseline?.scores;

  return (
    <Card className="border-purple-200">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center">
              <ChartBarIcon className="w-5 h-5 mr-2 text-purple-500" />
              Перцентили по позиции
              {posInfo && (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700">
                  {posInfo.position_code}
                </span>
              )}
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              {activeTab === 'season'
                ? `PER90 за сезон — ${baselineOptions.find(b => b.key === activeBaselineKey)?.label || ''}`
                : `Тур ${pctRound} — ${baselineOptions.find(b => b.key === activeBaselineKey)?.label || ''}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Tabs: Season / Round */}
            <div className="flex bg-white rounded-lg p-0.5 shadow-sm border">
              <button
                onClick={() => setActiveTab('season')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  activeTab === 'season' ? 'bg-purple-500 text-white shadow' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                За сезон
              </button>
              <button
                onClick={() => { setActiveTab('round'); if (!pctRound && availableRounds.length) setPctRound(availableRounds[0]); }}
                disabled={availableRounds.length === 0}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  activeTab === 'round' ? 'bg-amber-500 text-white shadow' : 'text-gray-600 hover:text-gray-900'
                } disabled:opacity-40`}
              >
                За тур
              </button>
            </div>

            {/* Baseline selector */}
            <div className="flex bg-white rounded-lg p-0.5 shadow-sm border">
              {baselineOptions.map(b => {
                const isAvailable = !!pctData?.[b.key];
                return (
                  <button
                    key={b.key}
                    onClick={() => setActiveBaseline(b.key)}
                    disabled={!isAvailable}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                      activeBaselineKey === b.key
                        ? 'bg-indigo-500 text-white shadow'
                        : isAvailable
                          ? 'text-gray-600 hover:text-gray-900'
                          : 'text-gray-300 cursor-not-allowed'
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>

            {/* Round selector */}
            {activeTab === 'round' && availableRounds.length > 0 && (
              <select
                value={pctRound || ''}
                onChange={(e) => setPctRound(Number(e.target.value))}
                className="pl-3 pr-8 py-1.5 border border-amber-300 rounded-lg bg-amber-50 text-amber-800 font-bold text-xs focus:ring-2 focus:ring-amber-500 cursor-pointer"
              >
                {availableRounds.map((r) => (
                  <option key={r} value={r}>Тур {r}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <svg className="animate-spin h-6 w-6 text-purple-500 mr-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Загрузка перцентилей...
          </div>
        ) : !currentBaseline ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-sm">
              {activeBaselineKey.includes('tier')
                ? 'Нет данных по корзине. Настройте корзины и пересчитайте анализ.'
                : activeBaselineKey.includes('benchmark')
                  ? 'Нет данных по эталону. Настройте эталонный сезон и пересчитайте анализ.'
                  : activeTab === 'season'
                    ? 'Нет сезонных перцентилей. Загрузите PER90 данные и пересчитайте анализ.'
                    : 'Нет данных за этот тур. Выберите другой тур или загрузите данные.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Insufficient minutes warning */}
            {scores?.insufficient_minutes && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                </svg>
                Без оценки — менее 200 минут за сезон. Перцентили отображены, но не учитываются в рейтингах.
              </div>
            )}
            {/* Score summary */}
            {scores && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ScoreTile label="Core" value={scores.core_score_adj} color="blue" />
                <ScoreTile label="Support" value={scores.support_score_adj} color="emerald" />
                <ScoreTile label="Total" value={scores.total_score} color="purple" />
                <ScoreTile label="Good%" value={scores.good_share_core} color="amber" />
              </div>
            )}

            {/* Metrics by bucket */}
            {['core', 'support', 'risk'].map((bucket) => {
              const items = metricsByBucket[bucket];
              if (!items || items.length === 0) return null;
              const colors = BUCKET_COLORS[bucket];

              return (
                <div key={bucket}>
                  <h3 className={`text-sm font-semibold mb-2 px-2 py-1 rounded ${colors.header} border`}>
                    {BUCKET_LABELS[bucket]} ({items.length} метрик)
                  </h3>
                  <div className="space-y-1">
                    {items.map((m: any) => (
                      <div key={m.metric_code} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded transition-colors">
                        {/* Metric name */}
                        <span className="text-sm text-gray-700 w-44 flex-shrink-0 truncate" title={m.display_name}>
                          {m.display_name}
                        </span>
                        {/* Value */}
                        <span className="text-sm tabular-nums text-gray-500 w-16 text-right flex-shrink-0">
                          {m.value !== null && m.value !== undefined
                            ? formatValue(m.value, m.data_type || 'FLOAT')
                            : '—'}
                        </span>
                        {/* Percentile bar */}
                        <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden relative">
                          {m.percentile !== null && m.percentile !== undefined ? (
                            <div
                              className={`h-full rounded-full transition-all ${pctBarColor(m.percentile)}`}
                              style={{ width: `${Math.max(2, m.percentile * 100)}%` }}
                            />
                          ) : (
                            <div className="h-full w-0" />
                          )}
                          {/* 80% marker */}
                          <div className="absolute top-0 bottom-0 left-[80%] w-px bg-gray-300" />
                        </div>
                        {/* Percentile number */}
                        <span className={`text-sm font-medium tabular-nums w-10 text-right flex-shrink-0 ${pctColor(m.percentile)}`}>
                          {m.percentile !== null && m.percentile !== undefined
                            ? Math.round(m.percentile * 100)
                            : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Coverage info */}
            {scores && (
              <div className="flex gap-4 text-xs text-gray-400 pt-2 border-t">
                <span>Core coverage: {Math.round((scores.core_coverage || 0) * 100)}%</span>
                <span>Support coverage: {Math.round((scores.support_coverage || 0) * 100)}%</span>
                {scores.insufficient_data && (
                  <span className="text-orange-500 font-medium">⚠ Недостаточно данных</span>
                )}
                {scores.insufficient_minutes && (
                  <span className="text-red-500 font-medium">⚠ Без оценки (менее 200 мин)</span>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};


// Score tile для суммарных показателей
const ScoreTile: React.FC<{ label: string; value: number | null; color: string }> = ({ label, value, color }) => {
  const v = value !== null && value !== undefined ? Math.round(value * 100) : null;
  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-200' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`rounded-lg ${c.bg} ring-1 ${c.ring} px-3 py-2 text-center`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${c.text} tabular-nums`}>
        {v !== null ? v : '—'}
      </div>
    </div>
  );
};
