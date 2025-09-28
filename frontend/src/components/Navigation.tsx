/**
 * Компонент навигации по вкладкам
 */

import React from 'react';
import { classNames } from '../utils';
import { TabId } from '../App';

interface Tab {
  id: TabId;
  name: string;
  icon?: React.ReactNode;
}

interface NavigationProps {
  tabs: Tab[];
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  tabs,
  activeTab,
  onTabChange,
}) => {
  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex space-x-8" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={classNames(
                'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                isActive
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.icon && (
                <span
                  className={classNames(
                    'mr-2 transition-colors',
                    isActive
                      ? 'text-primary-500'
                      : 'text-gray-400 group-hover:text-gray-500'
                  )}
                >
                  {tab.icon}
                </span>
              )}
              <span>{tab.name}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};













