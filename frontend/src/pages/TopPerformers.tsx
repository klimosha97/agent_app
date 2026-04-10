/**
 * Страница «Топ выступления за неделю»
 * Автоматически загружает и отображает ИИ-дайджест
 * по последнему туру каждого турнира.
 */

import React, { useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { SparklesIcon, ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { apiService } from '../services/api';
import type { AiChart, AiHighlightedPlayer, WeeklyDigestReport } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';

export const TopPerformers: React.FC = () => {
  const [reports, setReports] = useState<WeeklyDigestReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDigest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiService.aiWeeklyDigest();
      if (resp.success && resp.reports) {
        setReports(resp.reports);
      } else {
        setError(resp.text || 'Не удалось загрузить дайджест');
      }
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки дайджеста');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDigest();
  }, [loadDigest]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-md">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Топ выступления за неделю</h1>
            <p className="text-sm text-gray-500">ИИ-обзор последних туров по всем турнирам</p>
          </div>
        </div>
        <button
          onClick={loadDigest}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={loadDigest} />}

      {!loading && !error && reports.length === 0 && (
        <EmptyState />
      )}

      {!loading && reports.map(report => (
        <TournamentReport key={report.tournament_id} report={report} />
      ))}
    </div>
  );
};

function TournamentReport({ report }: { report: WeeklyDigestReport }) {
  const statusLabel = report.status === 'cached'
    ? 'из кэша'
    : report.status === 'new'
      ? 'новый'
      : '';

  const noData = report.status === 'no_data';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <CardTitle>{report.tournament_full_name || report.tournament_name}</CardTitle>
            {report.round_number != null && (
              <span className="text-sm font-medium text-gray-500">Тур {report.round_number}</span>
            )}
          </div>
          {statusLabel && (
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              report.status === 'cached'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {statusLabel}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {noData ? (
          <NoDataBanner message={report.text} />
        ) : (
          <div className="space-y-4">
            <MarkdownContent content={report.text} />

            {report.charts && report.charts.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                {report.charts.map((chart, i) => (
                  <ChartCard key={i} chart={chart} />
                ))}
              </div>
            )}

            {report.highlighted_players && report.highlighted_players.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Обратите внимание</h4>
                <div className="flex flex-wrap gap-2">
                  {report.highlighted_players.map(p => (
                    <HighlightedPlayerBadge key={p.player_id} player={p} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HighlightedPlayerBadge({ player }: { player: AiHighlightedPlayer }) {
  return (
    <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      <span className="font-semibold text-amber-800">{player.full_name}</span>
      <span className="text-amber-600 ml-1">{player.team_name} · {player.position_name}</span>
      {player.reason && (
        <span className="text-amber-500 ml-1 italic">— {player.reason}</span>
      )}
    </div>
  );
}

function NoDataBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 py-4 px-4 bg-gray-50 rounded-lg border border-gray-200">
      <ExclamationTriangleIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <Card key={i}>
          <CardContent>
            <div className="animate-pulse space-y-3 py-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-200" />
                <div className="h-5 w-48 bg-gray-200 rounded" />
              </div>
              <div className="h-4 bg-gray-100 rounded w-full" />
              <div className="h-4 bg-gray-100 rounded w-3/4" />
              <div className="h-4 bg-gray-100 rounded w-5/6" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12">
          <ExclamationTriangleIcon className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm text-red-600 mb-4">{message}</p>
          <button
            onClick={onRetry}
            className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
          >
            Попробовать снова
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <SparklesIcon className="w-10 h-10 mb-3 text-amber-300" />
          <p className="text-sm font-medium">Нет данных для дайджеста</p>
          <p className="text-xs mt-1">Загрузите данные по турам в разделах турниров</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-strong:text-gray-900 prose-li:marker:text-violet-500">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

function ChartCard({ chart }: { chart: AiChart }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">{chart.title}</h4>
      {chart.type === 'radar' && <RadarChartView data={chart.data} />}
      {chart.type === 'bar' && <BarChartView data={chart.data} />}
    </div>
  );
}

function RadarChartView({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="#e5e7eb" />
        {/* @ts-ignore recharts type */}
        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#6b7280' }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
        <Radar
          name="Перцентиль"
          dataKey="percentile"
          stroke="#7c3aed"
          fill="#7c3aed"
          fillOpacity={0.25}
          strokeWidth={2}
        />
        <Tooltip
          formatter={(val: any) => [`${val}%`, 'Перцентиль']}
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function BarChartView({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
          formatter={(val: any, name: any) => [
            Number(val).toFixed(2),
            name === 'core_score' ? 'Core' : name === 'support_score' ? 'Support' : 'Total',
          ]}
          labelFormatter={(label: any) => {
            const item = data.find(d => d.name === label);
            return item ? `${item.full_name} (${item.team || ''})` : String(label);
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="core_score" name="Core" fill="#7c3aed" radius={[0, 4, 4, 0]} />
        <Bar dataKey="support_score" name="Support" fill="#2563eb" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default TopPerformers;
