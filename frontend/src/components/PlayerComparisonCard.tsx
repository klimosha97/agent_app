/**
 * Карточка сравнения игрока — показывает перцентили по сезону и по турам.
 *
 * mode = 'season' (по умолчанию) — открывается на вкладке «За сезон»
 * mode = 'round'                — открывается на вкладке «За тур» с round baselines
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import { usePlayerNavigation } from '../App';
import {
  XMarkIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  TableCellsIcon,
  UserPlusIcon,
  EyeIcon,
  CheckCircleIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/outline';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tournamentId: number;
  roundNumber: number;
  playerId: number;
  /** 'season' = открыть сезонные перцентили, 'round' = открыть данные за тур */
  mode?: 'season' | 'round';
}

const ROUND_BASELINE_LABELS: Record<string, string> = {
  LEAGUE: 'Вся лига',
  TIER: 'По корзине',
  BENCHMARK: 'Эталон',
};

const BUCKET_LABELS: Record<string, string> = {
  core: 'Core',
  support: 'Support',
  risk: 'Risk',
};

const BUCKET_COLORS: Record<string, string> = {
  core: 'bg-blue-50 border-blue-200',
  support: 'bg-green-50 border-green-200',
  risk: 'bg-red-50 border-red-200',
};

function pctColor(pct: number | null): string {
  if (pct === null) return 'text-gray-400';
  if (pct >= 0.9) return 'text-emerald-700 font-bold';
  if (pct >= 0.8) return 'text-emerald-600 font-semibold';
  if (pct >= 0.7) return 'text-blue-600';
  if (pct >= 0.5) return 'text-gray-700';
  if (pct >= 0.3) return 'text-orange-600';
  return 'text-red-600';
}

function pctBar(pct: number | null): string {
  if (pct === null) return 'bg-gray-200';
  if (pct >= 0.9) return 'bg-emerald-500';
  if (pct >= 0.8) return 'bg-emerald-400';
  if (pct >= 0.7) return 'bg-blue-400';
  if (pct >= 0.5) return 'bg-yellow-400';
  if (pct >= 0.3) return 'bg-orange-400';
  return 'bg-red-400';
}

