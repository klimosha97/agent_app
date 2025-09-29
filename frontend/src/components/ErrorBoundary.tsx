/**
 * Компонент для обработки ошибок приложения
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(error: Error): State {
    // Обновляем состояние, чтобы показать UI ошибки
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Здесь можно отправить ошибку в систему мониторинга
    // например, Sentry, LogRocket и т.д.
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
              <div className="text-center">
                {/* Иконка ошибки */}
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                  <svg
                    className="h-6 w-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>

                {/* Заголовок */}
                <h2 className="mt-4 text-lg font-medium text-gray-900">
                  Произошла ошибка
                </h2>

                {/* Описание */}
                <p className="mt-2 text-sm text-gray-600">
                  К сожалению, в приложении произошла неожиданная ошибка.
                  Пожалуйста, обновите страницу или обратитесь к администратору.
                </p>

                {/* Детали ошибки (только в dev режиме) */}
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="mt-4 text-left">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700">
                      Детали ошибки (dev mode)
                    </summary>
                    <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono text-red-600 overflow-auto max-h-40">
                      <div className="font-semibold">
                        {this.state.error.name}: {this.state.error.message}
                      </div>
                      <div className="mt-2 whitespace-pre-line">
                        {this.state.error.stack}
                      </div>
                      {this.state.errorInfo && (
                        <div className="mt-2">
                          <div className="font-semibold">Component Stack:</div>
                          <div className="whitespace-pre-line">
                            {this.state.errorInfo.componentStack}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {/* Кнопки действий */}
                <div className="mt-6 space-y-3">
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    Обновить страницу
                  </button>
                  
                  <button
                    onClick={() => this.setState({ hasError: false })}
                    className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    Попробовать снова
                  </button>
                </div>

                {/* Контактная информация */}
                <div className="mt-4 text-xs text-gray-500">
                  <p>
                    Если проблема повторяется, обратитесь к администратору.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}














