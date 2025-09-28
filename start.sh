#!/bin/bash

# Скрипт для быстрого запуска приложения статистики футболистов
# Автоматизирует первоначальную настройку и запуск всех сервисов

set -e  # Остановка при любой ошибке

echo "🚀 Запуск приложения для анализа статистики футболистов"
echo "================================================================"

# #Проверяем наличие Docker и Docker Compose
# echo "📋 Проверка системных требований..."

# if ! command -v docker &> /dev/null; then
#     echo "❌ Docker не установлен. Пожалуйста, установите Docker."
#     exit 1
# fi

# if ! command -v docker-compose &> /dev/null; then
#     echo "❌ Docker Compose не установлен. Пожалуйста, установите Docker Compose."
#     exit 1
# fi

# echo "✅ Docker и Docker Compose найдены"

# # Создаем необходимые директории
# echo "📁 Создание необходимых директорий..."
# mkdir -p uploads
# mkdir -p logs
# mkdir -p backend/logs

# # Устанавливаем права доступа
# chmod 755 uploads
# chmod 755 logs

# echo "✅ Директории созданы"

# # Останавливаем контейнеры если они уже запущены
# echo "🛑 Остановка существующих контейнеров..."
# docker-compose down -v || true

# # Удаляем старые образы (опционально)
# if [[ "$1" == "--clean" ]]; then
#     echo "🧹 Очистка старых образов..."
#     docker-compose down --rmi all -v || true
#     docker system prune -f || true
# fi

# # Сборка образов
# echo "🏗️  Сборка образов..."
# docker-compose build --no-cache

# # Запуск базы данных отдельно для инициализации
# echo "🗄️  Запуск PostgreSQL..."
# docker-compose up -d db

# # Ждём готовности базы данных
# echo "⏳ Ожидание готовности базы данных..."
# sleep 10

# # Проверяем соединение с БД
# echo "🔍 Проверка подключения к базе данных..."
# max_attempts=30
# attempt=1

# while [ $attempt -le $max_attempts ]; do
#     if docker-compose exec -T db pg_isready -U klim -d football_stats &> /dev/null; then
#         echo "✅ База данных готова"
#         break
#     fi
    
#     if [ $attempt -eq $max_attempts ]; then
#         echo "❌ Не удалось подключиться к базе данных после $max_attempts попыток"
#         docker-compose logs db
#         exit 1
#     fi
    
#     echo "⏳ Попытка $attempt/$max_attempts: база данных ещё не готова..."
#     sleep 2
#     ((attempt++))
# done

# # Запуск миграций Alembic
# echo "🔄 Создание первоначальной миграции..."
# docker-compose run --rm backend alembic revision --autogenerate -m "Initial migration"

echo "📊 Применение миграций..."
docker-compose run --rm backend alembic upgrade head

#Запуск всех сервисов
echo "🌟 Запуск всех сервисов..."
docker-compose up -d

# Ждём готовности бэкенда
echo "⏳ Ожидание готовности бэкенда..."
backend_ready=false
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    if curl -f http://localhost:8000/health &> /dev/null; then
        backend_ready=true
        echo "✅ Бэкенд готов"
        break
    fi
    
    if [ $attempt -eq $max_attempts ]; then
        echo "❌ Бэкенд не готов после $max_attempts попыток"
        docker-compose logs backend
        break
    fi
    
    echo "⏳ Попытка $attempt/$max_attempts: бэкенд ещё не готов..."
    sleep 3
    ((attempt++))
done

# Ждём готовности фронтенда
echo "⏳ Ожидание готовности фронтенда..."
frontend_ready=false
max_attempts=20
attempt=1

while [ $attempt -le $max_attempts ]; do
    if curl -f http://localhost:3000 &> /dev/null; then
        frontend_ready=true
        echo "✅ Фронтенд готов"
        break
    fi
    
    if [ $attempt -eq $max_attempts ]; then
        echo "❌ Фронтенд не готов после $max_attempts попыток"
        docker-compose logs frontend
        break
    fi
    
    echo "⏳ Попытка $attempt/$max_attempts: фронтенд ещё не готов..."
    sleep 5
    ((attempt++))
done

echo ""
echo "================================================================"
echo "🎉 Приложение успешно запущено!"
echo ""
echo "📋 Доступные сервисы:"
echo "   🌐 Фронтенд:     http://localhost:3000"
echo "   🔌 Backend API:   http://localhost:8000"
echo "   📖 API документация: http://localhost:8000/docs"
echo "   🗄️  Adminer (БД):  http://localhost:8080"
echo ""
echo "📊 Данные для подключения к БД:"
echo "   Хост: localhost:5432"
echo "   Пользователь: klim"
echo "   Пароль: Orel1997"
echo "   База данных: football_stats"
echo ""
echo "📁 Важные директории:"
echo "   📂 Загрузки Excel: ./uploads"
echo "   📜 Логи: ./logs"
echo ""
echo "🔧 Управление:"
echo "   Остановка: docker-compose down"
echo "   Логи: docker-compose logs -f [сервис]"
echo "   Рестарт: docker-compose restart [сервис]"
echo ""
echo "📖 Для начала работы:"
echo "   1. Откройте http://localhost:3000"
echo "   2. Перейдите на вкладку 'Турниры'"
echo "   3. Загрузите файл yfl1.xlsx через кнопку загрузки"
echo "   4. Изучите данные и добавьте игроков в отслеживание"
echo ""

# Показываем статус контейнеров
echo "📊 Статус контейнеров:"
docker-compose ps

echo ""
echo "✅ Готово! Приложение работает и доступно по адресам выше."
echo "================================================================"



