# Dockerfile для FastAPI бэкенда приложения статистики футболистов

# Используем официальный Python образ
FROM python:3.11-slim

# Устанавливаем метаданные
LABEL maintainer="Football Stats App"
LABEL description="FastAPI backend for football players statistics analysis"

# Устанавливаем рабочую директорию
WORKDIR /app

# Создаем пользователя для безопасности (не root)
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --gid 1001 --no-create-home appuser

# Устанавливаем системные зависимости для PostgreSQL и pandas
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Копируем файл зависимостей
COPY requirements.txt .

# Устанавливаем Python зависимости
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Копируем код приложения
COPY . .

# Создаем необходимые директории
RUN mkdir -p /uploads /app/logs && \
    chown -R appuser:appgroup /app /uploads

# Переключаемся на непривилегированного пользователя
USER appuser

# Открываем порт
EXPOSE 8000

# Переменные окружения
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Команда для запуска в production
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# Для development режима команда переопределяется в docker-compose.yml
# команда: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload


