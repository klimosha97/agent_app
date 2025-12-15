/**
 * Модальное окно для загрузки файлов турнира
 * С выбором тура и сезона через ползунки
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  XMarkIcon, 
  DocumentArrowUpIcon, 
  CheckCircleIcon, 
  ExclamationCircleIcon,
  InformationCircleIcon,
  CalendarIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { apiService } from '../services/api';

interface TournamentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentId: number;
  tournamentName: string;
  onSuccess?: () => void;
}

interface FileSlot {
  id: 'total' | 'per90';
  label: string;
  description: string;
  file: File | null;
  status: 'pending' | 'uploading' | 'success' | 'error';
  message?: string;
}

interface LastUploadInfo {
  tournamentId: number;
  season: number;
  round: number;
  uploadedAt: string;
}

// Ключ для localStorage
const LAST_UPLOAD_KEY = 'football_stats_last_upload';

// Получить последнюю загрузку для турнира
const getLastUpload = (tournamentId: number): LastUploadInfo | null => {
  try {
    const data = localStorage.getItem(`${LAST_UPLOAD_KEY}_${tournamentId}`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

// Сохранить последнюю загрузку
const saveLastUpload = (info: LastUploadInfo) => {
  localStorage.setItem(`${LAST_UPLOAD_KEY}_${info.tournamentId}`, JSON.stringify(info));
};

export const TournamentUploadModal: React.FC<TournamentUploadModalProps> = ({
  isOpen,
  onClose,
  tournamentId,
  tournamentName,
  onSuccess
}) => {
  // Получаем последнюю загрузку для этого турнира
  const lastUpload = getLastUpload(tournamentId);
  const currentYear = new Date().getFullYear();
  
  // Состояния для тура и сезона
  const [season, setSeason] = useState<number>(lastUpload?.season || currentYear);
  const [round, setRound] = useState<number>(lastUpload ? lastUpload.round + 1 : 1);
  
  const [slots, setSlots] = useState<FileSlot[]>([
    {
      id: 'total',
      label: 'Всего за сезон',
      description: 'Суммарная статистика (mfl.xlsx)',
      file: null,
      status: 'pending'
    },
    {
      id: 'per90',
      label: 'За 90 минут',
      description: 'Средняя статистика (mfl_average90.xlsx)',
      file: null,
      status: 'pending'
    }
  ]);

  const [isUploading, setIsUploading] = useState(false);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Обновляем значения при открытии модалки
  useEffect(() => {
    if (isOpen) {
      const lastUpload = getLastUpload(tournamentId);
      if (lastUpload) {
        setSeason(lastUpload.season);
        setRound(Math.min(lastUpload.round + 1, 50)); // +1 тур, максимум 50
      } else {
        setSeason(currentYear);
        setRound(1);
      }
    }
  }, [isOpen, tournamentId, currentYear]);

  // Проверяем, выбраны ли оба файла
  const allFilesSelected = slots.every(slot => slot.file !== null);
  const missingFiles = slots.filter(slot => !slot.file).map(s => s.label);

  const handleFileSelect = (slotId: 'total' | 'per90', file: File | null) => {
    setSlots(prev => prev.map(slot =>
      slot.id === slotId
        ? { ...slot, file, status: 'pending', message: undefined }
        : slot
    ));
  };

  const handleUpload = async () => {
    if (!allFilesSelected) {
      window.alert(`Необходимо выбрать ОБА файла!\n\nНе выбраны:\n${missingFiles.map(f => '• ' + f).join('\n')}`);
      return;
    }

    setIsUploading(true);
    let hasErrors = false;

    for (const slot of slots) {
      // Устанавливаем статус загрузки
      setSlots(prev => prev.map(s =>
        s.id === slot.id ? { ...s, status: 'uploading' } : s
      ));

      try {
        await apiService.uploadTournamentFile(
          slot.file!,
          tournamentId,
          slot.id === 'total' ? 'TOTAL' : 'PER90',
          String(season),
          round
        );

        setSlots(prev => prev.map(s =>
          s.id === slot.id ? { ...s, status: 'success', message: 'Успешно загружено' } : s
        ));
      } catch (error: any) {
        hasErrors = true;
        setSlots(prev => prev.map(s =>
          s.id === slot.id
            ? { ...s, status: 'error', message: error.response?.data?.detail || error.message }
            : s
        ));
      }
    }

    setIsUploading(false);

    if (!hasErrors) {
      // Сохраняем информацию о последней загрузке
      saveLastUpload({
        tournamentId,
        season,
        round,
        uploadedAt: new Date().toISOString()
      });

      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
          handleClose();
        }, 1500);
      }
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setSlots([
        {
          id: 'total',
          label: 'Всего за сезон',
          description: 'Суммарная статистика (mfl.xlsx)',
          file: null,
          status: 'pending'
        },
        {
          id: 'per90',
          label: 'За 90 минут',
          description: 'Средняя статистика (mfl_average90.xlsx)',
          file: null,
          status: 'pending'
        }
      ]);
      onClose();
    }
  };

  // Форматирование даты
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Загрузка данных турнира
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {tournamentName}
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={isUploading}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              <XMarkIcon className="w-7 h-7" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            
            {/* Напоминание о последней загрузке */}
            {lastUpload && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <InformationCircleIcon className="w-6 h-6 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">Последняя загрузка:</p>
                    <p className="flex items-center">
                      <CalendarIcon className="w-4 h-4 mr-1" />
                      Сезон {lastUpload.season}, туры 1-{lastUpload.round}
                    </p>
                    <p className="flex items-center mt-1 text-blue-600">
                      <ClockIcon className="w-4 h-4 mr-1" />
                      {formatDate(lastUpload.uploadedAt)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Выбор сезона и тура */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-amber-900 mb-4 flex items-center">
                <CalendarIcon className="w-6 h-6 mr-2" />
                Параметры загрузки
              </h3>

              {/* Сезон */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-amber-800">
                    Сезон
                  </label>
                  <span className="text-2xl font-bold text-amber-900">{season}</span>
                </div>
                <input
                  type="range"
                  min="2020"
                  max="2070"
                  value={season}
                  onChange={(e) => setSeason(parseInt(e.target.value))}
                  disabled={isUploading}
                  className="w-full h-3 bg-amber-200 rounded-lg appearance-none cursor-pointer slider-amber"
                />
                <div className="flex justify-between text-xs text-amber-600 mt-1">
                  <span>2020</span>
                  <span>2070</span>
                </div>
              </div>

              {/* Тур */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-amber-800">
                    Загружаемый тур (1-{round})
                  </label>
                  <span className="text-2xl font-bold text-amber-900">Тур {round}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={round}
                  onChange={(e) => setRound(parseInt(e.target.value))}
                  disabled={isUploading}
                  className="w-full h-3 bg-amber-200 rounded-lg appearance-none cursor-pointer slider-amber"
                />
                <div className="flex justify-between text-xs text-amber-600 mt-1">
                  <span>1</span>
                  <span>50</span>
                </div>
              </div>

              {/* Итоговая информация */}
              <div className="mt-4 p-3 bg-white/70 rounded-lg border border-amber-300">
                <p className="text-sm text-amber-900 font-medium text-center">
                  📊 Будут записаны данные: <strong>Сезон {season}, туры 1-{round}</strong>
                </p>
              </div>
            </div>

            {/* Слоты для файлов */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700 flex items-center">
                <DocumentArrowUpIcon className="w-5 h-5 mr-2" />
                Выберите файлы для загрузки
              </h3>
              
              {slots.map((slot) => (
                <div
                  key={slot.id}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    slot.status === 'success'
                      ? 'border-green-300 bg-green-50'
                      : slot.status === 'error'
                      ? 'border-red-300 bg-red-50'
                      : slot.status === 'uploading'
                      ? 'border-blue-300 bg-blue-50'
                      : slot.file
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 flex items-center">
                        {slot.label}
                        {!slot.file && (
                          <span className="ml-2 text-red-500 text-sm">*обязательно</span>
                        )}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">{slot.description}</p>

                      {slot.file && (
                        <p className="text-sm text-blue-600 mt-2 flex items-center">
                          <DocumentArrowUpIcon className="w-5 h-5 mr-1" />
                          {slot.file.name}
                        </p>
                      )}

                      {slot.message && (
                        <p className={`text-sm mt-2 flex items-center ${
                          slot.status === 'success' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {slot.status === 'success'
                            ? <CheckCircleIcon className="w-5 h-5 mr-1" />
                            : <ExclamationCircleIcon className="w-5 h-5 mr-1" />
                          }
                          {slot.message}
                        </p>
                      )}
                    </div>

                    <div className="ml-4">
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        ref={(el) => fileInputRefs.current[slot.id] = el}
                        onChange={(e) => handleFileSelect(slot.id, e.target.files?.[0] || null)}
                        className="hidden"
                        disabled={isUploading}
                      />

                      {slot.status === 'uploading' ? (
                        <div className="w-24 h-12 flex items-center justify-center">
                          <svg className="animate-spin h-7 w-7 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </div>
                      ) : slot.status === 'success' ? (
                        <CheckCircleIcon className="w-12 h-12 text-green-500" />
                      ) : (
                        <button
                          onClick={() => fileInputRefs.current[slot.id]?.click()}
                          disabled={isUploading}
                          className={`px-5 py-2.5 rounded-lg font-medium transition-colors text-base ${
                            slot.file
                              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          } disabled:opacity-50`}
                        >
                          {slot.file ? 'Изменить' : 'Выбрать файл'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            {!allFilesSelected && !isUploading && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-amber-800 text-sm flex items-center">
                  <ExclamationCircleIcon className="w-6 h-6 mr-2 flex-shrink-0" />
                  Для загрузки необходимо выбрать оба файла
                </p>
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handleClose}
                disabled={isUploading}
                className="px-5 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-base"
              >
                Отмена
              </button>
              <button
                onClick={handleUpload}
                disabled={isUploading || !allFilesSelected}
                className="px-7 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center text-base font-medium"
              >
                {isUploading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Загрузка...
                  </>
                ) : (
                  <>
                    <DocumentArrowUpIcon className="w-6 h-6 mr-2" />
                    Загрузить файлы
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Стили для ползунков */}
      <style>{`
        .slider-amber::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
          border: 3px solid white;
        }
        
        .slider-amber::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
          border: 3px solid white;
        }
        
        .slider-amber:focus::-webkit-slider-thumb {
          box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.3);
        }
      `}</style>
    </div>
  );
};
