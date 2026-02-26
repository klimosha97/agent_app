/**
 * Компонент настройки видимых колонок таблицы
 * Позволяет пользователю выбрать какие параметры показывать
 */

import React, { useState, useEffect } from 'react';
import { XMarkIcon, Cog6ToothIcon, CheckIcon } from '@heroicons/react/24/outline';

interface ColumnDef {
  key: string;
  label: string;
  shortLabel?: string;
  isPercent?: boolean;
  isXg?: boolean;
  group?: string;
}

interface TableColumnsSettingsProps {
  columns: ColumnDef[];
  visibleColumns: string[];
  onColumnsChange: (columns: string[]) => void;
  storageKey: string; // Ключ для localStorage
}

// Группировка колонок
const COLUMN_GROUPS = [
  { id: 'Основное', label: '📊 Основное' },
  { id: 'Голы', label: '⚽ Голы и результативность' },
  { id: 'Удары', label: '🎯 Удары' },
  { id: 'Передачи', label: '🔄 Передачи' },
  { id: 'Единоборства', label: '💪 Единоборства' },
  { id: 'Обводки', label: '🏃 Обводки' },
  { id: 'Защита', label: '🛡️ Защита' },
  { id: 'ТТД', label: '📈 ТТД' },
  { id: 'Продвижение', label: '⬆️ Продвижение' },
  { id: 'Потери', label: '❌ Потери' },
  { id: 'Дисциплина', label: '🟨 Дисциплина' },
];

export const TableColumnsSettings: React.FC<TableColumnsSettingsProps> = ({
  columns,
  visibleColumns,
  onColumnsChange,
  storageKey,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempSelection, setTempSelection] = useState<string[]>(visibleColumns);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<string[]>(COLUMN_GROUPS.map(g => g.id));

  // Синхронизация при открытии
  useEffect(() => {
    if (isOpen) {
      setTempSelection(visibleColumns);
    }
  }, [isOpen, visibleColumns]);

  // Группируем колонки
  const groupedColumns = COLUMN_GROUPS.map(group => ({
    ...group,
    columns: columns.filter(col => col.group === group.id),
  })).filter(group => group.columns.length > 0);

  // Фильтрация по поиску
  const filteredGroups = groupedColumns.map(group => ({
    ...group,
    columns: group.columns.filter(col => 
      col.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (col.shortLabel && col.shortLabel.toLowerCase().includes(searchQuery.toLowerCase()))
    ),
  })).filter(group => group.columns.length > 0);

  const handleToggleColumn = (key: string) => {
    setTempSelection(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const handleToggleGroup = (groupId: string) => {
    const groupColumns = columns.filter(col => col.group === groupId).map(col => col.key);
    const allSelected = groupColumns.every(key => tempSelection.includes(key));
    
    if (allSelected) {
      // Убираем все колонки группы
      setTempSelection(prev => prev.filter(key => !groupColumns.includes(key)));
    } else {
      // Добавляем все колонки группы
      setTempSelection(prev => Array.from(new Set([...prev, ...groupColumns])));
    }
  };

  const handleSelectAll = () => {
    setTempSelection(columns.map(col => col.key));
  };

  const handleDeselectAll = () => {
    // Оставляем минимум - основные колонки
    setTempSelection(['minutes', 'goals', 'assists', 'xg']);
  };

  const handleApply = () => {
    onColumnsChange(tempSelection);
    localStorage.setItem(storageKey, JSON.stringify(tempSelection));
    setIsOpen(false);
  };

  const handleReset = () => {
    const defaultColumns = columns.map(col => col.key);
    setTempSelection(defaultColumns);
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const selectedCount = tempSelection.length;
  const totalCount = columns.length;

  return (
    <>
      {/* Кнопка открытия */}
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all"
      >
        <Cog6ToothIcon className="w-4 h-4 mr-2" />
        Настроить таблицу
        <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
          {selectedCount}/{totalCount}
        </span>
      </button>

      {/* Модальное окно */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Настройка колонок таблицы</h2>
                  <p className="text-sm text-gray-500">Выберите параметры для отображения</p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Toolbar */}
              <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-3">
                  {/* Поиск */}
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Поиск параметров..."
                      className="w-full pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  {/* Быстрые действия */}
                  <button
                    onClick={handleSelectAll}
                    className="px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    Выбрать все
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Минимум
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Сброс
                  </button>
                </div>
                
                {/* Счетчик */}
                <div className="mt-2 text-xs text-gray-500">
                  Выбрано: <span className="font-semibold text-blue-600">{selectedCount}</span> из {totalCount} параметров
                </div>
              </div>

              {/* Content - scrollable */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {filteredGroups.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    Ничего не найдено
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredGroups.map((group) => {
                      const groupColumns = group.columns.map(col => col.key);
                      const selectedInGroup = groupColumns.filter(key => tempSelection.includes(key)).length;
                      const allSelected = selectedInGroup === groupColumns.length;
                      const someSelected = selectedInGroup > 0 && selectedInGroup < groupColumns.length;
                      const isExpanded = expandedGroups.includes(group.id);

                      return (
                        <div key={group.id} className="border border-gray-200 rounded-lg overflow-hidden">
                          {/* Group header */}
                          <div 
                            className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                            onClick={() => toggleGroupExpand(group.id)}
                          >
                            <div className="flex items-center gap-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleGroup(group.id);
                                }}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                  allSelected 
                                    ? 'bg-blue-500 border-blue-500' 
                                    : someSelected 
                                      ? 'bg-blue-200 border-blue-400'
                                      : 'border-gray-300 hover:border-gray-400'
                                }`}
                              >
                                {allSelected && <CheckIcon className="w-3 h-3 text-white" />}
                                {someSelected && <div className="w-2 h-0.5 bg-blue-500 rounded" />}
                              </button>
                              <span className="font-medium text-gray-900">{group.label}</span>
                              <span className="text-xs text-gray-500">
                                ({selectedInGroup}/{groupColumns.length})
                              </span>
                            </div>
                            <svg 
                              className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                              fill="none" 
                              viewBox="0 0 24 24" 
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>

                          {/* Group columns */}
                          {isExpanded && (
                            <div className="px-4 py-3 grid grid-cols-2 gap-2">
                              {group.columns.map((col) => {
                                const isSelected = tempSelection.includes(col.key);
                                return (
                                  <label
                                    key={col.key}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                      isSelected 
                                        ? 'bg-blue-50 hover:bg-blue-100' 
                                        : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleToggleColumn(col.key)}
                                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <span className={`text-sm ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
                                      {col.label}
                                      {col.shortLabel && col.shortLabel !== col.label && (
                                        <span className="text-xs text-gray-400 ml-1">({col.shortLabel})</span>
                                      )}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleApply}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Применить ({selectedCount})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TableColumnsSettings;


