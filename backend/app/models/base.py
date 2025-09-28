"""
Базовые модели и миксины для всех таблиц базы данных.
Содержит общие поля и функциональность для всех моделей.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base, declared_attr

# Базовый класс для всех моделей
Base = declarative_base()


class TimestampMixin:
    """
    Миксин для добавления временных меток создания и обновления.
    Автоматически добавляет поля created_at и updated_at.
    """
    
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Дата и время создания записи"
    )
    
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="Дата и время последнего обновления записи"
    )


class UUIDMixin:
    """
    Миксин для добавления UUID первичного ключа.
    Автоматически генерирует UUID для новых записей.
    """
    
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        unique=True,
        nullable=False,
        comment="Уникальный идентификатор записи"
    )


class BaseModel(Base, UUIDMixin, TimestampMixin):
    """
    Базовая модель для всех таблиц.
    Включает UUID первичный ключ и временные метки.
    """
    
    __abstract__ = True
    
    @declared_attr
    def __tablename__(cls):
        """Автоматическое создание имени таблицы из имени класса"""
        return cls.__name__.lower()
    
    def to_dict(self) -> dict:
        """
        Преобразование объекта модели в словарь.
        Полезно для сериализации в JSON.
        
        Returns:
            dict: Словарь со всеми полями модели
        """
        result = {}
        for column in self.__table__.columns:
            value = getattr(self, column.name)
            # Преобразуем специальные типы для JSON сериализации
            if isinstance(value, datetime):
                result[column.name] = value.isoformat()
            elif isinstance(value, uuid.UUID):
                result[column.name] = str(value)
            else:
                result[column.name] = value
        return result
    
    def update_from_dict(self, data: dict) -> None:
        """
        Обновление полей модели из словаря.
        Игнорирует поля, которых нет в модели.
        
        Args:
            data: Словарь с данными для обновления
        """
        for key, value in data.items():
            if hasattr(self, key) and key not in ['id', 'created_at']:
                setattr(self, key, value)
    
    def __repr__(self) -> str:
        """Читаемое представление объекта модели"""
        return f"<{self.__class__.__name__}(id={self.id})>"


