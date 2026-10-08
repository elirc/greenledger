"use client";

import type { ReactNode } from "react";
import { flexRender, type RowData } from "@tanstack/react-table";
import {
  useLegacyTable,
  getCoreRowModel,
  type LegacyColumnDef,
} from "@tanstack/react-table/legacy";
import { cn } from "cn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type DataTableColumn<TData extends RowData> = LegacyColumnDef<TData>;

/**
 * TanStack Table wrapper. On small screens, pass `renderMobileRow` to render
 * each row as a touch-friendly card; the table then only shows from `md:` up.
 * Without it, the table scrolls horizontally.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  renderMobileRow,
  onRowClick,
  emptyState,
  className,
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  renderMobileRow?: (row: TData) => ReactNode;
  onRowClick?: (row: TData) => void;
  emptyState?: ReactNode;
  className?: string;
}) {
  const table = useLegacyTable<TData>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const tableEl = (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-border bg-card",
        renderMobileRow && "hidden md:block",
        className,
      )}
    >
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(onRowClick && "cursor-pointer")}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  if (!renderMobileRow) return tableEl;

  return (
    <>
      <div className="flex flex-col gap-2 md:hidden">
        {data.map((row, i) => (
          <button
            key={i}
            type="button"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              "rounded-xl border border-border bg-card p-4 text-left",
              onRowClick && "active:bg-muted",
            )}
          >
            {renderMobileRow(row)}
          </button>
        ))}
      </div>
      {tableEl}
    </>
  );
}
