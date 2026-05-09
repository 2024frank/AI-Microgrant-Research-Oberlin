import { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyText?: string;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyText = "No records found.",
}: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-[var(--surface-high)]">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="border-b border-[var(--border)] px-4 py-2 font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-sm text-[var(--muted)]"
                  colSpan={columns.length}
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={getRowKey(row)}
                  className="border-b border-[var(--border)] last:border-b-0 hover:bg-white/[0.03]"
                >
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3 align-middle text-[var(--text)]">
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
