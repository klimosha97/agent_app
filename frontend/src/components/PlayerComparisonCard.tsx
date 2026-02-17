/**
 * Карточка сравнения игрока — показывает перцентили по сезону и по турам.
 *
 * mode = 'season' (по умолчанию) — открывается на вкладке «За сезон»
 * mode = 'round'                — открывается на вкладке «За тур» с round baselines
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { apiService } from '../services/api';
import {
  XMarkIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
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
  // Top-level view: 'season', 'season_benchmark', or 'round'
  const [activeView, setActiveView] = useState<'season' | 'season_benchmark' | 'round'>(mode);
  // Round-level sub-baseline
  const [activeRoundBaseline, setActiveRoundBaseline] = useState<string>('LEAGUE');
  // Selected round for round view
  const [selectedRound, setSelectedRound] = useState<number>(roundNumber);
  const [showRisk, setShowRisk] = useState(true);

  // Reset when mode or player changes
  useEffect(() => {
    setActiveView(mode);
    setSelectedRound(roundNumber);
    setActiveRoundBaseline('LEAGUE');
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
    { enabled: isOpen && playerId > 0 && activeView === 'round' && selectedRound > 0 }
  );

  // Fetch history
  const historyBaseline = activeView === 'round' ? activeRoundBaseline : (activeView === 'season_benchmark' ? 'SEASON_BENCHMARK' : 'SEASON');
  const { data: historyData } = useQuery(
    ['player-history', tournamentId, playerId, historyBaseline],
    () => apiService.getPlayerHistory(tournamentId, playerId, historyBaseline),
    { enabled: isOpen && playerId > 0 }
  );

  if (!isOpen) return null;

  const isLoading = pctLoading || (activeView === 'round' && roundCompLoading);

  // Player info
  const player = pctData?.player || roundCompData?.player;
  const availableRounds: number[] = pctData?.available_rounds || [];
  const history = historyData?.data || [];
  const hasBenchmark = !!pctData?.season_benchmark;
  const benchmarkLabel = pctData?.benchmark_label;

  // Determine current baseline data to show
  let currentData: any = null;

  if (activeView === 'season') {
    currentData = pctData?.season || null;
  } else if (activeView === 'season_benchmark') {
    currentData = pctData?.season_benchmark || null;
  } else {
    // Round view — use roundCompData baselines
    const baselines = roundCompData?.baselines || {};
    currentData = baselines[activeRoundBaseline] || null;
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

  const roundBaselines = roundCompData?.baselines ? Object.keys(roundCompData.baselines) : [];

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
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-600" />
          </button>
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
            {/* ========== Top-level tabs: За сезон | Эталон | За тур ========== */}
            <div className="flex items-center gap-3">
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setActiveView('season')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    activeView === 'season'
                      ? 'bg-white text-blue-700 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  За сезон
                </button>
                {hasBenchmark && (
                  <button
                    onClick={() => setActiveView('season_benchmark')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                      activeView === 'season_benchmark'
                        ? 'bg-white text-indigo-700 shadow'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    title={benchmarkLabel ? `Эталон: ${benchmarkLabel}` : 'Эталон'}
                  >
                    Эталон
                  </button>
                )}
                <button
                  onClick={() => setActiveView('round')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    activeView === 'round'
                      ? 'bg-white text-blue-700 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  За тур
                </button>
              </div>

              {/* Round selector (visible when round view active) */}
              {activeView === 'round' && availableRounds.length > 0 && (
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
              {activeView === 'round' && availableRounds.length === 0 && (
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

            {/* Benchmark label */}
            {activeView === 'season_benchmark' && benchmarkLabel && (
              <div className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
                <span className="font-medium">Сравнение с эталоном:</span> {benchmarkLabel}
              </div>
            )}

            {/* ========== Round sub-baselines (LEAGUE / TIER / BENCHMARK) ========== */}
            {activeView === 'round' && (
              <div className="flex gap-2">
                {(['LEAGUE', 'TIER', 'BENCHMARK'] as const).map((bk) => {
                  const available = roundBaselines.includes(bk);
                  return (
                    <button
                      key={bk}
                      onClick={() => available && setActiveRoundBaseline(bk)}
                      disabled={!available}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        activeRoundBaseline === bk
                          ? 'bg-blue-600 text-white shadow'
                          : available
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                      }`}
                    >
                      {ROUND_BASELINE_LABELS[bk]}
                      {!available && ' (нет)'}
                    </button>
                  );
                })}
              </div>
            )}

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
              </>
            ) : (
              <div className="text-center py-10 text-gray-500">
                {activeView === 'season'
                  ? 'Нет сезонных данных. Загрузите PER90 данные и пересчитайте анализ.'
                  : activeView === 'season_benchmark'
                  ? 'Нет данных по эталону. Загрузите эталон и нажмите «Пересчитать».'
                  : 'Нет данных за этот тур. Выберите другой тур.'}
              </div>
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

export default PlayerComparisonCard;
