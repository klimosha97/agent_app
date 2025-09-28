/**
 * Точка входа React приложения
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Проверяем поддержку браузера
if (typeof document !== 'undefined' && document.getElementById('root')) {
  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
  );

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error('Root element not found. Make sure you have a <div id="root"></div> in your HTML.');
}