export const PlayerComparisonCard: React.FC<Props> = ({
  isOpen,
  onClose,
  tournamentId,
  roundNumber,
  playerId,
  mode = 'season',
}) => {
  const { setSelectedPlayerId } = usePlayerNavigation();
  // Level 1: season vs round
  const [periodTab, setPeriodTab] = useState<'season' | 'round'>(mode === 'round' ? 'round' : 'season');
  // Level 2: baseline within each period
  const [seasonBaseline, setSeasonBaseline] = useState<string>('SEASON');
  const [roundBaseline, setRoundBaseline] = useState<string>('LEAGUE');
  // Selected round for round view
  const [selectedRound, setSelectedRound] = useState<number>(roundNumber);
  const [showRisk, setShowRisk] = useState(true);

  // Reset when mode or player changes
  useEffect(() => {
    setPeriodTab(mode === 'round' ? 'round' : 'season');
    setSelectedRound(roundNumber);
    setSeasonBaseline('SEASON');
    setRoundBaseline('LEAGUE');
  }, [mode, playerId, roundNumber]);

  // Fetch season + round percentiles (unified endpoint)
  const { data: pctData, isLoading: pctLoading } = useQuery(
    ['player-percentiles-card', playerId, selectedRound],
    () => apiService.getPlayerPercentiles(playerId, selectedRound || undefined),
    { enabled: isOpen && playerId > 0 }
  );

  // Fetch round-level comparison (LEAGUE, TIER, BENCHMARK) for the selected round
  const { data: roundCompData, isLoading: roundCompLoading } = useQuery(
    ['player-comparison', tournamentId, selectedRound, playerId],
    () => apiService.getPlayerComparison(tournamentId, selectedRound, playerId),
    { enabled: isOpen && playerId > 0 && periodTab === 'round' && selectedRound > 0 }
  );

  // Fetch history
  const historyBaseline = periodTab === 'round' ? roundBaseline : seasonBaseline;
  const { data: historyData } = useQuery(
    ['player-history', tournamentId, playerId, historyBaseline],
    () => apiService.getPlayerHistory(tournamentId, playerId, historyBaseline),
    { enabled: isOpen && playerId > 0 }
  );

  // Fetch raw stats (TOTAL + PER90 for season)
  const { data: totalStatsData } = useQuery(
    ['player-stats-total', playerId],
    () => apiService.getPlayerStats(playerId, 'TOTAL', 'SEASON'),
    { enabled: isOpen && playerId > 0 }
  );
  const { data: per90StatsData } = useQuery(
    ['player-stats-per90', playerId],
    () => apiService.getPlayerStats(playerId, 'PER90', 'SEASON'),
    { enabled: isOpen && playerId > 0 }
  );

  const [statsView, setStatsView] = useState<'total' | 'per90'>('total');

  const queryClient = useQueryClient();
  const { data: watchStatus } = useQuery(
    ['watch-status', playerId],
    () => apiService.checkWatchedStatus(playerId),
    { enabled: isOpen && playerId > 0 }
  );

  const addToList = useMutation(
    (listType: 'MY' | 'TRACKED') => apiService.addWatchedPlayer(playerId, listType),
    { onSuccess: () => { queryClient.invalidateQueries(['watch-status', playerId]); queryClient.invalidateQueries(['watched-players']); } }
  );
  const removeFromList = useMutation(
    (listType: 'MY' | 'TRACKED') => apiService.removeWatchedPlayer(playerId, listType),
    { onSuccess: () => { queryClient.invalidateQueries(['watch-status', playerId]); queryClient.invalidateQueries(['watched-players']); } }
  );

  if (!isOpen) return null;

  const isLoading = pctLoading || (periodTab === 'round' && roundCompLoading);

  // Player info
  const player = pctData?.player || roundCompData?.player;
  const availableRounds: number[] = pctData?.available_rounds || [];
  const history = historyData?.data || [];
  const benchmarkLabel = pctData?.benchmark_label;

  // Season baseline options (from unified percentiles endpoint)
  const SEASON_BASELINE_MAP: Record<string, string> = { SEASON: 'season', TIER: 'season_tier', SEASON_BENCHMARK: 'season_benchmark' };
  const seasonBaselineOptions = [
    { key: 'SEASON', label: 'Вся лига', available: !!pctData?.season },
    { key: 'TIER', label: 'По корзине', available: !!pctData?.season_tier },
    { key: 'SEASON_BENCHMARK', label: 'Эталон', available: !!pctData?.season_benchmark },
  ];

  // Round baseline options (from round comparison endpoint)
  const availableRoundBaselines = roundCompData?.baselines ? Object.keys(roundCompData.baselines) : [];
  const roundBaselineOptions = [
    { key: 'LEAGUE', label: 'Вся лига', available: availableRoundBaselines.includes('LEAGUE') },
    { key: 'TIER', label: 'По корзине', available: availableRoundBaselines.includes('TIER') },
    { key: 'BENCHMARK', label: 'Эталон', available: availableRoundBaselines.includes('BENCHMARK') },
  ];

  // Determine current baseline data to show
  let currentData: any = null;

  if (periodTab === 'season') {
    const dataKey = SEASON_BASELINE_MAP[seasonBaseline] || 'season';
    currentData = pctData?.[dataKey] || null;
  } else {
    const baselines = roundCompData?.baselines || {};
    currentData = baselines[roundBaseline] || null;
  }

  const scores = currentData?.scores;

  // Group metrics by bucket
  const groupedMetrics: Record<string, any[]> = { core: [], support: [], risk: [] };
  if (currentData?.metrics) {
    for (const m of currentData.metrics) {
      if (groupedMetrics[m.bucket]) {
        groupedMetrics[m.bucket].push(m);
      }
    }
  }

  const activeBaselineOptions = periodTab === 'season' ? seasonBaselineOptions : roundBaselineOptions;
  const activeBaselineKey = periodTab === 'season' ? seasonBaseline : roundBaseline;
  const setActiveBaseline = periodTab === 'season' ? setSeasonBaseline : setRoundBaseline;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-8 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 mb-8 relative">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-2xl">
          <div>
            {player ? (
              <>
                <h2 className="text-xl font-bold text-gray-900">{player.full_name}</h2>
                <p className="text-sm text-gray-600">
                  {player.team_name} &middot; {player.position_name || player.position_code}
                </p>
              </>
            ) : (
              <h2 className="text-xl font-bold text-gray-900">Загрузка...</h2>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Мои футболисты */}
            <button
              onClick={() => watchStatus?.in_my ? removeFromList.mutate('MY') : addToList.mutate('MY')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                watchStatus?.in_my
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'
              }`}
              title={watchStatus?.in_my ? 'Убрать из моих' : 'Добавить в мои'}
            >
              {watchStatus?.in_my ? <CheckCircleIcon className="w-4 h-4" /> : <UserPlusIcon className="w-4 h-4" />}
              Мой
            </button>
            {/* Отслеживаемые */}
            <button
              onClick={() => watchStatus?.in_tracked ? removeFromList.mutate('TRACKED') : addToList.mutate('TRACKED')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                watchStatus?.in_tracked
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-emerald-50 hover:text-emerald-600'
              }`}
              title={watchStatus?.in_tracked ? 'Убрать из отслеживаемых' : 'Добавить в отслеживаемые'}
            >
              {watchStatus?.in_tracked ? <CheckCircleIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              Отслеж.
            </button>
            <button
              onClick={() => { onClose(); setSelectedPlayerId(playerId); }}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title="Открыть на весь экран"
            >
              <ArrowsPointingOutIcon className="w-5 h-5 text-gray-600" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <XMarkIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="animate-spin h-8 w-8 text-blue-500 mr-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-gray-500">Загрузка данных сравнения...</span>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* ========== Level 1: За сезон | За тур ========== */}
            <div className="flex items-center gap-3">
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setPeriodTab('season')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    periodTab === 'season'
                      ? 'bg-white text-blue-700 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  За сезон
                </button>
                <button
                  onClick={() => setPeriodTab('round')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    periodTab === 'round'
                      ? 'bg-white text-amber-700 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  За тур
                </button>
              </div>

              {/* Round selector */}
              {periodTab === 'round' && availableRounds.length > 0 && (
                <select
                  value={selectedRound}
                  onChange={(e) => setSelectedRound(Number(e.target.value))}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                >
                  {availableRounds.map((r) => (
                    <option key={r} value={r}>Тур {r}</option>
                  ))}
                </select>
              )}
              {periodTab === 'round' && availableRounds.length === 0 && (
                <span className="text-sm text-gray-400">Нет данных за туры</span>
              )}

              {/* Risk toggle */}
              <div className="ml-auto flex items-center gap-2">
                <label className="text-xs text-gray-500">Risk</label>
                <button
                  onClick={() => setShowRisk(!showRisk)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${showRisk ? 'bg-red-400' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showRisk ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>

            {/* ========== Level 2: Вся лига | По корзине | Эталон ========== */}
            <div className="flex items-center gap-2">
              {activeBaselineOptions.map(b => (
                <button
                  key={b.key}
                  onClick={() => b.available && setActiveBaseline(b.key)}
                  disabled={!b.available}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeBaselineKey === b.key
                      ? 'bg-indigo-600 text-white shadow'
                      : b.available
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  {b.label}
                  {!b.available && ' (нет)'}
                </button>
              ))}
              {activeBaselineKey === 'SEASON_BENCHMARK' && benchmarkLabel && (
                <span className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-2 py-1">
                  {benchmarkLabel}
                </span>
              )}
            </div>

            {/* ========== Content ========== */}
            {currentData ? (
              <>
                {/* Scores summary */}
                {scores && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <ScoreCard label="Core" value={scores.core_score_adj} />
                    <ScoreCard label="Support" value={scores.support_score_adj} />
                    <ScoreCard label="Total" value={scores.total_score} highlight />
                    <ScoreCard label="Good%" value={scores.good_share_core} suffix="%" />
                  </div>
                )}

                {/* Coverage & flags */}
                {scores && (
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="text-gray-500">
                      Core coverage: <strong>{((scores.core_coverage || 0) * 100).toFixed(0)}%</strong>
                    </span>
                    <span className="text-gray-500">
                      Support coverage: <strong>{((scores.support_coverage || 0) * 100).toFixed(0)}%</strong>
                    </span>
                    {scores.insufficient_data && (
                      <span className="flex items-center text-amber-600 font-medium">
                        <ExclamationTriangleIcon className="w-4 h-4 mr-1" />
                        Недостаточно данных
                      </span>
                    )}
                    {scores.insufficient_minutes && (
                      <span className="flex items-center text-red-600 font-medium">
                        <ExclamationTriangleIcon className="w-4 h-4 mr-1" />
                        Без оценки (менее 200 мин)
                      </span>
                    )}
                  </div>
                )}

                {/* Risk flags */}
                {showRisk && scores?.risk_flags && Object.keys(scores.risk_flags).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(scores.risk_flags).map(([key, val]) => (
                      <span key={key} className="inline-flex items-center px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                        {key}: {String(val)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Metrics by bucket */}
                {(['core', 'support', ...(showRisk ? ['risk'] : [])] as string[]).map((bucket) => {
                  const metrics = groupedMetrics[bucket] || [];
                  if (metrics.length === 0) return null;
                  return (
                    <div key={bucket} className={`rounded-lg border p-4 ${BUCKET_COLORS[bucket]}`}>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                        {BUCKET_LABELS[bucket]} ({metrics.length})
                      </h4>
                      <div className="space-y-2">
                        {metrics.map((m: any) => (
                          <div key={m.metric_code} className="flex items-center gap-3">
                            <span className="w-40 text-xs text-gray-600 truncate" title={m.display_name || m.metric_code}>
                              {m.display_name || m.metric_code}
                            </span>
                            <div className="flex-1 h-3 bg-white/60 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${pctBar(m.percentile)}`}
                                style={{ width: `${(m.percentile || 0) * 100}%` }}
                              />
                            </div>
                            <span className={`w-12 text-right text-xs font-mono ${pctColor(m.percentile)}`}>
                              {m.percentile !== null && m.percentile !== undefined ? `${(m.percentile * 100).toFixed(0)}p` : '—'}
                            </span>
                            <span className="w-14 text-right text-xs text-gray-500 font-mono">
                              {m.value !== null && m.value !== undefined
                                ? (m.data_type === 'PERCENTAGE' ? `${(m.value * 100).toFixed(1)}%` : Number(m.value).toFixed(2))
                                : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* History sparkline */}
                {history.length > 1 && (
                  <div className="border rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                      <ChartBarIcon className="w-4 h-4 mr-1" />
                      История по турам ({historyBaseline})
                    </h4>
                    <div className="flex items-end gap-1 h-20">
                      {history.map((h: any, i: number) => {
                        const val = h.total_score || 0;
                        const maxVal = Math.max(...history.map((x: any) => x.total_score || 0), 0.01);
                        const heightPct = (val / maxVal) * 100;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`Тур ${h.round_number}: ${(val * 100).toFixed(0)}p`}>
                            <div className="w-full bg-gray-100 rounded-t relative" style={{ height: '80px' }}>
                              <div
                                className={`absolute bottom-0 w-full rounded-t transition-all ${val >= 0.8 ? 'bg-emerald-400' : val >= 0.6 ? 'bg-blue-400' : 'bg-gray-400'}`}
                                style={{ height: `${heightPct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-500">{h.round_number}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Raw stats section */}
                <RawStatsSection
                  totalStats={totalStatsData?.stats_detailed}
                  per90Stats={per90StatsData?.stats_detailed}
                  statsView={statsView}
                  setStatsView={setStatsView}
                />
              </>
            ) : (
              <>
                <div className="text-center py-6 text-gray-500">
                  {activeBaselineKey.includes('TIER')
                    ? 'Нет данных по корзине. Настройте корзины и пересчитайте анализ.'
                    : activeBaselineKey.includes('BENCHMARK')
                    ? 'Нет данных по эталону. Загрузите эталон и нажмите «Пересчитать».'
                    : periodTab === 'season'
                    ? 'Нет сезонных данных. Загрузите PER90 данные и пересчитайте анализ.'
                    : 'Нет данных за этот тур. Выберите другой тур.'}
                </div>
                {/* Still show raw stats even without percentile data */}
                <RawStatsSection
                  totalStats={totalStatsData?.stats_detailed}
                  per90Stats={per90StatsData?.stats_detailed}
                  statsView={statsView}
                  setStatsView={setStatsView}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function ScoreCard({ label, value, highlight, suffix }: { label: string; value: number | null; highlight?: boolean; suffix?: string }) {
  const displayVal = value !== null && value !== undefined ? (suffix === '%' ? (value * 100).toFixed(0) + '%' : (value * 100).toFixed(0) + 'p') : '—';
  return (
    <div className={`rounded-lg p-3 text-center ${highlight ? 'bg-blue-100 border border-blue-300' : 'bg-gray-50 border border-gray-200'}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>{displayVal}</div>
    </div>
  );
}

const STAT_CATEGORIES: Record<string, string> = {
  scoring: 'Голы и удары',
  passing: 'Передачи',
  dribbling: 'Обводки',
  duels: 'Единоборства',
  defense: 'Защита',
  discipline: 'Дисциплина',
  goalkeeping: 'Вратарские',
};

function formatStatValue(value: number | null, dataType: string): string {
  if (value === null || value === undefined) return '—';
  if (dataType === 'PERCENTAGE') return `${value.toFixed(1)}%`;
  if (dataType === 'FLOAT') return value.toFixed(2);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

function RawStatsSection({
  totalStats,
  per90Stats,
  statsView,
  setStatsView,
}: {
  totalStats?: Array<{ code: string; value: number | null; display_name: string; data_type: string; category: string; is_key_metric: boolean }>;
  per90Stats?: Array<{ code: string; value: number | null; display_name: string; data_type: string; category: string; is_key_metric: boolean }>;
  statsView: 'total' | 'per90';
  setStatsView: (v: 'total' | 'per90') => void;
}) {
  const stats = statsView === 'total' ? totalStats : per90Stats;
  if (!stats || stats.length === 0) return null;

  const grouped: Record<string, typeof stats> = {};
  for (const s of stats) {
    const cat = s.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center">
          <TableCellsIcon className="w-4 h-4 mr-1.5" />
          Статистика за сезон
        </h4>
        <div className="flex bg-gray-200 rounded-md p-0.5">
          <button
            onClick={() => setStatsView('total')}
            className={`px-3 py-1 text-xs font-medium rounded transition-all ${statsView === 'total' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Всего
          </button>
          <button
            onClick={() => setStatsView('per90')}
            className={`px-3 py-1 text-xs font-medium rounded transition-all ${statsView === 'per90' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            За 90 мин
          </button>
        </div>
      </div>
      <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <div className="px-4 py-1.5 bg-gray-50/60">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                {STAT_CATEGORIES[cat] || cat}
              </span>
            </div>
            {items.map((s) => (
              <div key={s.code} className="flex items-center justify-between px-4 py-1.5 hover:bg-gray-50 transition-colors">
                <span className="text-sm text-gray-700">{s.display_name}</span>
                <span className="text-sm font-mono font-medium text-gray-900 tabular-nums">
                  {formatStatValue(s.value, s.data_type)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default PlayerComparisonCard;
