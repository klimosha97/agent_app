/**
 * Страница "Отслеживаемые футболисты"
 * ЗАГЛУШКА - таблицы ещё не созданы
 */

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';

export const TrackedPlayers: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Отслеживаемые футболисты</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-6 shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Функционал в разработке
            </h2>
            <p className="text-gray-500 text-center max-w-md mb-6">
              Здесь будут отображаться игроки для наблюдения. 
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
