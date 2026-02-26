/**
 * Редактор корзин команд (Tier Editor)
 * Позволяет распределять команды по корзинам TOP/BOTTOM
 * для контекстного сравнения слабых/сильных команд
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import { XMarkIcon, CheckIcon, ArrowsUpDownIcon } from '@heroicons/react/24/outline';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tournamentId: number;
  tournamentName: string;
}

interface TeamTier {
  team_name: string;
  tier: 'TOP' | 'BOTTOM';
}

export const TierEditor: React.FC<Props> = ({ isOpen, onClose, tournamentId, tournamentName }) => {
  const queryClient = useQueryClient();
  const [localTeams, setLocalTeams] = useState<TeamTier[]>([]);
  const [dragItem, setDragItem] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery(
    ['team-tiers', tournamentId],
    () => apiService.getTeamTiers(tournamentId),
    { enabled: isOpen }
  );

  // Always sync teams when opening the modal (add new, remove gone, keep existing tiers)
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (isOpen && !synced) {
      setSynced(true);
      apiService.populateTeamTiers(tournamentId).then(() => {
        refetch();
      }).catch(console.error);
    }
  }, [isOpen, synced, tournamentId, refetch]);

  useEffect(() => {
    if (!isOpen) setSynced(false);
  }, [isOpen]);

  useEffect(() => {
    if (data?.data) {
      setLocalTeams(data.data.map((t: any) => ({
        ...t,
        tier: t.tier || 'BOTTOM',
      })));
    }
  }, [data]);

  const saveMutation = useMutation(
    async (teams: TeamTier[]) => {
      return apiService.updateTeamTiers(
        tournamentId,
        teams.map((t) => ({ team_name: t.team_name, tier: t.tier }))
      );
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['team-tiers', tournamentId]);
      },
    }
  );

  if (!isOpen) return null;

  const topTeams = localTeams.filter((t) => t.tier === 'TOP');
  const bottomTeams = localTeams.filter((t) => t.tier === 'BOTTOM');

  const moveTo = (teamName: string, tier: 'TOP' | 'BOTTOM') => {
    setLocalTeams((prev) =>
      prev.map((t) => (t.team_name === teamName ? { ...t, tier } : t))
    );
  };

  const handleSave = () => {
    saveMutation.mutate(localTeams);
  };

  const handleDragStart = (teamName: string) => {
    setDragItem(teamName);
  };

  const handleDrop = (tier: 'TOP' | 'BOTTOM') => {
    if (dragItem) {
      moveTo(dragItem, tier);
      setDragItem(null);
    }
  };

  const TeamCard = ({ team, showActions }: { team: TeamTier; showActions?: boolean }) => (
    <div
      draggable
      onDragStart={() => handleDragStart(team.team_name)}
      className="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:shadow transition-shadow"
    >
      <span className="text-sm font-medium text-gray-800">{team.team_name}</span>
      {showActions !== false && (
        <div className="flex gap-1">
          {team.tier !== 'TOP' && (
            <button
              onClick={() => moveTo(team.team_name, 'TOP')}
              className="p-1 text-emerald-500 hover:bg-emerald-50 rounded"
              title="В верхнюю половину"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
          )}
          {team.tier !== 'BOTTOM' && (
            <button
              onClick={() => moveTo(team.team_name, 'BOTTOM')}
              className="p-1 text-orange-500 hover:bg-orange-50 rounded"
              title="В нижнюю половину"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <ArrowsUpDownIcon className="w-5 h-5 text-purple-600" />
              Корзины команд
            </h2>
            <p className="text-sm text-gray-600">{tournamentName}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saveMutation.isLoading}
              className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <CheckIcon className="w-4 h-4" />
              {saveMutation.isLoading ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <XMarkIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {saveMutation.isSuccess && (
          <div className="mx-6 mt-3 px-4 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
            Корзины сохранены
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-500">Загрузка...</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* TOP */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop('TOP')}
              >
                <h3 className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <span className="w-3 h-3 bg-emerald-500 rounded-full" />
                  Верхняя часть ({topTeams.length})
                </h3>
                <div className="space-y-2 p-3 bg-emerald-50/50 rounded-lg border border-emerald-200 min-h-[120px]">
                  {topTeams.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">Перетащите команды сюда</p>
                  ) : (
                    topTeams.map((team) => <TeamCard key={team.team_name} team={team} />)
                  )}
                </div>
              </div>

              {/* BOTTOM */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop('BOTTOM')}
              >
                <h3 className="text-sm font-semibold text-orange-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <span className="w-3 h-3 bg-orange-500 rounded-full" />
                  Нижняя часть ({bottomTeams.length})
                </h3>
                <div className="space-y-2 p-3 bg-orange-50/50 rounded-lg border border-orange-200 min-h-[120px]">
                  {bottomTeams.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">Перетащите команды сюда</p>
                  ) : (
                    bottomTeams.map((team) => <TeamCard key={team.team_name} team={team} />)
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TierEditor;
