/**
 * Тумблер для переключения типа статистики
 */

import React from 'react';

export type StatType = 'total' | 'avg_match' | 'avg_90min';

interface StatTypeToggleProps {
  value: StatType;
  onChange: (value: StatType) => void;
  showAvgMatch?: boolean; // Для тура avg_match не нужен
  className?: string;
}

export const StatTypeToggle: React.FC<StatTypeToggleProps> = ({
  value,
  onChange,
  showAvgMatch = true,
  className = ''
}) => {
  const options = showAvgMatch 
    ? [
        { id: 'total' as StatType, label: 'Всего' },
        { id: 'avg_match' as StatType, label: 'За матч' },
        { id: 'avg_90min' as StatType, label: 'За 90 мин' },
      ]
    : [
        { id: 'total' as StatType, label: 'Всего' },
        { id: 'avg_90min' as StatType, label: 'За 90 мин' },
      ];

  return (
    <div className={`inline-flex rounded-lg bg-gray-100 p-1 ${className}`}>
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onChange(option.id)}
          className={`
            px-4 py-2 text-sm font-medium rounded-md transition-all duration-200
            ${value === option.id 
              ? 'bg-white text-blue-600 shadow-sm' 
              : 'text-gray-600 hover:text-gray-900'
            }
          `}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

