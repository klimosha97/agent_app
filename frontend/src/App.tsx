/**
 * Главный компонент приложения
 */

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ReactQueryDevtools } from 'react-query/devtools';

// Импорты компонентов
import { Navigation } from './components/Navigation';
import { MyPlayers } from './pages/MyPlayers';
import { Tournaments } from './pages/Tournaments';
import { TrackedPlayers } from './pages/TrackedPlayers';
import { TopPerformers } from './pages/TopPerformers';
import { Database } from './pages/Database';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppHeader } from './components/AppHeader';

// Стили
import './index.css';

// Создаём клиент для React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 минут
    },
  },
});

// Типы для вкладок
export type TabId = 'my-players' | 'tournaments' | 'tracked-players' | 'top-performers' | 'database';

interface Tab {
  id: TabId;
  name: string;
  component: React.ComponentType;
  icon?: React.ReactNode;
}

// Конфигурация вкладок
const tabs: Tab[] = [
  {
    id: 'my-players',
    name: 'Мои футболисты',
    component: MyPlayers,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    id: 'tournaments',
    name: 'Турниры',
    component: Tournaments,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    id: 'tracked-players',
    name: 'Отслеживаемые футболисты',
    component: TrackedPlayers,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
  {
    id: 'top-performers',
    name: 'Топ выступления за неделю',
    component: TopPerformers,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: 'database',
    name: 'База данных',
    component: Database,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
  },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('my-players');

  // Находим активную вкладку
  const currentTab = tabs.find((tab) => tab.id === activeTab);
  const CurrentTabComponent = currentTab?.component || MyPlayers;

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <div className="min-h-screen bg-gray-50">
          {/* Заголовок приложения */}
          <AppHeader />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Навигация по вкладкам */}
            <Navigation
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />

            {/* Основной контент */}
            <main className="py-6">
              <div className="animate-fade-in">
                <CurrentTabComponent />
              </div>
            </main>
          </div>

          {/* Футер */}
          <footer className="bg-white border-t border-gray-200 mt-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="text-center text-sm text-gray-500">
                <p>
                  Приложение для анализа статистики футболистов v1.0.0
                </p>
                <p className="mt-1">
                  Создано с ❤️ для анализа футбольных данных
                </p>
              </div>
            </div>
          </footer>
        </div>
      </ErrorBoundary>

      {/* React Query DevTools (только в dev режиме) */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

export default App;











