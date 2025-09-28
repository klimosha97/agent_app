/**
 * Заголовок приложения
 */

import React from 'react';
import { useAppHealth } from '../hooks/useApi';
import { Badge } from './ui/Badge';

export const AppHeader: React.FC = () => {
  const { data: health } = useAppHealth();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Логотип и название */}
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center">
                {/* Иконка футбольного мяча */}
                <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v-.07zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                </div>
                <div className="ml-3">
                  <h1 className="text-xl font-bold text-gray-900">
                    Статистика Футболистов
                  </h1>
                  <p className="text-sm text-gray-500">
                    Анализ и отслеживание игроков
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Статус подключения и информация */}
          <div className="flex items-center space-x-4">
            {/* Статус API */}
            <div className="flex items-center space-x-2">
              <div className="text-sm text-gray-500">API:</div>
              {health ? (
                <Badge
                  variant={health.status === 'healthy' ? 'green' : 'red'}
                  size="sm"
                >
                  {health.status === 'healthy' ? 'Онлайн' : 'Офлайн'}
                </Badge>
              ) : (
                <Badge variant="yellow" size="sm">
                  Проверка...
                </Badge>
              )}
            </div>

            {/* Версия приложения */}
            <div className="hidden sm:flex items-center space-x-2">
              <div className="text-sm text-gray-500">v1.0.0</div>
            </div>

            {/* Кнопка настроек (пока заглушка) */}
            <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};













