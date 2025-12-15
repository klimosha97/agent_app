/**
 * Страница "Турниры"
 * Показывает список турниров
 */

import React, { useState } from 'react';
import { 
  ChevronRightIcon, 
  CalendarIcon,
  UsersIcon,
  TrophyIcon,
  StarIcon,
  UserPlusIcon,
  ChartBarIcon,
  ArrowLeftIcon,
  CloudArrowUpIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { useTournaments } from '../hooks/useApi';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Tournament } from '../types';
import { formatDateShort } from '../utils';
import { TournamentUploadModal } from '../components/TournamentUploadModal';
import { apiService } from '../services/api';
import { useQueryClient } from 'react-query';

// Типы секций внутри турнира
type TournamentSection = 'overview' | 'best_performances' | 'new_faces' | 'all_players' | 'last_round_players' | 'top_by_position';

// Конфигурация плиток для страницы турнира
const TOURNAMENT_TILES = [
  {
    id: 'best_performances' as TournamentSection,
    title: 'Лучшие выступления за тур',
    description: 'Игроки с лучшими показателями в последнем туре',
    icon: StarIcon,
    color: 'from-amber-500 to-orange-600',
    bgColor: 'bg-gradient-to-br from-amber-50 to-orange-50',
    iconColor: 'text-amber-600',
  },
  {
    id: 'new_faces' as TournamentSection,
    title: 'Новые лица в этом туре',
    description: 'Игроки, впервые появившиеся в турнире',
    icon: UserPlusIcon,
    color: 'from-emerald-500 to-teal-600',
    bgColor: 'bg-gradient-to-br from-emerald-50 to-teal-50',
    iconColor: 'text-emerald-600',
  },
  {
    id: 'all_players' as TournamentSection,
    title: 'Все футболисты турнира',
    description: 'Полный список игроков со статистикой за сезон',
    icon: UsersIcon,
    color: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-gradient-to-br from-blue-50 to-indigo-50',
    iconColor: 'text-blue-600',
  },
  {
    id: 'top_by_position' as TournamentSection,
    title: 'Топ по позициям за сезон',
    description: 'Лучшие игроки на каждой позиции',
    icon: ChartBarIcon,
    color: 'from-purple-500 to-pink-600',
    bgColor: 'bg-gradient-to-br from-purple-50 to-pink-50',
    iconColor: 'text-purple-600',
  }
];

