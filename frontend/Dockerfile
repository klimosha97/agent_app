# Dockerfile для React фронтенда приложения статистики футболистов

# Используем официальный Node.js образ
FROM node:18-alpine

# Устанавливаем метаданные
LABEL maintainer="Football Stats App"
LABEL description="React frontend for football players statistics analysis"

# Устанавливаем рабочую директорию
WORKDIR /app

# Создаем пользователя для безопасности
RUN addgroup -g 1001 -S appgroup && \
    adduser -S -u 1001 -g appgroup appuser

# Копируем package.json и package-lock.json (если есть)
COPY package*.json ./

# Устанавливаем зависимости
# Устанавливаем зависимости
RUN npm ci && \
    npm cache clean --force

# Копируем исходный код приложения
COPY . .

# Устанавливаем права на файлы
RUN chown -R appuser:appgroup /app

# Переключаемся на непривилегированного пользователя
USER appuser

# Открываем порт
EXPOSE 3000

# Переменные окружения
ENV REACT_APP_API_BASE_URL=http://localhost:8000/api
ENV NODE_ENV=development
ENV GENERATE_SOURCEMAP=true

# Команда для запуска в development режиме
CMD ["npm", "start"]

# Для production сборки раскомментируйте:
# RUN npm run build
# CMD ["npx", "serve", "-s", "build", "-l", "3000"]


