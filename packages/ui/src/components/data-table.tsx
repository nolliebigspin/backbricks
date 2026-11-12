import {
  createColumnHelper,
  rowSelectionFeature,
  tableFeatures,
  useTable,
  type RowData,
  type RowSelectionState,
} from '@tanstack/react-table';
import { cn } from 'cn';
import type * as React from 'react';

/** One column: plain-text cells by default; `className` can hide it on small screens. */
export type DataTableColumn<T extends RowData> = {
  id: string;
  header: string;
  renderCell: (row: T) => React.ReactNode;
  className?: string;
};

const features = tableFeatures({ rowSelectionFeature });

/**
 * Server-paginated list with optional multi-select (§E.2). Rows come pre-filtered from the
 * server; the table only renders, selects and opens them. Selection is controlled by the caller
 * so it can survive refetches and be cleared after bulk actions.
 */
export function DataTable<T extends RowData>({
  rows,
  columns,
  getRowId,
  caption,
  selection,
  onSelectionChange,
  selectLabel,
  selectAllLabel,
  onOpen,
  openLabel,
}: {
  rows: readonly T[];
  columns: readonly DataTableColumn<T>[];
  getRowId: (row: T) => string;
  /** Accessible name of the table. */
  caption: string;
  selection?: ReadonlySet<string>;
  onSelectionChange?: (selection: Set<string>) => void;
  selectLabel?: (row: T) => string;
  selectAllLabel?: string;
  /** Called with the row when its first column's button is used. */
  onOpen?: (row: T) => void;
  openLabel?: (row: T) => string;
}) {
  const helper = createColumnHelper<typeof features, T>();
  const selectable = selection !== undefined && onSelectionChange !== undefined;
  const rowSelection: RowSelectionState = Object.fromEntries(
    [...(selection ?? [])].map((id) => [id, true]),
  );
  const table = useTable({
    features,
    data: rows,
    getRowId: (row) => getRowId(row),
    enableRowSelection: selectable,
    state: { rowSelection },
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      onSelectionChange?.(new Set(Object.keys(next).filter((id) => next[id])));
    },
    columns: columns.map((column) => helper.display({ id: column.id, header: column.header })),
  });
  const columnClass = (id: string) => columns.find((column) => column.id === id)?.className;
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b text-left text-muted-foreground">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {selectable && (
                <th className="w-10 p-3">
                  <span className="sr-only">{selectAllLabel}</span>
                  <input
                    type="checkbox"
                    aria-label={selectAllLabel}
                    checked={rows.length > 0 && table.getIsAllRowsSelected()}
                    onChange={table.getToggleAllRowsSelectedHandler()}
                  />
                </th>
              )}
              {group.headers.map((header) => (
                <th key={header.id} className={cn('p-3 font-medium', columnClass(header.id))}>
                  {columns.find((column) => column.id === header.id)?.header}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} data-selected={row.getIsSelected() || undefined}>
              {selectable && (
                <td className="p-3">
                  <span className="sr-only">{selectLabel?.(row.original)}</span>
                  <input
                    type="checkbox"
                    aria-label={selectLabel?.(row.original)}
                    checked={row.getIsSelected()}
                    onChange={(event) => row.toggleSelected(event.target.checked)}
                  />
                </td>
              )}
              {columns.map((column, index) => (
                <td key={column.id} className={cn('p-3 align-top', column.className)}>
                  {index === 0 && onOpen ? (
                    <button
                      type="button"
                      className="text-left underline-offset-4 hover:underline focus-visible:underline"
                      aria-label={openLabel?.(row.original)}
                      onClick={() => onOpen(row.original)}
                    >
                      {column.renderCell(row.original)}
                    </button>
                  ) : (
                    column.renderCell(row.original)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
