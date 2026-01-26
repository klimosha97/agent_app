/**
 * Страница "База данных"
 * Показывает всех игроков со всей статистикой
 * Поддержка:
 * - Сортировки по всем колонкам
 * - Заморозки колонок Игрок/Команда при горизонтальном скролле
 * - Настройки видимых колонок
 * - Все параметры из Excel файла
 * - Клик на игрока для перехода на страницу профиля
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { apiService } from '../services/api';
import { MagnifyingGlassIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { TableColumnsSettings } from '../components/TableColumnsSettings';
import { usePlayerNavigation } from '../App';

type SliceType = 'TOTAL' | 'PER90';

// Определение всех колонок таблицы
export interface ColumnDef {
  key: string;
  label: string;
  shortLabel?: string;
  isPercent?: boolean;
  isXg?: boolean;
  frozen?: boolean;
  width?: string;
  group?: string;
}

// Все колонки из METRICS_MAPPING (экспортируем для переиспользования)
export const ALL_COLUMNS: ColumnDef[] = [
  // Замороженные колонки (всегда видны)
  { key: 'full_name', label: 'Игрок', frozen: true, width: 'min-w-[180px]' },
  { key: 'team_name', label: 'Команда', frozen: true, width: 'min-w-[140px]' },
  { key: 'position_code', label: 'Поз', frozen: true, width: 'w-[60px]' },
  
  // Основная статистика
  { key: 'index', label: 'Индекс', shortLabel: 'Инд', group: 'Основное' },
  { key: 'minutes', label: 'Минуты', shortLabel: 'Мин', group: 'Основное' },
  { key: 'matches_played', label: 'Матчи', shortLabel: 'М', group: 'Основное' },
  { key: 'starting_lineup', label: 'В старте', shortLabel: 'Старт', group: 'Основное' },
  { key: 'substituted_on', label: 'Вышел на замену', shortLabel: 'Замена+', group: 'Основное' },
  { key: 'substituted_off', label: 'Был заменен', shortLabel: 'Замена-', group: 'Основное' },
  
  // Голы и результативность
  { key: 'goals', label: 'Голы', shortLabel: 'Г', group: 'Голы' },
  { key: 'assists', label: 'Голевые передачи', shortLabel: 'А', group: 'Голы' },
  { key: 'xg', label: 'xG', isXg: true, group: 'Голы' },
  { key: 'xa', label: 'xA', isXg: true, group: 'Голы' },
  { key: 'goal_chances', label: 'Голевые моменты', shortLabel: 'ГМ', group: 'Голы' },
  { key: 'goal_chances_success', label: 'ГМ удачные', shortLabel: 'ГМ+', group: 'Голы' },
  { key: 'goal_chances_success_pct', label: 'ГМ %', isPercent: true, group: 'Голы' },
  { key: 'goal_chances_created', label: 'ГМ создал', shortLabel: 'ГМС', group: 'Голы' },
  { key: 'goal_attacks', label: 'Голевые атаки', shortLabel: 'ГА', group: 'Голы' },
  { key: 'goal_errors', label: 'Голевые ошибки', shortLabel: 'ГОш', group: 'Голы' },
  { key: 'gross_errors', label: 'Грубые ошибки', shortLabel: 'ГрОш', group: 'Голы' },
  
  // Удары
  { key: 'shots', label: 'Удары', shortLabel: 'Уд', group: 'Удары' },
  { key: 'shots_on_target', label: 'В створ', shortLabel: 'УдС', group: 'Удары' },
  { key: 'shots_accurate_pct', label: 'Удары %', isPercent: true, group: 'Удары' },
  { key: 'shots_off_target', label: 'Мимо', shortLabel: 'УдМ', group: 'Удары' },
  { key: 'shots_blocked', label: 'Заблок.', shortLabel: 'УдБ', group: 'Удары' },
  { key: 'shots_head', label: 'Головой', shortLabel: 'УдГол', group: 'Удары' },
  { key: 'shots_woodwork', label: 'В каркас', shortLabel: 'Карк', group: 'Удары' },
  
  // Передачи
  { key: 'passes', label: 'Передачи', shortLabel: 'Пер', group: 'Передачи' },
  { key: 'passes_accurate', label: 'Точные', shortLabel: 'ПерТ', group: 'Передачи' },
  { key: 'passes_accurate_pct', label: 'Точность %', isPercent: true, group: 'Передачи' },
  { key: 'key_passes', label: 'Ключевые', shortLabel: 'КлПер', group: 'Передачи' },
  { key: 'key_passes_accurate', label: 'Ключ. точные', shortLabel: 'КлПерТ', group: 'Передачи' },
  { key: 'key_passes_accurate_pct', label: 'Ключ. %', isPercent: true, group: 'Передачи' },
  { key: 'progressive_passes', label: 'Прогрессивные', shortLabel: 'ПрогП', group: 'Передачи' },
  { key: 'progressive_passes_accurate', label: 'Прогр. точные', shortLabel: 'ПрогПТ', group: 'Передачи' },
  { key: 'progressive_passes_accurate_pct', label: 'Прогр. %', isPercent: true, group: 'Передачи' },
  { key: 'progressive_passes_clean', label: 'Прогр. чистые', shortLabel: 'ПрогЧ', group: 'Передачи' },
  { key: 'long_passes', label: 'Длинные', shortLabel: 'ДлПер', group: 'Передачи' },
  { key: 'long_passes_accurate', label: 'Длин. точные', shortLabel: 'ДлПерТ', group: 'Передачи' },
  { key: 'long_passes_accurate_pct', label: 'Длин. %', isPercent: true, group: 'Передачи' },
  { key: 'super_long_passes', label: 'Сверхдлинные', shortLabel: 'СДлП', group: 'Передачи' },
  { key: 'super_long_passes_accurate', label: 'Сверхдл. точн.', shortLabel: 'СДлПТ', group: 'Передачи' },
  { key: 'super_long_passes_accurate_pct', label: 'Сверхдл. %', isPercent: true, group: 'Передачи' },
  { key: 'passes_to_final_third', label: 'В фин. треть', shortLabel: 'ПФТ', group: 'Передачи' },
  { key: 'passes_to_final_third_accurate', label: 'В ФТ точные', shortLabel: 'ПФТТ', group: 'Передачи' },
  { key: 'passes_to_final_third_accurate_pct', label: 'В ФТ %', isPercent: true, group: 'Передачи' },
  { key: 'passes_to_penalty_area', label: 'В штрафную', shortLabel: 'ПШтр', group: 'Передачи' },
  { key: 'passes_to_penalty_area_accurate', label: 'В штр. точные', shortLabel: 'ПШтрТ', group: 'Передачи' },
  { key: 'passes_to_penalty_area_accurate_pct', label: 'В штр. %', isPercent: true, group: 'Передачи' },
  { key: 'passes_for_shot', label: 'Под удар', shortLabel: 'ПодУд', group: 'Передачи' },
  { key: 'crosses', label: 'Навесы', shortLabel: 'Нав', group: 'Передачи' },
  { key: 'crosses_accurate', label: 'Навесы точные', shortLabel: 'НавТ', group: 'Передачи' },
  { key: 'crosses_accurate_pct', label: 'Навесы %', isPercent: true, group: 'Передачи' },
  
  // Единоборства
  { key: 'duels', label: 'Единоборства', shortLabel: 'Ед', group: 'Единоборства' },
  { key: 'duels_success', label: 'Ед. удачные', shortLabel: 'Ед+', group: 'Единоборства' },
  { key: 'duels_success_pct', label: 'Ед. %', isPercent: true, group: 'Единоборства' },
  { key: 'duels_unsuccessful', label: 'Ед. неудачные', shortLabel: 'Ед-', group: 'Единоборства' },
  { key: 'defensive_duels', label: 'В обороне', shortLabel: 'ЕдОб', group: 'Единоборства' },
  { key: 'defensive_duels_success', label: 'В обор. удачн.', shortLabel: 'ЕдОб+', group: 'Единоборства' },
  { key: 'defensive_duels_success_pct', label: 'В обор. %', isPercent: true, group: 'Единоборства' },
  { key: 'offensive_duels', label: 'В атаке', shortLabel: 'ЕдАт', group: 'Единоборства' },
  { key: 'offensive_duels_success', label: 'В атаке удачн.', shortLabel: 'ЕдАт+', group: 'Единоборства' },
  { key: 'offensive_duels_success_pct', label: 'В атаке %', isPercent: true, group: 'Единоборства' },
  { key: 'aerial_duels', label: 'Вверху', shortLabel: 'ЕдВерх', group: 'Единоборства' },
  { key: 'aerial_duels_success', label: 'Вверху удачн.', shortLabel: 'ЕдВерх+', group: 'Единоборства' },
  { key: 'aerial_duels_success_pct', label: 'Вверху %', isPercent: true, group: 'Единоборства' },
  
  // Обводки
  { key: 'dribbles', label: 'Обводки', shortLabel: 'Обв', group: 'Обводки' },
  { key: 'dribbles_success', label: 'Обв. удачные', shortLabel: 'Обв+', group: 'Обводки' },
  { key: 'dribbles_success_pct', label: 'Обв. %', isPercent: true, group: 'Обводки' },
  { key: 'dribbles_unsuccessful', label: 'Обв. неудачн.', shortLabel: 'Обв-', group: 'Обводки' },
  { key: 'dribbles_final_third', label: 'Обв. в ФТ', shortLabel: 'ОбвФТ', group: 'Обводки' },
  { key: 'dribbles_final_third_success', label: 'Обв. в ФТ уд.', shortLabel: 'ОбвФТ+', group: 'Обводки' },
  { key: 'dribbles_final_third_success_pct', label: 'Обв. ФТ %', isPercent: true, group: 'Обводки' },
  
  // Отборы и защита
  { key: 'tackles', label: 'Отборы', shortLabel: 'Отб', group: 'Защита' },
  { key: 'tackles_success', label: 'Отб. удачные', shortLabel: 'Отб+', group: 'Защита' },
  { key: 'tackles_success_pct', label: 'Отб. %', isPercent: true, group: 'Защита' },
  { key: 'interceptions', label: 'Перехваты', shortLabel: 'Перехв', group: 'Защита' },
  { key: 'recoveries', label: 'Подборы', shortLabel: 'Подб', group: 'Защита' },
  { key: 'ball_recoveries', label: 'Овладевания', shortLabel: 'Овлад', group: 'Защита' },
  { key: 'ball_recoveries_opponent_half', label: 'Овлад. на чужой', shortLabel: 'ОвлЧуж', group: 'Защита' },
  
  // ТТД
  { key: 'ttd_total', label: 'ТТД', group: 'ТТД' },
  { key: 'ttd_success', label: 'ТТД удачные', shortLabel: 'ТТД+', group: 'ТТД' },
  { key: 'ttd_success_pct', label: 'ТТД %', isPercent: true, group: 'ТТД' },
  { key: 'ttd_unsuccessful', label: 'ТТД неудачные', shortLabel: 'ТТД-', group: 'ТТД' },
  { key: 'ttd_in_opponent_box', label: 'ТТД в штрафной', shortLabel: 'ТТДШтр', group: 'ТТД' },
  { key: 'ttd_in_opponent_box_success', label: 'ТТД штр. удачн.', shortLabel: 'ТТДШтр+', group: 'ТТД' },
  { key: 'ttd_in_opponent_box_success_pct', label: 'ТТД штр. %', isPercent: true, group: 'ТТД' },
  
  // Входы в финальную треть
  { key: 'final_third_entries', label: 'Входы в ФТ', shortLabel: 'ВхФТ', group: 'Продвижение' },
  { key: 'final_third_entries_pass', label: 'Входы через пас', shortLabel: 'ВхФТп', group: 'Продвижение' },
  { key: 'final_third_entries_pass_pct', label: 'Входы пас %', isPercent: true, group: 'Продвижение' },
  { key: 'final_third_entries_dribble', label: 'Входы продв.', shortLabel: 'ВхФТд', group: 'Продвижение' },
  { key: 'final_third_entries_dribble_pct', label: 'Входы продв. %', isPercent: true, group: 'Продвижение' },
  { key: 'carries', label: 'Ведения мяча', shortLabel: 'Вед', group: 'Продвижение' },
  
  // Потери
  { key: 'losses', label: 'Потери', shortLabel: 'Пот', group: 'Потери' },
  { key: 'losses_own_half', label: 'Потери на своей', shortLabel: 'ПотСв', group: 'Потери' },
  { key: 'losses_passes', label: 'Потери передачи', shortLabel: 'ПотПер', group: 'Потери' },
  { key: 'losses_individual', label: 'Потери индив.', shortLabel: 'ПотИнд', group: 'Потери' },
  { key: 'bad_touches', label: 'Плохие касания', shortLabel: 'ПлКас', group: 'Потери' },
  
  // Дисциплина
  { key: 'fouls', label: 'Фолы', group: 'Дисциплина' },
  { key: 'fouls_on_player', label: 'Фолы на игроке', shortLabel: 'ФолНа', group: 'Дисциплина' },
  { key: 'yellow_cards', label: 'ЖК', group: 'Дисциплина' },
  { key: 'red_cards', label: 'КК', group: 'Дисциплина' },
  { key: 'offsides', label: 'Офсайды', shortLabel: 'Офс', group: 'Дисциплина' },
];

// Колонки которые можно настраивать (без замороженных)
const CONFIGURABLE_COLUMNS = ALL_COLUMNS.filter(c => !c.frozen);

// Ключ для localStorage
const STORAGE_KEY = 'database-visible-columns';

// Дефолтные видимые колонки (основные)
const DEFAULT_VISIBLE_COLUMNS = [
  'index', 'minutes', 'matches_played', 'goals', 'assists', 'xg', 'xa',
  'shots', 'shots_on_target', 'passes', 'passes_accurate_pct',
  'duels_success_pct', 'yellow_cards', 'red_cards'
];

export const Database: React.FC = () => {
  const { setSelectedPlayerId } = usePlayerNavigation();
  
  const [sliceType, setSliceType] = useState<SliceType>('TOTAL');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  
  // Сортировка
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Видимые колонки - загружаем из localStorage или используем дефолтные
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_VISIBLE_COLUMNS;
      }
    }
    return DEFAULT_VISIBLE_COLUMNS;
  });

  // Поиск в реальном времени с debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Загружаем данные
  const { data, isLoading, error } = useQuery(
    ['database-players', sliceType, search, currentPage, itemsPerPage, sortField, sortOrder],
    () => apiService.getAllPlayersFromDatabase(
      currentPage,
      itemsPerPage,
      sliceType,
      search || undefined,
      undefined,
      undefined,
      sortField || undefined,
      sortOrder
    ),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false
    }
  );

  const players = data?.data || [];
  const totalCount = data?.total || 0;
  const totalPages = data?.pages || 0;

  // Обработчик клика на заголовок для сортировки
  const handleSort = (field: string) => {
    if (sortField === field) {
      // Меняем направление
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Новое поле - сортируем по убыванию
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  // Форматирование значений
  const formatValue = (value: number | null | undefined, col: ColumnDef): string => {
    if (value === null || value === undefined) return '—';
    
    if (col.isPercent) {
      return `${value.toFixed(1)}%`;
    }
    
    if (col.isXg) {
      return value.toFixed(2);
    }
    
    return value % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
  };

  // Рендер иконки сортировки
  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return (
        <span className="ml-1 text-gray-300 group-hover:text-gray-400">
          <ChevronUpIcon className="w-3 h-3 inline" />
        </span>
      );
    }
    return (
      <span className="ml-1 text-blue-500">
        {sortOrder === 'asc' ? (
          <ChevronUpIcon className="w-3 h-3 inline" />
        ) : (
          <ChevronDownIcon className="w-3 h-3 inline" />
        )}
      </span>
    );
  };

  // Фильтруем колонки по видимым
  const displayedColumns = CONFIGURABLE_COLUMNS.filter(col => visibleColumns.includes(col.key));

  // Общее количество колонок включая замороженные
  const totalColumnsCount = displayedColumns.length + 3; // +3 за Игрок, Команда, Поз

  return (
    <div className="space-y-6">
      {/* Заголовок и тумблер */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">База данных футболистов</h1>
          <p className="text-gray-600">
            Все игроки со статистикой ({displayedColumns.length} из {CONFIGURABLE_COLUMNS.length} параметров)
          </p>
        </div>

        {/* Тумблер TOTAL / PER90 */}
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => {
              setSliceType('TOTAL');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              sliceType === 'TOTAL'
                ? 'bg-white text-blue-600 shadow'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Всего
          </button>
          <button
            onClick={() => {
              setSliceType('PER90');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              sliceType === 'PER90'
                ? 'bg-white text-blue-600 shadow'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            За 90 минут
          </button>
        </div>
      </div>

      {/* Поиск и настройки */}
      <Card>
        <CardContent>
          <div className="flex gap-4 items-center">
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Начните вводить имя игрока или команду..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Кнопка настройки колонок */}
            <TableColumnsSettings
              columns={CONFIGURABLE_COLUMNS}
              visibleColumns={visibleColumns}
              onColumnsChange={setVisibleColumns}
              storageKey={STORAGE_KEY}
            />
          </div>
        </CardContent>
      </Card>

      {/* Таблица с замороженными колонками */}
      <Card>
        <CardHeader>
          <CardTitle>
            {search ? `Результаты поиска: ${totalCount}` : `Всего игроков: ${totalCount}`}
            {' '}
            <span className="text-sm font-normal text-gray-500">
              ({sliceType === 'TOTAL' ? 'суммарная статистика' : 'статистика за 90 минут'})
            </span>
            {sortField && (
              <span className="ml-2 text-sm font-normal text-blue-500">
                Сортировка: {ALL_COLUMNS.find(c => c.key === sortField)?.label} ({sortOrder === 'asc' ? '↑' : '↓'})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Контейнер с горизонтальным скроллом */}
          <div className="relative">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                {/* Заголовки */}
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    {/* Замороженные заголовки - Игрок, Команда, Поз с тенью */}
                    <th
                      onClick={() => handleSort('full_name')}
                      className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 border-b border-gray-200 cursor-pointer group hover:bg-gray-100 sticky left-0 z-20 min-w-[180px]"
                    >
                      <span className="flex items-center whitespace-nowrap">
                        Игрок
                        {renderSortIcon('full_name')}
                      </span>
                    </th>
                    <th
                      onClick={() => handleSort('team_name')}
                      className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 border-b border-gray-200 cursor-pointer group hover:bg-gray-100 sticky left-[180px] z-20 min-w-[140px]"
                    >
                      <span className="flex items-center whitespace-nowrap">
                        Команда
                        {renderSortIcon('team_name')}
                      </span>
                    </th>
                    <th
                      className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 border-b border-gray-200 sticky left-[320px] z-20 w-[60px]"
                      style={{ boxShadow: '4px 0 6px -2px rgba(0, 0, 0, 0.1)' }}
                    >
                      <span className="whitespace-nowrap">Поз</span>
                    </th>
                    
                    {/* Скроллящиеся заголовки - только видимые */}
                    {displayedColumns.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 border-b border-gray-200 cursor-pointer group hover:bg-gray-100 whitespace-nowrap"
                        title={col.label}
                      >
                        <span className="flex items-center justify-end">
                          {col.shortLabel || col.label}
                          {renderSortIcon(col.key)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Тело таблицы */}
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan={totalColumnsCount} className="px-6 py-12 text-center">
                        <div className="flex items-center justify-center">
                          <svg className="animate-spin h-8 w-8 text-blue-500 mr-3" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span className="text-gray-500">Загрузка данных...</span>
                        </div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={totalColumnsCount} className="px-6 py-12 text-center text-red-600">
                        Ошибка загрузки данных
                      </td>
                    </tr>
                  ) : players.length === 0 ? (
                    <tr>
                      <td colSpan={totalColumnsCount} className="px-6 py-12 text-center text-gray-500">
                        {search ? 'Ничего не найдено' : 'Нет данных'}
                      </td>
                    </tr>
                  ) : (
                    players.map((player: any, rowIdx: number) => {
                      // Определяем фон строки - полностью непрозрачный
                      const rowBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-[#f9fafb]';
                      
                      return (
                      <tr 
                        key={player.player_id} 
                        onClick={() => setSelectedPlayerId(player.player_id)}
                        className={`hover:bg-blue-50 transition-colors cursor-pointer ${rowBg}`}
                      >
                        {/* Замороженные ячейки - Игрок, Команда, Поз с непрозрачным фоном и тенью */}
                        <td 
                          className={`px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline sticky left-0 z-10 min-w-[180px] whitespace-nowrap ${rowBg}`}
                          style={{ boxShadow: 'none' }}
                        >
                          {player.full_name}
                        </td>
                        <td 
                          className={`px-3 py-2 text-sm text-gray-600 sticky left-[180px] z-10 min-w-[140px] whitespace-nowrap ${rowBg}`}
                          style={{ boxShadow: 'none' }}
                        >
                          {player.team_name}
                        </td>
                        <td 
                          className={`px-3 py-2 text-sm sticky left-[320px] z-10 w-[60px] ${rowBg}`}
                          style={{ boxShadow: '4px 0 6px -2px rgba(0, 0, 0, 0.1)' }}
                        >
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800">
                            {player.position_code}
                          </span>
                        </td>
                        
                        {/* Скроллящиеся ячейки - только видимые */}
                        {displayedColumns.map((col) => {
                          const value = player[col.key];
                          const formattedValue = formatValue(value, col);
                          
                          // Специальные стили для определённых колонок
                          let cellClass = 'px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap';
                          if (col.key === 'goals' || col.key === 'assists') cellClass += ' font-semibold';
                          if (col.isXg) cellClass += ' text-purple-600 font-medium';
                          if (col.key === 'yellow_cards') cellClass += ' text-yellow-600';
                          if (col.key === 'red_cards') cellClass += ' text-red-600';
                          if (col.isPercent) cellClass += ' text-gray-500';
                          
                          return (
                            <td key={col.key} className={cellClass}>
                              {formattedValue}
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Пагинация */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Показано {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalCount)} из {totalCount}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ← Назад
                </button>
                <span className="text-sm text-gray-600">
                  Страница {currentPage} из {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Вперед →
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
