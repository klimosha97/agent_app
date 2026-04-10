/**
 * ИИ Скаут-ассистент — чат с быстрыми действиями, графиками и markdown
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
} from 'recharts';
import { SparklesIcon, PaperAirplaneIcon, UserGroupIcon, EyeIcon } from '@heroicons/react/24/outline';
import { apiService } from '../services/api';
import type { AiChart, AiHighlightedPlayer, AiMessage } from '../types';

const MULTI_LINE_COLORS = [
  '#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626',
  '#8b5cf6', '#0891b2', '#65a30d', '#ea580c', '#be185d',
];

interface AiAgentSectionProps {
  tournamentId: number;
  tournamentName: string;
  currentRound?: number;
  availableRounds?: number[];
}

export function AiAgentSection({ tournamentId, tournamentName, currentRound, availableRounds }: AiAgentSectionProps) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRound, setSelectedRound] = useState<number>(currentRound || 0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addUserMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }]);
  }, []);

  const addLoadingMessage = useCallback(() => {
    setMessages(prev => [...prev, {
      id: `loading-${Date.now()}`,
      role: 'ai',
      content: '',
      loading: true,
      timestamp: Date.now(),
    }]);
  }, []);

  const addAiMessage = useCallback((text: string, charts?: AiChart[], highlighted?: AiHighlightedPlayer[]) => {
    setMessages(prev => {
      const filtered = prev.filter(m => !m.loading);
      return [...filtered, {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: text,
        charts,
        highlighted_players: highlighted,
        timestamp: Date.now(),
      }];
    });
  }, []);

  const handleApiCall = useCallback(async (label: string, apiCall: () => Promise<any>) => {
    addUserMessage(label);
    addLoadingMessage();
    setLoading(true);
    try {
      const res = await apiCall();
      addAiMessage(res.text || 'Нет данных для анализа.', res.charts, res.highlighted_players);
    } catch (err: any) {
      const errMsg = err?.message || err?.response?.data?.detail || 'Ошибка при обращении к ИИ';
      addAiMessage(`Ошибка: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  }, [addUserMessage, addLoadingMessage, addAiMessage]);

  const handleRoundReview = () => {
    const rn = selectedRound || currentRound;
    if (!rn) return;
    handleApiCall(
      `Обзор тура ${rn}`,
      () => apiService.aiRoundReview(tournamentId, rn),
    );
  };

  const handleSeasonReview = () => {
    handleApiCall(
      'Обзор сезона',
      () => apiService.aiSeasonReview(tournamentId),
    );
  };

  const handleMyPlayers = () => {
    handleApiCall(
      'Обзор моих футболистов',
      () => apiService.aiWatchedReview(tournamentId, 'MY'),
    );
  };

  const handleTrackedPlayers = () => {
    handleApiCall(
      'Обзор отслеживаемых',
      () => apiService.aiWatchedReview(tournamentId, 'TRACKED'),
    );
  };

  const handleChat = () => {
    const q = input.trim();
    if (!q) return;
    setInput('');
    handleApiCall(q, () => apiService.aiChat(tournamentId, q, selectedRound || undefined));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChat();
    }
  };

  const rounds = availableRounds?.length ? availableRounds : currentRound ? [currentRound] : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg">
          <SparklesIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">ИИ Скаут-ассистент</h2>
          <p className="text-sm text-gray-500">{tournamentName} · DeepSeek</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 items-center">
        {rounds.length > 0 && (
          <select
            value={selectedRound}
            onChange={e => setSelectedRound(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
          >
            {rounds.map(r => (
              <option key={r} value={r}>Тур {r}</option>
            ))}
          </select>
        )}
        <QuickButton onClick={handleRoundReview} disabled={loading || !selectedRound} label="Обзор тура" />
        <QuickButton onClick={handleSeasonReview} disabled={loading} label="Обзор сезона" />
        <div className="w-px h-6 bg-gray-300 mx-1" />
        <QuickButton onClick={handleMyPlayers} disabled={loading} label="Мои футболисты" icon="my" />
        <QuickButton onClick={handleTrackedPlayers} disabled={loading} label="Отслеживаемые" icon="tracked" />
      </div>

      {/* Chat area */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm" style={{ minHeight: 400 }}>
        <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
          {messages.length === 0 && <EmptyState />}
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-3 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Задайте вопрос по турниру..."
            disabled={loading}
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 disabled:bg-gray-50"
          />
          <button
            onClick={handleChat}
            disabled={loading || !input.trim()}
            className="p-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <PaperAirplaneIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickButton({ onClick, disabled, label, icon }: { onClick: () => void; disabled: boolean; label: string; icon?: 'my' | 'tracked' }) {
  const iconEl = icon === 'my'
    ? <UserGroupIcon className="w-3.5 h-3.5" />
    : icon === 'tracked'
    ? <EyeIcon className="w-3.5 h-3.5" />
    : null;

  const colorClass = icon
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
    : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-sm px-3 py-1.5 rounded-lg border ${colorClass} disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-1.5`}
    >
      {iconEl}
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <SparklesIcon className="w-10 h-10 mb-3 text-violet-300" />
      <p className="text-sm font-medium">Выберите действие или задайте вопрос</p>
      <p className="text-xs mt-1">ИИ проанализирует данные турнира и даст рекомендации</p>
    </div>
  );
}

function MessageBubble({ message }: { message: AiMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-violet-600 text-white rounded-2xl rounded-br-md px-4 py-2 max-w-[80%] text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.loading) {
    return (
      <div className="flex items-start gap-2">
        <AiAvatar />
        <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <AiAvatar />
      <div className="flex-1 space-y-3 max-w-[90%]">
        <div className="bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3">
          <MarkdownContent content={message.content} />
        </div>

        {message.charts && message.charts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {message.charts.map((chart, i) => (
              <ChartCard key={i} chart={chart} />
            ))}
          </div>
        )}

        {message.highlighted_players && message.highlighted_players.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.highlighted_players.map(p => (
              <div key={p.player_id} className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                <span className="font-semibold text-amber-800">{p.full_name}</span>
                <span className="text-amber-600 ml-1">{p.team_name} · {p.position_name}</span>
                {p.reason && (
                  <span className="text-amber-500 ml-1 italic">— {p.reason}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AiAvatar() {
  return (
    <div className="flex-shrink-0 w-7 h-7 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-full flex items-center justify-center">
      <SparklesIcon className="w-4 h-4 text-white" />
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-strong:text-gray-900 prose-li:marker:text-violet-500">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

// ======================================================================
// Charts
// ======================================================================

function ChartCard({ chart }: { chart: AiChart }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">{chart.title}</h4>
      {chart.type === 'radar' && <RadarChartView data={chart.data} />}
      {chart.type === 'bar' && <BarChartView data={chart.data} />}
      {chart.type === 'line' && <LineChartView data={chart.data} />}
      {chart.type === 'multi_line' && <MultiLineChartView data={chart.data} players={chart.players} />}
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

function LineChartView({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="round" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
          formatter={(val: any) => [Number(val).toFixed(2), 'Total Score']}
        />
        <Line
          type="monotone"
          dataKey="total_score"
          stroke="#7c3aed"
          strokeWidth={2}
          dot={{ r: 4, fill: '#7c3aed' }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MultiLineChartView({ data, players }: { data: any[]; players?: string[] }) {
  const playerNames = players || [];
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="round" tick={{ fontSize: 11 }} label={{ value: 'Тур', position: 'insideBottomRight', offset: -5, fontSize: 11 }} />
        <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
          formatter={(val: any, name: any) => [val != null ? Number(val).toFixed(2) : '—', String(name)]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {playerNames.map((name, i) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={MULTI_LINE_COLORS[i % MULTI_LINE_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export default AiAgentSection;
