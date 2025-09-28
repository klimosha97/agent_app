/**
 * Компонент таблицы с сортировкой и пагинацией
 */

import React from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { classNames } from '../../utils';

// === Базовые компоненты таблицы ===

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export const Table: React.FC<TableProps> = ({ children, className }) => (
  <div className="shadow ring-1 ring-black ring-opacity-5 rounded-lg">
    <div className="max-h-[70vh] overflow-y-auto overflow-x-auto">
      <table className={classNames('min-w-full divide-y divide-gray-300', className)}>
        {children}
      </table>
    </div>
  </div>
);

interface TableHeadProps {
  children: React.ReactNode;
  className?: string;
}

export const TableHead: React.FC<TableHeadProps> = ({ children, className }) => (
  <thead className={classNames('bg-gray-50', className)}>
    {children}
  </thead>
);

interface TableBodyProps {
  children: React.ReactNode;
  className?: string;
}

export const TableBody: React.FC<TableBodyProps> = ({ children, className }) => (
  <tbody className={classNames('divide-y divide-gray-200 bg-white', className)}>
    {children}
  </tbody>
);

interface TableRowProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export const TableRow: React.FC<TableRowProps> = ({ 
  children, 
  className, 
  hover = false,
  onClick 
}) => (
  <tr
    className={classNames(
      hover && 'hover:bg-gray-50',
      onClick && 'cursor-pointer',
      className
    )}
    onClick={onClick}
  >
    {children}
  </tr>
);

// === Ячейки таблицы ===

interface TableHeaderProps {
  children: React.ReactNode;
  className?: string;
  sortable?: boolean;
  sorted?: 'asc' | 'desc' | null;
  onSort?: () => void;
  align?: 'left' | 'center' | 'right';
}

export const TableHeader: React.FC<TableHeaderProps> = ({
  children,
  className,
  sortable = false,
  sorted = null,
  onSort,
  align = 'left',
}) => {
  const content = (
    <div className="flex items-center space-x-1">
      <span>{children}</span>
      {sortable && (
        <div className="flex flex-col">
          <ChevronUpIcon
            className={classNames(
              'h-3 w-3',
              sorted === 'asc' ? 'text-gray-900' : 'text-gray-400'
            )}
          />
          <ChevronDownIcon
            className={classNames(
              'h-3 w-3 -mt-0.5',
              sorted === 'desc' ? 'text-gray-900' : 'text-gray-400'
            )}
          />
        </div>
      )}
    </div>
  );

  return (
    <th
      scope="col"
      className={classNames(
        'px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider',
        align === 'left' && 'text-left',
        align === 'center' && 'text-center',
        align === 'right' && 'text-right',
        sortable && 'cursor-pointer hover:bg-gray-100',
        className
      )}
      onClick={sortable ? onSort : undefined}
    >
      {content}
    </th>
  );
};

interface TableCellProps {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  colSpan?: number;
}

export const TableCell: React.FC<TableCellProps> = ({
  children,
  className,
  align = 'left',
  colSpan,
}) => {
  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <td
      className={classNames(
        'px-6 py-4 whitespace-nowrap text-sm text-gray-900',
        alignClasses[align],
        className
      )}
      colSpan={colSpan}
    >
      {children}
    </td>
  );
};

// === Специализированные компоненты ===

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  colSpan?: number;
}

export const EmptyTableState: React.FC<EmptyStateProps> = ({
  title,
  description,
  action,
  colSpan = 1,
}) => (
  <TableRow>
    <TableCell className="text-center py-12" align="center" colSpan={colSpan}>
      <div className="flex flex-col items-center">
        <div className="text-gray-400 mb-4">
          <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
        {description && (
          <p className="text-gray-500 mb-4">{description}</p>
        )}
        {action}
      </div>
    </TableCell>
  </TableRow>
);

interface LoadingRowProps {
  columns: number;
}

export const LoadingTableRow: React.FC<LoadingRowProps> = ({ columns }) => (
  <TableRow>
    {Array.from({ length: columns }).map((_, index) => (
      <TableCell key={index}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </TableCell>
    ))}
  </TableRow>
);

// === Пагинация ===

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  className?: string;
}

export const TablePagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  className,
}) => {
  const startItem = Math.min((currentPage - 1) * itemsPerPage + 1, totalItems);
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className={classNames(
      'bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6',
      className
    )}>
      <div className="flex-1 flex justify-between sm:hidden">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Назад
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Вперёд
        </button>
      </div>

      <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
        <div className="flex items-center space-x-2">
          <p className="text-sm text-gray-700">
            Показано <span className="font-medium">{startItem}</span> - <span className="font-medium">{endItem}</span> из{' '}
            <span className="font-medium">{totalItems}</span> результатов
          </p>

          {onItemsPerPageChange && (
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="ml-4 border-gray-300 rounded-md text-sm"
            >
              <option value={25}>25 на странице</option>
              <option value={50}>50 на странице</option>
              <option value={100}>100 на странице</option>
              <option value={200}>200 на странице</option>
            </select>
          )}
        </div>

        <div>
          <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Предыдущая</span>
              <ChevronDownIcon className="h-5 w-5 rotate-90" />
            </button>

            {/* Номера страниц */}
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNumber: number;
              if (totalPages <= 7) {
                pageNumber = i + 1;
              } else if (currentPage <= 4) {
                pageNumber = i + 1;
              } else if (currentPage >= totalPages - 3) {
                pageNumber = totalPages - 6 + i;
              } else {
                pageNumber = currentPage - 3 + i;
              }

              return (
                <button
                  key={pageNumber}
                  onClick={() => onPageChange(pageNumber)}
                  className={classNames(
                    'relative inline-flex items-center px-4 py-2 border text-sm font-medium',
                    pageNumber === currentPage
                      ? 'z-10 bg-primary-50 border-primary-500 text-primary-600'
                      : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                  )}
                >
                  {pageNumber}
                </button>
              );
            })}

            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Следующая</span>
              <ChevronDownIcon className="h-5 w-5 -rotate-90" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
};








