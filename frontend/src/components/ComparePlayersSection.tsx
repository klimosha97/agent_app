import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from 'react-query';
import { apiService } from '../services/api';
import { MagnifyingGlassIcon, XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const SLOT_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'];
const SLOT_BG     = ['bg-blue-50', 'bg-red-50', 'bg-emerald-50', 'bg-amber-50'];
const SLOT_BORDER = ['border-blue-300', 'border-red-300', 'border-emerald-300', 'border-amber-300'];
const SLOT_TEXT   = ['text-blue-700', 'text-red-700', 'text-emerald-700', 'text-amber-700'];
const MAX_SLOTS = 4;

interface Slot {
  playerId: number;
  playerName: string;
  teamName: string;
  tournamentId: number;
  tournamentName: string;
  positionCode: string;
  seasons: string[];
  selectedSeason: string;
  selectedRound: number | null;
}

interface Props {
  tournamentId?: number;
  initialPlayerId?: number | null;
  initialPlayerName?: string;
}

function usePctQuery(slot: Slot | null) {
  return useQuery(
    ['compare-pct', slot?.playerId, slot?.selectedSeason, slot?.selectedRound],
    () => apiService.getPlayerPercentiles(slot!.playerId, slot!.selectedRound || undefined, slot!.selectedSeason || undefined),
    { enabled: !!slot, staleTime: 30000 }
  );
}

function useHistoryQuery(slot: Slot | null) {
  return useQuery(
    ['compare-history', slot?.playerId, slot?.tournamentId],
    () => apiService.getPlayerMetricsHistory(slot!.playerId, slot!.tournamentId),
    { enabled: !!slot, staleTime: 60000 }
  );
}

export const ComparePlayersSection: React.FC<Props> = ({ tournamentId, initialPlayerId, initialPlayerName }) => {
  const [slots, setSlots] = useState<(Slot | null)[]>(Array(MAX_SLOTS).fill(null));
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [addingToSlot, setAddingToSlot] = useState<number>(0);
  const [chartMetric, setChartMetric] = useState('total_score');
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialHandled = useRef(false);

  const pct0 = usePctQuery(slots[0]);
  const pct1 = usePctQuery(slots[1]);
  const pct2 = usePctQuery(slots[2]);
  const pct3 = usePctQuery(slots[3]);
  const pctQueries = [pct0, pct1, pct2, pct3];

  const hist0 = useHistoryQuery(slots[0]);
  const hist1 = useHistoryQuery(slots[1]);
  const hist2 = useHistoryQuery(slots[2]);
  const hist3 = useHistoryQuery(slots[3]);
  const histQueries = [hist0, hist1, hist2, hist3];

  useEffect(() => {
    if (initialPlayerId && !initialHandled.current) {
      initialHandled.current = true;
      apiService.searchPlayers(initialPlayerName || '', tournamentId).then(results => {
        const match = results.find((r: any) => r.player_id === initialPlayerId);
        if (match) {
          handleSelectPlayer(match, 0);
        }
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPlayerId]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await apiService.searchPlayers(q);
      setSearchResults(res);
    } catch { setSearchResults([]); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, doSearch]);

  const handleSelectPlayer = (player: any, slotIdx: number) => {
    const season = player.seasons?.length ? player.seasons[player.seasons.length - 1] : '';
    const newSlot: Slot = {
      playerId: player.player_id,
      playerName: player.full_name,
      teamName: player.team_name,
      tournamentId: player.tournament_id,
      tournamentName: player.tournament_name,
      positionCode: player.position_code || '',
      seasons: player.seasons || [],
      selectedSeason: season,
      selectedRound: null,
    };
    setSlots(prev => { const n = [...prev]; n[slotIdx] = newSlot; return n; });
    setShowSearch(false);
    setSearchQuery('');
  };

  const removeSlot = (idx: number) => {
    setSlots(prev => { const n = [...prev]; n[idx] = null; return n; });
  };

  const updateSlot = (idx: number, patch: Partial<Slot>) => {
    setSlots(prev => {
      const n = [...prev];
      if (n[idx]) n[idx] = { ...n[idx]!, ...patch };
      return n;
    });
  };

  const openSearchForSlot = (idx: number) => {
    setAddingToSlot(idx);
    setShowSearch(true);
    setSearchQuery('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const activeSlots = useMemo(() =>
    slots.map((s, i) => ({ slot: s, index: i })).filter(x => x.slot !== null) as { slot: Slot; index: number }[],
    [slots]
  );
  const firstEmptySlot = slots.findIndex(s => s === null);

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div ref={searchRef} className="relative">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
            placeholder="Поиск игрока для сравнения..."
            className="flex-1 outline-none text-sm bg-transparent"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        {showSearch && searchResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
            {searchResults.map((p: any) => (
              <button
                key={p.player_id}
                onClick={() => handleSelectPlayer(p, addingToSlot >= 0 ? addingToSlot : (firstEmptySlot >= 0 ? firstEmptySlot : 0))}
                className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center justify-between text-sm border-b border-gray-50 last:border-0"
              >
                <div>
                  <span className="font-medium text-gray-900">{p.full_name}</span>
                  <span className="text-gray-500 ml-2">{p.team_name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{p.position_code}</span>
                  <span>{p.tournament_name}</span>
                  <span>{p.seasons?.join(', ')}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Slots */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {slots.map((slot, idx) => (
          <SlotCard
            key={idx}
            slot={slot}
            index={idx}
            pctData={pctQueries[idx].data}
            onRemove={() => removeSlot(idx)}
            onUpdate={patch => updateSlot(idx, patch)}
            onAdd={() => openSearchForSlot(idx)}
          />
        ))}
      </div>

      {/* Comparison content */}
      {activeSlots.length >= 1 && (
        <>
          <CompareScores slots={activeSlots} pctQueries={pctQueries} />
          <CompareMetrics slots={activeSlots} pctQueries={pctQueries} />
          <ProgressionChart slots={activeSlots} histQueries={histQueries} pctQueries={pctQueries} chartMetric={chartMetric} setChartMetric={setChartMetric} />
        </>
      )}

      {activeSlots.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <MagnifyingGlassIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Добавьте игроков для сравнения</p>
          <p className="text-sm mt-1">Используйте поиск или правый клик на игроке в таблице</p>
        </div>
      )}
    </div>
  );
};

/* ========== Slot Card ========== */
interface SlotCardProps {
  slot: Slot | null;
  index: number;
  pctData: any;
  onRemove: () => void;
  onUpdate: (patch: Partial<Slot>) => void;
  onAdd: () => void;
}

const SlotCard: React.FC<SlotCardProps> = ({ slot, index, pctData, onRemove, onUpdate, onAdd }) => {
  const availableRounds = pctData?.available_rounds || [];

  if (!slot) {
    return (
      <button
        onClick={onAdd}
        className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:border-blue-400 hover:bg-blue-50/50 transition-colors min-h-[100px]"
      >
        <PlusIcon className="h-6 w-6 text-gray-400" />
        <span className="text-xs text-gray-400">Добавить</span>
      </button>
    );
  }

  return (
    <div className={`${SLOT_BG[index]} border ${SLOT_BORDER[index]} rounded-xl p-3 relative min-h-[100px]`}>
      <button onClick={onRemove} className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
        <XMarkIcon className="h-4 w-4" />
      </button>
      <div className={`font-semibold text-sm ${SLOT_TEXT[index]} truncate pr-6`}>{slot.playerName}</div>
      <div className="text-xs text-gray-500 truncate">{slot.teamName}</div>
      <div className="text-xs text-gray-400 mt-0.5">{slot.tournamentName} &middot; {slot.positionCode}</div>
      <div className="flex gap-1.5 mt-2">
        <select
          value={slot.selectedSeason}
          onChange={e => onUpdate({ selectedSeason: e.target.value, selectedRound: null })}
          className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white flex-1"
        >
          {slot.seasons.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={slot.selectedRound ?? ''}
          onChange={e => onUpdate({ selectedRound: e.target.value ? parseInt(e.target.value) : null })}
          className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white flex-1"
        >
          <option value="">Сезон</option>
          {availableRounds.map((r: number) => <option key={r} value={r}>Тур {r}</option>)}
        </select>
      </div>
    </div>
  );
};

/* ========== Scores Comparison ========== */
const CompareScores: React.FC<{ slots: { slot: Slot; index: number }[]; pctQueries: any[] }> = ({ slots, pctQueries }) => {
  const getScores = (idx: number) => {
    const d = pctQueries[idx]?.data;
    if (!d) return null;
    if (d.round?.scores) return d.round.scores;
    if (d.season?.scores) return d.season.scores;
    return null;
  };

  const scoreKeys = [
    { key: 'core_score_adj', label: 'Core' },
    { key: 'support_score_adj', label: 'Support' },
    { key: 'total_score', label: 'Total' },
    { key: 'good_share_core', label: 'Good%' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Скоры</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {scoreKeys.map(sk => (
          <div key={sk.key}>
            <div className="text-xs text-gray-500 mb-2 text-center">{sk.label}</div>
            <div className="space-y-1.5">
              {slots.map(({ slot, index }) => {
                const scores = getScores(index);
                const val = scores?.[sk.key];
                const pct = val != null ? Math.round(val * 100) : 0;
                return (
                  <div key={index} className="flex items-center gap-2">
                    <div className="w-16 text-xs text-right truncate" style={{ color: SLOT_COLORS[index] }}>
                      {slot.playerName.split(' ').pop()}
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 relative overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: SLOT_COLORS[index] }}
                      />
                    </div>
                    <span className="text-xs font-mono w-10 text-right text-gray-600">
                      {val != null ? (sk.key === 'good_share_core' ? `${Math.round(val * 100)}%` : val.toFixed(2)) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ========== Metrics Comparison ========== */
const CompareMetrics: React.FC<{ slots: { slot: Slot; index: number }[]; pctQueries: any[] }> = ({ slots, pctQueries }) => {
  const getMetrics = (idx: number): any[] => {
    const d = pctQueries[idx]?.data;
    if (!d) return [];
    if (d.round?.metrics) return d.round.metrics;
    if (d.season?.metrics) return d.season.metrics;
    return [];
  };

  const allMetricCodes = new Map<string, { bucket: string; displayName: string }>();
  const playerMetricMaps: Map<string, any>[] = [];

  slots.forEach(({ index }) => {
    const metrics = getMetrics(index);
    const map = new Map<string, any>();
    metrics.forEach((m: any) => {
      if (!allMetricCodes.has(m.metric_code)) {
        allMetricCodes.set(m.metric_code, { bucket: m.bucket, displayName: m.display_name || m.metric_code });
      }
      map.set(m.metric_code, m);
    });
    playerMetricMaps.push(map);
  });

  const buckets = ['core', 'support', 'risk'];
  const bucketLabels: Record<string, string> = { core: 'Core', support: 'Support', risk: 'Risk' };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Метрики</h3>
      {buckets.map(bucket => {
        const metricsForBucket = Array.from(allMetricCodes.entries())
          .filter(([, info]) => info.bucket === bucket);
        if (metricsForBucket.length === 0) return null;
        return (
          <div key={bucket} className="mb-4 last:mb-0">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{bucketLabels[bucket]}</div>
            <div className="space-y-2">
              {metricsForBucket.map(([mc, info]) => (
                <div key={mc}>
                  <div className="text-xs text-gray-600 mb-1">{info.displayName}</div>
                  <div className="space-y-1">
                    {slots.map(({ slot, index }, qi) => {
                      const m = playerMetricMaps[qi]?.get(mc);
                      const pct = m?.percentile != null ? Math.round(m.percentile * 100) : 0;
                      const barColor = bucket === 'risk'
                        ? (pct > 70 ? '#ef4444' : pct > 40 ? '#f59e0b' : '#10b981')
                        : SLOT_COLORS[index];
                      return (
                        <div key={index} className="flex items-center gap-2">
                          <div className="w-14 text-xs text-right truncate" style={{ color: SLOT_COLORS[index] }}>
                            {slot.playerName.split(' ').pop()}
                          </div>
                          <div className="flex-1 bg-gray-100 rounded-full h-3 relative overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, backgroundColor: barColor }}
                            />
                          </div>
                          <span className="text-xs font-mono w-12 text-right text-gray-500">
                            {m?.percentile != null ? `${pct}%` : '—'}
                          </span>
                          <span className="text-xs font-mono w-14 text-right text-gray-400">
                            {m?.value != null ? (typeof m.value === 'number' ? m.value.toFixed(2) : m.value) : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ========== Progression Chart ========== */

const SCORE_OPTIONS: { key: string; label: string }[] = [
  { key: 'total_score', label: 'Общий скор' },
  { key: 'core_score', label: 'Core скор' },
  { key: 'support_score', label: 'Support скор' },
  { key: 'core_score_adj', label: 'Core скор (adj)' },
  { key: 'support_score_adj', label: 'Support скор (adj)' },
  { key: 'good_share_core', label: 'Good%' },
];

const SCORE_KEYS = new Set(SCORE_OPTIONS.map(o => o.key));

interface MetricOption { key: string; label: string; bucket: string }

interface ChartProps {
  slots: { slot: Slot; index: number }[];
  histQueries: any[];
  pctQueries: any[];
  chartMetric: string;
  setChartMetric: (m: string) => void;
}

const ProgressionChart: React.FC<ChartProps> = ({ slots, histQueries, pctQueries, chartMetric, setChartMetric }) => {
  const allRounds = new Set<number>();

  const metricOptions: MetricOption[] = [];
  const seenMetrics = new Set<string>();

  slots.forEach(({ index }) => {
    const hd = histQueries[index]?.data;
    if (hd) hd.rounds?.forEach((r: number) => allRounds.add(r));

    if (hd?.metrics) {
      Object.entries(hd.metrics as Record<string, any>).forEach(([mc, info]) => {
        if (!seenMetrics.has(mc)) {
          seenMetrics.add(mc);
          metricOptions.push({ key: mc, label: info.display_name || mc, bucket: info.bucket || 'core' });
        }
      });
    }

    const pd = pctQueries[index]?.data;
    const pctMetrics = pd?.season?.metrics || pd?.round?.metrics || [];
    pctMetrics.forEach((m: any) => {
      if (!seenMetrics.has(m.metric_code)) {
        seenMetrics.add(m.metric_code);
        metricOptions.push({ key: m.metric_code, label: m.display_name || m.metric_code, bucket: m.bucket || 'core' });
      }
    });
  });

  const coreMetrics = metricOptions.filter(m => m.bucket === 'core');
  const supportMetrics = metricOptions.filter(m => m.bucket === 'support');
  const riskMetrics = metricOptions.filter(m => m.bucket === 'risk');

  const isScoreMetric = (m: string) => SCORE_KEYS.has(m);

  const chartData = Array.from(allRounds).sort((a, b) => a - b).map(rn => {
    const point: any = { round: rn };
    slots.forEach(({ slot, index }) => {
      const d = histQueries[index]?.data;
      if (!d) return;
      const label = slot.playerName.split(' ').pop() || `P${index}`;
      if (isScoreMetric(chartMetric)) {
        const sc = d.scores?.[String(rn)];
        point[label] = sc?.[chartMetric] ?? null;
      } else {
        const mv = d.metrics?.[chartMetric]?.values?.find((v: any) => v.round === rn);
        point[label] = mv?.percentile != null ? Math.round(mv.percentile * 100) : null;
      }
    });
    return point;
  });

  const lineKeys = slots.map(({ slot, index }) => ({
    key: slot.playerName.split(' ').pop() || `P${index}`,
    color: SLOT_COLORS[index],
  }));

  const hasAnyHistory = slots.some(({ index }) => histQueries[index]?.data?.rounds?.length > 0);

  if (!hasAnyHistory) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center text-gray-400 text-sm py-8">
        Нет данных по турам для графика прогресса
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Прогресс по турам</h3>
        <select
          value={chartMetric}
          onChange={e => setChartMetric(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white min-w-[200px]"
        >
          <optgroup label="Скоры">
            {SCORE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </optgroup>
          {coreMetrics.length > 0 && (
            <optgroup label="Core метрики">
              {coreMetrics.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </optgroup>
          )}
          {supportMetrics.length > 0 && (
            <optgroup label="Support метрики">
              {supportMetrics.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </optgroup>
          )}
          {riskMetrics.length > 0 && (
            <optgroup label="Risk метрики">
              {riskMetrics.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </optgroup>
          )}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="round" tick={{ fontSize: 11 }} label={{ value: 'Тур', position: 'insideBottomRight', offset: -5, fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={isScoreMetric(chartMetric) ? [0, 1] : [0, 100]} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            formatter={(value: any) => value != null ? (isScoreMetric(chartMetric) ? Number(value).toFixed(3) : `${value}%`) : '—'}
            labelFormatter={l => `Тур ${l}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {lineKeys.map(lk => (
            <Line
              key={lk.key}
              type="monotone"
              dataKey={lk.key}
              stroke={lk.color}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