export const Tournaments: React.FC = () => {
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<TournamentSection>('overview');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTournament, setUploadTournament] = useState<Tournament | null>(null);

  const { data: tournamentsResponse, isLoading: isLoadingTournaments, refetch } = useTournaments();
  const tournaments: Tournament[] = tournamentsResponse?.data || [];
  const queryClient = useQueryClient();

  // Получаем актуальные данные турнира из списка
  const selectedTournament: Tournament | null = selectedTournamentId !== null 
    ? tournaments.find(t => t.id === selectedTournamentId) ?? null 
    : null;

  const handleTournamentClick = (tournament: Tournament) => {
    // Принудительно обновляем данные при входе в турнир
    refetch();
    setSelectedTournamentId(tournament.id);
    setSelectedSection('overview');
  };

  const handleBackToTournaments = () => {
    setSelectedTournamentId(null);
    setSelectedSection('overview');
  };

  const handleBackToOverview = () => {
    setSelectedSection('overview');
  };

  const handleTileClick = (sectionId: TournamentSection) => {
    setSelectedSection(sectionId);
  };

  const handleUploadClick = (tournament: Tournament, e: React.MouseEvent) => {
    e.stopPropagation(); // Предотвращаем открытие турнира
    setUploadTournament(tournament);
    setUploadModalOpen(true);
  };

  const handleUploadSuccess = () => {
    // Обновляем данные после успешной загрузки
    queryClient.invalidateQueries(['tournaments']);
    queryClient.invalidateQueries(['database-players']);
  };

  const handleClearDatabase = async () => {
    if (!window.confirm('⚠️ ВНИМАНИЕ!\n\nЭто удалит ВСЕ данные из базы (игроков и статистику).\nТурниры и справочники останутся.\n\nПродолжить?')) {
      return;
    }

    try {
      await apiService.clearDatabase();
      window.alert('✅ База данных очищена успешно!');
      queryClient.invalidateQueries(['tournaments']);
      queryClient.invalidateQueries(['database-players']);
    } catch (error: any) {
      window.alert(`❌ Ошибка очистки: ${error.message}`);
    }
  };

  // ========================================
  // РЕНДЕР: Заглушка для всех секций
  // ========================================
  const renderStubSection = (sectionId: TournamentSection) => {
    const tile = TOURNAMENT_TILES.find(t => t.id === sectionId);
    if (!tile || !selectedTournament) return null;

    const IconComponent = tile.icon;

    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="secondary" size="sm" onClick={handleBackToOverview}>
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Назад к разделам
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tile.title}</h1>
            <p className="text-gray-600">{selectedTournament.full_name}</p>
          </div>
        </div>

        <Card>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-16">
              <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${tile.color} flex items-center justify-center mb-6 shadow-lg`}>
                <IconComponent className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Раздел в разработке
              </h2>
              <p className="text-gray-500 text-center max-w-md mb-6">
                {tile.description}. Таблицы для хранения данных создаются заново.
              </p>
              <Badge variant="warning" size="lg">
                🚧 В разработке
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ========================================
  // РЕНДЕР: Обзор турнира (4 плитки)
  // ========================================
  const renderTournamentOverview = () => {
    if (!selectedTournament) return null;

    return (
      <div className="space-y-6">
        {/* Заголовок */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="secondary" size="sm" onClick={handleBackToTournaments}>
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Все турниры
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{selectedTournament.full_name}</h1>
              <p className="text-gray-600">Выберите раздел для просмотра</p>
            </div>
          </div>
        </div>

        {/* Информация о турнире */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Плитка "Всего игроков" - кликабельная */}
          <Card 
            hover 
            className="cursor-pointer group/players transition-all duration-200 hover:shadow-lg hover:border-blue-300"
            onClick={() => handleTileClick('all_players')}
          >
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover/players:bg-blue-200 transition-colors">
                    <UsersIcon className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">Всего игроков</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {selectedTournament.players_count || 0}
                    </p>
                  </div>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-gray-300 group-hover/players:text-blue-500 group-hover/players:translate-x-1 transition-all" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <CalendarIcon className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Последнее обновление</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {selectedTournament.last_update 
                      ? formatDateShort(selectedTournament.last_update)
                      : 'Нет данных'
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <span className="text-yellow-600 font-bold text-lg">
                    {selectedTournament.current_round || '—'}
                  </span>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Текущий тур</p>
                  <p className="text-lg font-bold text-gray-900">
                    {selectedTournament.current_round 
                      ? `Тур ${selectedTournament.current_round}`
                      : 'Не указан'
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <TrophyIcon className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Турнир</p>
                  <p className="text-lg font-bold text-gray-900">{selectedTournament.code.toUpperCase()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 4 плитки (2x2) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TOURNAMENT_TILES.map((tile) => {
            const IconComponent = tile.icon;
            
            // Определяем значение для каждой плитки
            const getTileValue = () => {
              if (tile.id === 'all_players') {
                return selectedTournament.players_count || 0;
              }
              return '—';
            };
            
            // Определяем label для значения
            const getTileLabel = () => {
              if (tile.id === 'all_players') {
                return 'Игроков в базе';
              }
              return 'Статус';
            };

            return (
              <div
                key={tile.id}
                onClick={() => handleTileClick(tile.id)}
                className={`
                  relative overflow-hidden rounded-xl border border-gray-200 
                  ${tile.bgColor} 
                  cursor-pointer transition-all duration-300 
                  hover:shadow-lg hover:scale-[1.02] hover:border-gray-300
                  group
                `}
              >
                <div className="absolute top-3 right-3">
                  <Badge variant="warning" size="sm">
                    🚧 В разработке
                  </Badge>
                </div>

                <div className="p-6">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${tile.color} flex items-center justify-center mb-4 shadow-md`}>
                    <IconComponent className="w-7 h-7 text-white" />
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{tile.title}</h3>
                  <p className="text-sm text-gray-500 mb-4">{tile.description}</p>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">{getTileLabel()}</p>
                      <p className={`text-2xl font-bold ${tile.iconColor}`}>{getTileValue()}</p>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ========================================
  // ОСНОВНОЙ РЕНДЕР
  // ========================================
  
  if (selectedTournament) {
    if (selectedSection === 'overview') {
      return renderTournamentOverview();
    } else {
      return renderStubSection(selectedSection);
    }
  }

  // Список турниров
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Турниры</h1>
        <p className="text-gray-600">Выберите турнир для просмотра статистики и управления данными</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoadingTournaments ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent>
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/4"></div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          tournaments.map((tournament) => (
            <Card 
              key={tournament.id} 
              hover 
              className="cursor-pointer group transition-all duration-200 hover:shadow-lg"
              onClick={() => handleTournamentClick(tournament)}
            >
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm tournament-badge ${tournament.code.toLowerCase()}`}>
                        {tournament.code.toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                          {tournament.name}
                        </h3>
                        <p className="text-sm text-gray-500">{tournament.full_name}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex space-x-4">
                        <div className="text-sm">
                          <span className="text-gray-500">Игроков:</span>
                          <span className="font-semibold text-gray-900 ml-1">{tournament.players_count || 0}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Обновлено:</span>
                          <span className="font-semibold text-gray-900 ml-1">
                            {tournament.last_update 
                              ? formatDateShort(tournament.last_update)
                              : 'Нет данных'
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    {/* Иконка загрузки файлов */}
                    <button
                      onClick={(e) => handleUploadClick(tournament, e)}
                      className="p-2.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all group/upload relative"
                      title="Загрузить данные турнира"
                    >
                      <CloudArrowUpIcon className="w-8 h-8" />
                      
                      {/* Tooltip */}
                      <div className="absolute bottom-full right-0 mb-2 hidden group-hover/upload:block">
                        <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                          Загрузить данные турнира
                          <div className="absolute top-full right-4 -mt-1">
                            <div className="border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </div>
                    </button>

                    <ChevronRightIcon className="w-6 h-6 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Дополнительные действия */}
      <Card>
        <CardHeader>
          <CardTitle>Дополнительные действия</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Button variant="secondary" fullWidth disabled>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Добавить турнир
            </Button>

            <Button variant="secondary" fullWidth disabled>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Сравнить турниры
            </Button>

            <Button variant="secondary" fullWidth disabled>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Экспорт отчёта
            </Button>

            <Button 
              variant="secondary" 
              fullWidth 
              onClick={handleClearDatabase}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              <TrashIcon className="w-4 h-4 mr-2" />
              Очистить БД
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Модальное окно загрузки */}
      {uploadTournament && (
        <TournamentUploadModal
          isOpen={uploadModalOpen}
          onClose={() => {
            setUploadModalOpen(false);
            setUploadTournament(null);
          }}
          tournamentId={uploadTournament.id}
          tournamentName={uploadTournament.full_name}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
};
