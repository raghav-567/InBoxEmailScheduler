import React, { type ReactNode } from 'react';

export interface Column<T> {
  header: string;
  accessor?: keyof T;
  render?: (row: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyState?: ReactNode;
  rowKey: (row: T) => string;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

export default function Table<T>({
  columns,
  data,
  loading = false,
  emptyState,
  rowKey,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="overflow-x-auto bg-white rounded-xl border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-gray-50/50">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`px-6 py-3.5 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider ${col.className ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} cols={columns.length} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return (
      <div className="bg-white rounded-xl border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-gray-50/50">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`px-6 py-3.5 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider ${col.className ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
        </table>
        {emptyState}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-xl border border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-gray-50/50">
            {columns.map((col, i) => (
              <th
                key={i}
                className={`px-6 py-3.5 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              className="hover:bg-gray-50/50 transition-colors"
            >
              {columns.map((col, i) => (
                <td
                  key={i}
                  className={`px-6 py-4 text-sm text-content-primary whitespace-nowrap ${col.className ?? ''}`}
                >
                  {col.render
                    ? col.render(row)
                    : col.accessor
                      ? String(row[col.accessor] ?? '')
                      : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
