/**
 * Компонент бейджа для отображения статусов и меток
 */

import React from 'react';
import { classNames } from '../../utils';
import { TrackingStatus } from '../../types';
import { getTrackingStatusColor, getTrackingStatusLabel } from '../../utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'gray' | 'red' | 'yellow' | 'green' | 'blue' | 'indigo' | 'purple' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'gray',
  size = 'md',
  className,
}) => {
  const baseClasses = 'inline-flex items-center font-medium rounded-full';

  const variantClasses = {
    gray: 'bg-gray-100 text-gray-800',
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    green: 'bg-green-100 text-green-800',
    blue: 'bg-blue-100 text-blue-800',
    indigo: 'bg-indigo-100 text-indigo-800',
    purple: 'bg-purple-100 text-purple-800',
    warning: 'bg-amber-100 text-amber-800 border border-amber-300',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-0.5 text-sm',
    lg: 'px-3 py-1 text-sm',
  };

  return (
    <span
      className={classNames(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </span>
  );
};

interface TrackingStatusBadgeProps {
  status: TrackingStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const TrackingStatusBadge: React.FC<TrackingStatusBadgeProps> = ({
  status,
  size = 'md',
  className,
}) => {
  const color = getTrackingStatusColor(status);
  const label = getTrackingStatusLabel(status);

  return (
    <Badge
      variant={color as any}
      size={size}
      className={className}
    >
      {label}
    </Badge>
  );
};

interface StatsBadgeProps {
  label: string;
  value: number | string;
  variant?: 'gray' | 'green' | 'blue' | 'yellow';
  className?: string;
}

export const StatsBadge: React.FC<StatsBadgeProps> = ({
  label,
  value,
  variant = 'gray',
  className,
}) => (
  <div className={classNames('flex flex-col items-center', className)}>
    <Badge variant={variant} size="lg">
      {value}
    </Badge>
    <span className="text-xs text-gray-500 mt-1">{label}</span>
  </div>
);













