/**
 * Страница "Топ выступления за неделю"
 * ЗАГЛУШКА - таблицы ещё не созданы
 */

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';

export const TopPerformers: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Топ выступления за неделю</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center mb-6 shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Функционал в разработке
            </h2>
            <p className="text-gray-500 text-center max-w-md mb-6">
              Здесь будут отображаться лучшие выступления игроков за последний тур. 
              Таблицы для хранения данных создаются заново.
            </p>
            <div className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg font-medium">
              🚧 В разработке
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
